/**
 * Handler compartilhado dos endpoints de cron.
 *
 * Vive fora de `app/` para que a rota canônica (`/api/cron/sync-all`) e o alias
 * legado (`/api/cron/sync-meta`) usem exatamente o mesmo código — sem um
 * `route.ts` importando outro.
 */

import { NextResponse } from "next/server";
import prisma from "./prisma";
import { runScheduledSync } from "./scheduled-sync";
import { logError } from "./logger";

/**
 * Segredos aceitos, em ordem de conveniência para quem administra:
 *
 * 1. `cronSecret` em `SystemSettings` — gerado e trocado pelo painel, sem
 *    acesso ao servidor e sem restart.
 * 2. `CRON_SECRET` no ambiente — continua valendo para instalações que já
 *    configuraram assim.
 *
 * Os dois convivem: qualquer um que casar autoriza a batida, o que permite
 * trocar de um para o outro sem janela de indisponibilidade. Enquanto nenhum
 * dos dois existir, o endpoint fica aberto — é o estado que o painel sinaliza
 * como pendente.
 */
async function resolveAcceptedSecrets(): Promise<string[]> {
  const secrets: string[] = [];

  if (process.env.CRON_SECRET) {
    secrets.push(process.env.CRON_SECRET);
  }

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { cronSecret: true },
    });
    if (settings?.cronSecret) {
      secrets.push(settings.cronSecret);
    }
  } catch (error) {
    // Banco indisponível não pode virar "endpoint liberado": se havia um
    // segredo de ambiente ele continua exigido; se não havia, a sincronização
    // falharia adiante de qualquer forma.
    console.error("[Cron] Não foi possível ler o segredo do banco:", error);
  }

  return secrets;
}

export async function handleCronRequest(req: Request) {
  const url = new URL(req.url);

  const acceptedSecrets = await resolveAcceptedSecrets();

  if (acceptedSecrets.length > 0) {
    const authHeader = req.headers.get("authorization");
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("token");

    const authorized = acceptedSecrets.some(
      (secret) => authHeader === `Bearer ${secret}` || querySecret === secret
    );

    if (!authorized) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn(
      "[Cron] Endpoint sem segredo configurado — qualquer um com a URL pode disparar a sincronização. Gere um em Configurações › Sistema."
    );
  }

  // `?force=1` ignora o portão de intervalo — para testar o disparo na hora,
  // sem esperar a janela.
  const force = ["1", "true", "yes"].includes(
    (url.searchParams.get("force") || "").toLowerCase()
  );

  try {
    const report = await runScheduledSync({ force });

    return NextResponse.json(
      { success: report.ok, ...report },
      { status: report.ok ? 200 : 500 }
    );
  } catch (error: any) {
    console.error("[Cron] Error running sync:", error);
    await logError("CRON", error, "/api/cron/sync-all");
    return NextResponse.json(
      { success: false, status: "error", error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

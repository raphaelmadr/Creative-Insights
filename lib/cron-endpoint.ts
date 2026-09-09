/**
 * A sincronização automática: tudo que acontece quando o disparador externo
 * bate na porta.
 *
 * O disparador não decide nada — ele só acorda a aplicação. Quem decide se há
 * sincronização e com que frequência são duas configurações do painel:
 * `cronSyncEnabled` e `cronSyncInterval`. Por isso o cron do cPanel deve bater
 * com frequência alta (a cada 15 min) e é este módulo que filtra: mudar o
 * intervalo no painel passa a valer na hora, sem tocar no servidor.
 *
 * O que é sincronizado não é decidido aqui: é `runSync()`, o mesmo caminho do
 * botão manual.
 */

import { NextResponse } from "next/server";
import prisma from "./prisma";
import { runSync } from "./channels";
import { logInfo, logWarning, logError } from "./logger";

const DEFAULT_INTERVAL_MINUTES = 120;

/**
 * Segredos aceitos: o gerado pelo painel (`cronSecret`) e o `CRON_SECRET` de
 * ambiente. Os dois convivem para que trocar de um para o outro não abra
 * janela de indisponibilidade. Sem nenhum dos dois, o endpoint fica aberto — é
 * o estado que o painel sinaliza como pendente.
 */
async function acceptedSecrets(): Promise<string[]> {
  const secrets: string[] = [];
  if (process.env.CRON_SECRET) secrets.push(process.env.CRON_SECRET);

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { cronSecret: true },
    });
    if (settings?.cronSecret) secrets.push(settings.cronSecret);
  } catch (error) {
    // Banco indisponível não pode virar "endpoint liberado": se havia um
    // segredo de ambiente ele continua exigido.
    console.error("[Cron] Não foi possível ler o segredo do banco:", error);
  }

  return secrets;
}

export async function handleCronRequest(req: Request) {
  const url = new URL(req.url);
  const secrets = await acceptedSecrets();

  if (secrets.length > 0) {
    const header = req.headers.get("authorization");
    const query = url.searchParams.get("secret") || url.searchParams.get("token");
    const authorized = secrets.some((s) => header === `Bearer ${s}` || query === s);
    if (!authorized) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn(
      "[Cron] Endpoint sem segredo configurado — qualquer um com a URL pode disparar. Gere um em Configurações › Sistema."
    );
  }

  // `?force=1` ignora o portão de intervalo, para testar o disparo na hora.
  const force = ["1", "true", "yes"].includes(
    (url.searchParams.get("force") || "").toLowerCase()
  );

  try {
    // A linha de configurações é criada sob demanda: numa instalação nova o
    // painel pode nunca ter sido salvo, e o cron não pode morrer por isso.
    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });

    if (!settings.cronSyncEnabled) {
      return NextResponse.json({
        success: true,
        status: "disabled",
        message: "Sincronização automática está desativada nas configurações.",
      });
    }

    const intervalMinutes = settings.cronSyncInterval || DEFAULT_INTERVAL_MINUTES;
    const startedAt = new Date();

    if (!force) {
      // Reivindicação atômica da janela: a própria condição do UPDATE é o
      // portão. Duas batidas simultâneas — ou uma nova enquanto a anterior
      // ainda roda — não conseguem iniciar dois syncs concorrentes disputando
      // a API da Meta e as mesmas linhas do banco.
      const cutoff = new Date(startedAt.getTime() - intervalMinutes * 60 * 1000);
      const claim = await prisma.systemSettings.updateMany({
        where: {
          id: 1,
          OR: [{ lastCronSyncAt: null }, { lastCronSyncAt: { lt: cutoff } }],
        },
        data: { lastCronSyncAt: startedAt },
      });

      if (claim.count === 0) {
        const nextEligible = settings.lastCronSyncAt
          ? new Date(settings.lastCronSyncAt.getTime() + intervalMinutes * 60 * 1000)
          : null;
        return NextResponse.json({
          success: true,
          status: "skipped",
          message: "Fora da janela de intervalo.",
          nextEligibleAt: nextEligible?.toISOString() ?? null,
        });
      }
    } else {
      await prisma.systemSettings.update({
        where: { id: 1 },
        data: { lastCronSyncAt: startedAt },
      });
    }

    // Log de início, não só de fim: quando a plataforma mata a função no meio
    // (timeout de execução), o log final nunca acontece e a execução fica
    // invisível. Um "Iniciando" sem "concluído" correspondente em
    // Configurações › Logs é a assinatura exata desse corte.
    await logInfo("CRON", "Iniciando sincronização automática.", "/api/cron/sync-all");

    const report = await runSync((message, percentage) => {
      console.log(`[Cron ${percentage}%] ${message}`);
    });

    if (report.ok) {
      await logInfo("CRON", `Concluída. ${report.summary}`, "/api/cron/sync-all");
    } else {
      await logWarning("CRON", `Concluída com falhas. ${report.summary}`, "/api/cron/sync-all");
    }

    return NextResponse.json(
      {
        success: report.ok,
        status: "ran",
        message: report.summary,
        partial: report.partial,
        outcomes: report.outcomes,
        nextEligibleAt: new Date(startedAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
      },
      { status: report.ok ? 200 : 500 }
    );
  } catch (error: any) {
    console.error("[Cron] Erro ao executar a sincronização:", error);
    await logError("CRON", error, "/api/cron/sync-all");
    return NextResponse.json(
      { success: false, status: "error", error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

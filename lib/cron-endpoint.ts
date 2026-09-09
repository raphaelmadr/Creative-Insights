/**
 * Handler compartilhado dos endpoints de cron.
 *
 * Vive fora de `app/` para que a rota canônica (`/api/cron/sync-all`) e o alias
 * legado (`/api/cron/sync-meta`) usem exatamente o mesmo código — sem um
 * `route.ts` importando outro.
 */

import { NextResponse } from "next/server";
import { runScheduledSync } from "./scheduled-sync";
import { logError } from "./logger";

/**
 * Autenticação: `Authorization: Bearer <CRON_SECRET>` (preferido) ou
 * `?secret=<CRON_SECRET>` para disparadores que só aceitam colar uma URL.
 * Sem `CRON_SECRET` definido no ambiente, o endpoint fica aberto.
 */
export async function handleCronRequest(req: Request) {
  const url = new URL(req.url);

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("token");
    const authorized = authHeader === `Bearer ${secret}` || querySecret === secret;

    if (!authorized) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
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

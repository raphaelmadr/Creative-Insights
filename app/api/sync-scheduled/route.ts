import { NextResponse } from "next/server";
import { runScheduledSync } from "@/lib/scheduled-sync";
import { logError } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Disparo manual da mesma rotina que o cron executa — o botão "Testar agora"
 * do painel.
 *
 * Diferente de `/api/cron/sync-all`, esta rota fica sob a proteção de sessão do
 * middleware (só `/api/cron/*` é liberado para disparadores externos), então
 * não precisa do `CRON_SECRET`. Roda com `force`, ignorando o portão de
 * intervalo, para que o teste responda na hora.
 */
export async function POST() {
  try {
    const report = await runScheduledSync({ force: true });
    return NextResponse.json({ success: report.ok, ...report }, { status: report.ok ? 200 : 500 });
  } catch (error: any) {
    console.error("[Sync Scheduled] Error:", error);
    await logError("CRON", error, "/api/sync-scheduled");
    return NextResponse.json(
      { success: false, error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

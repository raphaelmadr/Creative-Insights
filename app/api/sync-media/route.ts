import { NextResponse } from "next/server";
import { runMetaMediaSync } from "@/lib/meta-media-sync";
import { logInfo, logError } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * A passada de mídia disparada à mão — o segundo passo do botão "Sincronizar".
 *
 * É uma rota própria, e não mais uma fonte dentro de `runSync()`, pela mesma
 * razão que existe o cron separado: métricas e mídia não cabem nos 300s de uma
 * requisição só. Somadas, elas se matavam — e quem morria era sempre a mídia,
 * que roda por último.
 *
 * Protegida pelo middleware, como as demais rotas fora de `api/cron`.
 */
export async function POST(req: Request) {
  await logInfo("SYNC", "Iniciando sincronização de mídia (manual).", "/api/sync-media");

  try {
    const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;

    const report = await runMetaMediaSync((message, percentage) => {
      console.log(`[Mídia ${percentage}%] ${message}`);
    }, { limit });

    const summary =
      `${report.coversUploaded} artes salvas, ${report.videoLinksRenewed} links de vídeo renovados` +
      (report.failed > 0 ? `, ${report.failed} falharam` : "") +
      (report.remaining > 0 ? ` — ${report.remaining} ainda na fila` : "");

    await logInfo("SYNC", `Concluída mídia (manual). ${summary}`, "/api/sync-media");

    return NextResponse.json({ success: true, summary, report });
  } catch (error) {
    await logError("SYNC", error, "/api/sync-media");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

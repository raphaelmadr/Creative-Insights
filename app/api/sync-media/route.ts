import { NextResponse } from "next/server";
import { describeMediaReport, runMetaMediaSync } from "@/lib/meta-media-sync";
import { logInfo, logWarning, logError } from "@/lib/logger";

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

    const described = describeMediaReport(report);

    if (described.ok) {
      await logInfo("SYNC", `Concluída mídia (manual). ${described.text}`, "/api/sync-media");
    } else {
      await logWarning("SYNC", `Concluída mídia com falhas (manual). ${described.text}`, "/api/sync-media");
    }

    return NextResponse.json({
      success: true,
      summary: described.text,
      mediaOk: described.ok,
      report,
    });
  } catch (error) {
    await logError("SYNC", error, "/api/sync-media");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

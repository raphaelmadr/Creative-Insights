import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-endpoint";
import { describeMediaReport, runMetaMediaSync } from "@/lib/meta-media-sync";
import { logInfo, logWarning, logError } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * A porta do cron da mídia — separada da porta do sync de métricas.
 *
 * São dois crons porque são duas corridas contra o mesmo relógio. Com tudo numa
 * rota só, os 180s da Meta eram gastos em insights e na enumeração dos 13 mil
 * anúncios da conta, e a fase de mídia nunca começava: 100 execuções iniciadas
 * contra 2 concluídas, e as duas relatando "0 criativos". Aqui a mídia tem os
 * 300s inteiros e não disputa com ninguém.
 *
 * A cadência é a do cron externo, sem portão de intervalo no banco: diferente do
 * `/api/cron/sync-all`, este endpoint não tem uma configuração de frequência no
 * painel para respeitar. Aponte-o a cada 30 minutos no cPanel.
 */
async function handle(req: Request) {
  if (!(await isCronRequestAuthorized(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Log de início, não só de fim: quando a plataforma mata a função no meio, o
  // log final nunca acontece, e um "Iniciando" órfão em Configurações › Logs é
  // a única assinatura desse corte.
  await logInfo("CRON", "Iniciando sincronização de mídia.", "/api/cron/sync-media");

  try {
    // `?limit=N` reduz o teto de peças da execução — para verificar o caminho
    // completo sem gastar cota da hospedagem com um lote inteiro.
    const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;

    const report = await runMetaMediaSync(
      (message, percentage) => {
        console.log(`[Cron mídia ${percentage}%] ${message}`);
      },
      { limit }
    );

    // Mesmo texto das outras duas portas: três versões da mesma frase divergiam.
    const described = describeMediaReport(report);

    if (described.ok) {
      await logInfo("CRON", `Concluída mídia. ${described.text}`, "/api/cron/sync-media");
    } else {
      await logWarning("CRON", `Concluída mídia com falhas. ${described.text}`, "/api/cron/sync-media");
    }

    return NextResponse.json({
      success: true,
      status: "ok",
      summary: described.text,
      mediaOk: described.ok,
      report,
    });
  } catch (error) {
    await logError("CRON", error, "/api/cron/sync-media");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

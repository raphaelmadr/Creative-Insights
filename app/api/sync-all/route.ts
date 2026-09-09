import { runSync } from "@/lib/channels";
import { logError } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Sincronização manual — o botão "Sincronizar Redes".
 *
 * Executa `runSync()`, exatamente a mesma rotina da sincronização automática:
 * todas as fontes configuradas, mesma profundidade, mês corrente. A única
 * diferença entre as duas é o gatilho e o streaming de progresso daqui.
 */
export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          // Cliente desconectou — o sync continua e o progresso já foi salvo.
        }
      };

      try {
        const report = await runSync((message, percentage, source) => {
          send({ type: "progress", message, percentage, source });
        });

        if (report.ok) {
          send({
            type: "complete",
            message: report.partial
              ? `Sincronização parcial (teto de tempo). ${report.summary}`
              : `Sincronização concluída. ${report.summary}`,
            percentage: 100,
            partial: report.partial,
            outcomes: report.outcomes,
          });
        } else {
          // Falha de fonte é reportada como erro — não pode ser mascarada por sucesso.
          const failed = report.outcomes.filter((o) => !o.ok).map((o) => o.label);
          send({
            type: "error",
            error: `Falha em: ${failed.join(", ")}. ${report.summary}`,
            percentage: 100,
            outcomes: report.outcomes,
          });
        }
      } catch (error: any) {
        console.error("Sync Error:", error);
        await logError("BACKEND_SYNC", error, "/api/sync-all");
        send({ type: "error", error: error?.message || "Erro desconhecido", percentage: 100 });
      } finally {
        try {
          controller.close();
        } catch {
          // Já fechado pelo cliente.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

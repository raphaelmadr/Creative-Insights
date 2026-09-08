import { runAllChannelSyncs, summarizeOutcomes } from "@/lib/channels";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Sincronização de todos os canais configurados.
 *
 * Esta é a rota que o botão "Sincronizar Redes" usa. Ela sempre roda em modo
 * profundo (`full`) e sempre sobre o mês corrente — mídias de criativos estáticos
 * são persistidas e os links de vídeo renovados em toda execução.
 */
export async function POST(req: Request) {
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
        const { outcomes, ok } = await runAllChannelSyncs("full", (message, percentage, channel) => {
          send({ type: "progress", message, percentage, channel });
        });

        const summary = summarizeOutcomes(outcomes);

        if (ok) {
          const partial = outcomes.some((outcome) => outcome.reachedLimit);
          send({
            type: "complete",
            message: partial
              ? `Sincronização parcial (teto de tempo). ${summary}`
              : `Sincronização concluída. ${summary}`,
            percentage: 100,
            partial,
            outcomes,
          });
        } else {
          // Falha de canal é reportada como erro — não pode ser mascarada por sucesso.
          const failed = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.label);
          send({
            type: "error",
            error: `Falha em: ${failed.join(", ")}. ${summary}`,
            percentage: 100,
            outcomes,
          });
        }
      } catch (error: any) {
        console.error("Sync All Error:", error);
        try {
          const { logError } = await import("@/lib/logger");
          logError("BACKEND_SYNC", error, "/api/sync-all");
        } catch {
          // logging é best-effort
        }
        send({ type: "error", error: error?.message || "Erro desconhecido durante a sincronização.", percentage: 100 });
      } finally {
        try {
          controller.close();
        } catch {
          // já fechado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

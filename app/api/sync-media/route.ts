import { describeMediaReport, runMetaMediaSync } from "@/lib/meta-media-sync";
import { logInfo, logWarning, logError } from "@/lib/logger";
import { friendlyFailureMessage } from "@/lib/external-log";

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
 * Responde em NDJSON, como `/api/sync-all`, e pelo mesmo motivo: a Cloudflare
 * corta a conexão depois de ~100s sem receber byte algum da origem. Esta rota
 * era um JSON só no fim, depois de minutos de silêncio — ou seja, a queda era
 * garantida, e o que chegava ao navegador não era o resultado, era o erro da
 * CDN. De quebra, a tela agora mostra o andamento em vez de uma frase parada.
 *
 * Protegida pelo middleware, como as demais rotas fora de `api/cron`.
 */
export async function POST(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          // Cliente desconectou — a passada continua e o que salvou está salvo.
        }
      };

      const batida = setInterval(() => send({ type: "ping" }), 15_000);

      await logInfo("SYNC", "Iniciando sincronização de mídia (manual).", "/api/sync-media");

      try {
        const report = await runMetaMediaSync(
          (message, percentage) => send({ type: "progress", message, percentage }),
          { limit }
        );

        const described = describeMediaReport(report);

        if (described.ok) {
          await logInfo("SYNC", `Concluída mídia (manual). ${described.text}`, "/api/sync-media");
        } else {
          await logWarning("SYNC", `Concluída mídia com falhas (manual). ${described.text}`, "/api/sync-media");
        }

        /*
         * Mídia com falha chega como `complete`, não como `error`: as métricas
         * já entraram e a arte que faltou não as invalida. Quem decide o tom do
         * aviso é o cliente, olhando `mediaOk`.
         */
        send({
          type: "complete",
          message: described.text,
          percentage: 100,
          summary: described.text,
          mediaOk: described.ok,
        });
      } catch (error) {
        await logError("SYNC", error, "/api/sync-media");
        send({
          type: "error",
          // A fase de mídia fala só com a Meta: o que falha aqui é dela, e vai
          // para a tela traduzido. O cru já foi para o log, na linha acima.
          error: friendlyFailureMessage([{ service: "Meta Ads", error }]),
          percentage: 100,
        });
      } finally {
        clearInterval(batida);
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

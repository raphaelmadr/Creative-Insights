import { runSync } from "@/lib/channels";
import { logError, logInfo, logWarning } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { withSyncLock } from "@/lib/sync-lock";
import { formatRelative } from "@/lib/sync-status";

/*
 * Sem `maxDuration`: ele era a declaração do teto da função serverless, e
 * aqui nada corta a execução por tempo. A sincronização roda até terminar.
 */
export const dynamic = "force-dynamic";

/**
 * Sincronização manual — o botão "Sincronizar Redes".
 *
 * Executa `runSync()`, exatamente a mesma rotina da sincronização automática:
 * todas as fontes configuradas, mesma profundidade, mês corrente. A única
 * diferença entre as duas é o gatilho e o streaming de progresso daqui.
 *
 * Uma execução por vez em toda a instalação — ver `lib/sync-lock.ts`. A trava
 * é do servidor de propósito: o botão desabilitado na tela é conveniência, e
 * chega atrasado para quem clicou no mesmo segundo em outro computador.
 */
export async function POST() {
  const encoder = new TextEncoder();
  const user = await getCurrentUser();
  const quem = user?.name?.trim() || user?.email || "Alguém";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          // Cliente desconectou — o sync continua e o progresso já foi salvo.
        }
      };

      /*
       * Batida de vida, a cada 15s.
       *
       * O site está atrás da Cloudflare, que derruba a conexão quando a origem
       * passa ~100s sem mandar byte nenhum. O progresso daqui é irregular por
       * natureza — uma fonte pode ficar minutos buscando na API da rede antes
       * de ter o que reportar — e era nesses silêncios que o navegador recebia
       * "network error" no meio da leitura. O servidor seguia sincronizando,
       * sozinho, e terminava sem ninguém para contar: o erro na tela não
       * correspondia a nada no log, porque nada tinha falhado.
       *
       * O cliente ignora o que não souber ler, então este quadro não aparece
       * na barra de progresso — ele só mantém a linha ocupada.
       */
      const batida = setInterval(() => send({ type: "ping" }), 15_000);

      try {
        await withSyncLock(
          quem,
          async () => {
            await logInfo("SYNC", `Iniciando sincronização manual (${quem}).`, "/api/sync-all");

            const report = await runSync((message, percentage, source) => {
              send({ type: "progress", message, percentage, source });
            });

            /*
             * O RESUMO VAI PARA O LOG, e só o veredito vai para a tela.
             *
             * O resumo é uma frase de três linhas — contagens por fonte, quantos
             * dias do mês couberam na passada, quantas artes subiram. Ela cabe
             * num registro que se lê com calma; não cabe num aviso flutuante,
             * onde virava um parágrafo que ninguém termina de ler e que some
             * sozinho em seis segundos. Quem quiser o detalhe abre
             * Configurações › Logs, onde ele fica.
             */
            if (report.nothingConfigured) {
              // Nada configurado é informação, não falha: o aviso diz o que fazer.
              await logWarning("SYNC", report.summary, "/api/sync-all");
              send({
                type: "complete",
                outcome: "nothing-configured",
                message: report.summary,
                percentage: 100,
                partial: true,
                outcomes: [],
              });
            } else if (report.ok) {
              const prefixo = report.partial
                ? "Concluída parcial (teto de tempo)."
                : "Concluída.";
              await logInfo("SYNC", `${prefixo} ${report.summary}`, "/api/sync-all");
              send({
                type: "complete",
                outcome: report.partial ? "partial" : "ok",
                message: report.summary,
                percentage: 100,
                partial: report.partial,
                outcomes: report.outcomes,
              });
            } else {
              // Falha de fonte é reportada como erro — não pode ser mascarada por sucesso.
              const failed = report.outcomes.filter((o) => !o.ok).map((o) => o.label);
              await logWarning(
                "SYNC",
                `Concluída com falhas em ${failed.join(", ")}. ${report.summary}`,
                "/api/sync-all"
              );
              send({
                type: "error",
                outcome: "failed",
                error: `Falha em: ${failed.join(", ")}.`,
                percentage: 100,
                outcomes: report.outcomes,
              });
            }
          },
          (holder) => {
            /*
             * Já há uma execução em curso. Não é erro, e não vira log: é o
             * sistema fazendo o que deve. A tela só precisa dizer de quem se
             * está esperando.
             */
            send({
              type: "busy",
              holder: holder.by,
              since: holder.startedAt,
              message: `${holder.by} começou uma sincronização ${formatRelative(holder.startedAt) ?? "agora"}.`,
              percentage: 100,
            });
          }
        );
      } catch (error: any) {
        console.error("Sync Error:", error);
        await logError("BACKEND_SYNC", error, "/api/sync-all");
        send({ type: "error", error: error?.message || "Erro desconhecido", percentage: 100 });
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

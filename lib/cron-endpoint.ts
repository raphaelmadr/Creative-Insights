/**
 * A sincronização automática: tudo que acontece quando o disparador externo
 * bate na porta.
 *
 * O disparador não decide nada — ele só acorda a aplicação. Quem decide se há
 * sincronização e com que frequência são duas configurações do painel:
 * `cronSyncEnabled` e `cronSyncInterval`. Por isso o cron do cPanel deve bater
 * com frequência alta (a cada 3 min) e é este módulo que filtra: mudar o
 * intervalo no painel passa a valer na hora, sem tocar no servidor.
 *
 * Sem segredo, de propósito
 * --------------------------
 * O endpoint já não exige `Authorization`. Batida sem credencial não é o mesmo
 * que batida sem controle: toda batida cai no mesmo portão de intervalo abaixo
 * — a esmagadora maioria simplesmente responde "fora da janela" sem tocar em
 * API nenhuma. O único jeito de forçar trabalho fora da janela é `?force=1`,
 * que continua existindo para teste manual e agora é a única porta que vale a
 * pena vigiar caso este endpoint seja descoberto por alguém de fora.
 *
 * O que é sincronizado não é decidido aqui: é `runSync()`, o mesmo caminho do
 * botão manual.
 *
 * Uma batida, o trabalho inteiro
 * ------------------------------
 * Por um tempo as passadas de métricas e de mídia foram ALTERNADAS — uma batida
 * trazia os números, a seguinte as artes. A razão era a plataforma: uma
 * requisição morria em 300s (`maxDuration`) e as duas somadas não cabiam.
 * Fora dela nada corta a execução por tempo, e alternar passou a significar
 * apenas que metade do trabalho esperava um intervalo inteiro sem motivo.
 *
 * Hoje cada batida elegível faz as duas, em sequência, sob a mesma trava. O
 * portão é uma janela só (`lastCronSyncAt`); `lastMediaSyncAt` continua sendo
 * carimbado, mas já não governa nada — é informação de tela.
 *
 * Uma execução por vez, em toda a instalação: a trava de `lib/sync-lock.ts` é a
 * mesma que o botão manual usa, então uma batida nunca roda por cima de um
 * clique — e, quando perde a trava, ela sai sem reivindicar a janela, para não
 * queimar o ciclo.
 */

import { NextResponse } from "next/server";
import prisma from "./prisma";
import { runSync } from "./channels";
import { describeMediaReport, runMetaMediaSync } from "./meta-media-sync";
import { logInfo, logWarning, logError } from "./logger";
import { AUTOMATIC_HOLDER, acquireSyncLock, releaseSyncLock, renewSyncLock } from "./sync-lock";

const DEFAULT_INTERVAL_MINUTES = 120;

/**
 * Folga do portão de intervalo.
 *
 * O portão exigia que a passada anterior fosse *estritamente* mais velha que
 * `agora - intervalo`. Um disparador que bate no mesmo passo do intervalo chega
 * alguns segundos "cedo" — o relógio do cron não é o relógio do banco — e era
 * recusado por essa diferença, empurrando a passada para a batida seguinte. O
 * atraso não se dissolvia: virava o novo carimbo e adiava a batida seguinte de
 * novo. Um intervalo de 30 min entregava uma passada a cada 45.
 *
 * Um minuto de folga absorve essa variação e custa, no pior caso, um intervalo
 * de 29 min em vez de 30.
 */
const CLAIM_TOLERANCE_MS = 60 * 1000;

export async function handleCronRequest(req: Request) {
  const url = new URL(req.url);

  // `?force=1` ignora o portão de intervalo, para testar o disparo na hora.
  const force = ["1", "true", "yes"].includes(
    (url.searchParams.get("force") || "").toLowerCase()
  );

  try {
    const startedAt = new Date();

    /*
     * A linha de configurações é criada sob demanda: numa instalação nova o
     * painel pode nunca ter sido salvo, e o cron não pode morrer por isso.
     *
     * O mesmo `upsert` carimba a batida. Antes daqui só existe a leitura da
     * URL, então este carimbo significa exatamente "o disparador chegou" —
     * independente de rodar passada, de estar fora da janela ou de a
     * sincronização estar desligada no painel. É o único sinal que prova que
     * o cadastro no cPanel está de pé.
     */
    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { lastCronPingAt: startedAt },
      create: { id: 1, lastCronPingAt: startedAt },
    });

    if (!settings.cronSyncEnabled) {
      return NextResponse.json({
        success: true,
        status: "disabled",
        message: "Sincronização automática está desativada nas configurações.",
      });
    }

    const intervalMinutes = settings.cronSyncInterval || DEFAULT_INTERVAL_MINUTES;
    const cutoff = new Date(
      startedAt.getTime() - intervalMinutes * 60 * 1000 + CLAIM_TOLERANCE_MS
    );

    /*
     * Reivindicação atômica da janela: a própria condição do UPDATE é o portão.
     * Duas batidas simultâneas — ou uma nova enquanto a anterior ainda roda —
     * não conseguem iniciar duas passadas concorrentes disputando a API da Meta
     * e as mesmas linhas do banco.
     */
    const claim = async (field: "lastCronSyncAt" | "lastMediaSyncAt") => {
      const result = await prisma.systemSettings.updateMany({
        where: { id: 1, OR: [{ [field]: null }, { [field]: { lt: cutoff } }] },
        data: { [field]: startedAt },
      });
      return result.count > 0;
    };

    /*
     * A TRAVA GLOBAL, antes da janela.
     *
     * A reivindicação da janela, logo abaixo, protege as batidas umas das
     * outras — mas não protege de um clique manual, que entra por outra rota.
     * Sem esta trava, uma pessoa clicando "Sincronizar Redes" e uma batida do
     * cron caindo no mesmo minuto rodavam duas varreduras simultâneas contra a
     * mesma conta da Meta.
     *
     * A ordem importa: a trava vem PRIMEIRO porque a reivindicação da janela é
     * destrutiva — ela carimba o horário e queima o ciclo. Reivindicar e só
     * então descobrir que há um sync manual em curso custaria a passada inteira,
     * que só voltaria a ser elegível um intervalo depois.
     */
    const lock = await acquireSyncLock(AUTOMATIC_HOLDER);
    if (!lock.ok) {
      return NextResponse.json({
        success: true,
        status: "busy",
        message: `Uma sincronização de ${lock.holder.by} já está em curso; esta batida não fez nada.`,
        holder: lock.holder,
      });
    }

    /*
     * Sinal de vida enquanto a passada roda: sem ele a trava expira em 90s e
     * outra batida entraria por cima de uma execução que só começou.
     */
    const batimento = setInterval(() => {
      renewSyncLock(lock.token).catch(() => {
        // O prazo de 90s cobre várias perdas seguidas.
      });
    }, 20_000);

    try {
    /*
     * UMA batida, o trabalho INTEIRO: métricas e depois mídia.
     *
     * Elas eram alternadas — uma batida trazia os números, a seguinte as artes —
     * e a razão estava escrita no topo deste arquivo: "uma requisição morre em
     * 300s". Era o teto da função serverless, e as duas passadas somadas não
     * cabiam nele. Fora daquela plataforma nada corta a execução por tempo, e
     * alternar passou a significar apenas que metade do trabalho espera um
     * intervalo inteiro sem motivo.
     *
     * `?job=` continua forçando uma das duas, para testar uma isolada.
     */
    const requested = (url.searchParams.get("job") || "").toLowerCase();
    const soMetricas = requested === "metrics";
    const soMidia = requested === "media";

    /*
     * Uma janela só, guardada em `lastCronSyncAt`.
     *
     * `lastMediaSyncAt` continua sendo carimbado ao fim da mídia: ele não
     * governa mais nada, mas é o que a tela usa para dizer quando as artes
     * foram atualizadas pela última vez.
     */
    if (!force && !(await claim("lastCronSyncAt"))) {
      const dueAt = settings.lastCronSyncAt
        ? new Date(settings.lastCronSyncAt.getTime() + intervalMinutes * 60 * 1000)
        : null;
      return NextResponse.json({
        success: true,
        status: "skipped",
        message: "Fora da janela de intervalo.",
        nextEligibleAt: dueAt?.toISOString() ?? null,
      });
    }

    if (force) {
      await prisma.systemSettings.update({
        where: { id: 1 },
        data: { lastCronSyncAt: startedAt },
      });
    }

    // Log de início, não só de fim: uma execução interrompida no meio (queda,
    // reinício do servidor) não escreve o log final, e um "Iniciando" sem
    // "Concluída" correspondente em Configurações › Logs é a assinatura disso.
    await logInfo("CRON", "Iniciando sincronização automática.", "/api/cron/sync-all");

    const partes: string[] = [];
    let tudoOk = true;
    let parcial = false;
    let metricsReport: Awaited<ReturnType<typeof runSync>> | null = null;

    // --- Métricas e criativos ---
    if (!soMidia) {
      metricsReport = await runSync((message, percentage) => {
        console.log(`[Cron ${percentage}%] ${message}`);
      });

      partes.push(metricsReport.summary);
      parcial = parcial || metricsReport.partial;

      // Falta de credencial não é erro de execução: vira aviso e responde 200,
      // para o disparador do cPanel não enviar e-mail de falha a cada batida
      // por causa de uma configuração incompleta.
      if (!metricsReport.ok && !metricsReport.nothingConfigured) tudoOk = false;
    }

    // --- Artes, capas e renovação do link de vídeo ---
    if (!soMetricas) {
      const media = await runMetaMediaSync((message, percentage) => {
        console.log(`[Cron mídia ${percentage}%] ${message}`);
      });

      const described = describeMediaReport(media);
      partes.push(described.text);
      parcial = parcial || media.reachedLimit;
      // Falha de gravação não invalida as métricas que já entraram — muda o
      // nível do log, não o sucesso da batida.
      if (!described.ok) tudoOk = false;

      await prisma.systemSettings.update({
        where: { id: 1 },
        data: { lastMediaSyncAt: new Date() },
      });
    }

    const summary = partes.join(" · ");
    const nadaConfigurado = !!metricsReport?.nothingConfigured;

    if (nadaConfigurado) {
      await logWarning("CRON", summary, "/api/cron/sync-all");
    } else if (tudoOk && !parcial) {
      await logInfo("CRON", `Concluída. ${summary}`, "/api/cron/sync-all");
    } else if (tudoOk) {
      await logInfo("CRON", `Concluída parcial. ${summary}`, "/api/cron/sync-all");
    } else {
      await logWarning("CRON", `Concluída com falhas. ${summary}`, "/api/cron/sync-all");
    }

    return NextResponse.json(
      {
        success: tudoOk,
        status: nadaConfigurado ? "nothing-configured" : "ran",
        message: summary,
        partial: parcial,
        outcomes: metricsReport?.outcomes ?? [],
        nextEligibleAt: new Date(startedAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
      },
      { status: tudoOk ? 200 : 500 }
    );
    } finally {
      // Solta a trava aconteça o que acontecer — inclusive nos retornos de
      // "fora da janela", que saem daqui por `return` sem ter rodado nada.
      clearInterval(batimento);
      await releaseSyncLock(lock.token);
    }
  } catch (error: any) {
    console.error("[Cron] Erro ao executar a sincronização:", error);
    await logError("CRON", error, "/api/cron/sync-all");
    return NextResponse.json(
      { success: false, status: "error", error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

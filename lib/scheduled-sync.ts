/**
 * Execução automática da sincronização — o que roda quando o disparador
 * externo (Cron Job do cPanel) "bate na porta" do endpoint.
 *
 * O disparador não decide nada: ele apenas acorda a aplicação. Quem decide se
 * há sincronização, com que frequência e em que profundidade são as
 * configurações do painel (`SystemSettings`). Por isso o gatilho externo deve
 * bater com frequência alta (a cada 15 min) e este módulo é que filtra.
 *
 * O portão de intervalo é uma única UPDATE condicional: se duas batidas
 * chegarem juntas — ou se uma nova chegar enquanto a anterior ainda roda —
 * apenas uma consegue reivindicar a janela. Sem isso, dois syncs concorrentes
 * atacariam a API da Meta ao mesmo tempo e disputariam as mesmas linhas.
 */

import prisma from "./prisma";
import {
  getConfiguredChannels,
  runAllChannelSyncs,
  summarizeOutcomes,
  type ChannelOutcome,
  type SyncMode,
} from "./channels";
import { isSlackConfigured, runSlackSync, summarizeSlackResult, type SlackSyncResult } from "./slack-sync";
import { logError, logInfo, logWarning } from "./logger";

export const DEFAULT_CRON_INTERVAL_MINUTES = 120;

export type ScheduledSyncStatus =
  /** Sincronizou (com ou sem falha parcial de fonte). */
  | "ran"
  /** Desligado no painel. */
  | "disabled"
  /** Ainda dentro do intervalo configurado, ou execução anterior em andamento. */
  | "skipped"
  /** Nenhuma fonte com credenciais cadastradas. */
  | "no-source";

export interface ScheduledSyncReport {
  status: ScheduledSyncStatus;
  ok: boolean;
  message: string;
  mode: SyncMode;
  intervalMinutes: number;
  startedAt?: string;
  finishedAt?: string;
  nextEligibleAt?: string;
  channels: ChannelOutcome[];
  slack?: { ok: boolean; error?: string } & Partial<SlackSyncResult>;
}

interface RunOptions {
  /** Ignora o portão de intervalo. Usado pelo disparo manual de teste. */
  force?: boolean;
  onProgress?: (message: string, percentage: number) => void;
}

export async function runScheduledSync(options: RunOptions = {}): Promise<ScheduledSyncReport> {
  const { force = false, onProgress } = options;
  const report = (message: string, percentage: number) => {
    console.log(`[Cron ${percentage}%] ${message}`);
    onProgress?.(message, percentage);
  };

  // A linha de configurações é criada sob demanda: numa instalação nova o painel
  // pode nunca ter sido salvo, e o cron não pode morrer por causa disso.
  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const mode: SyncMode = settings.cronSyncMode === "full" ? "full" : "metrics";
  const intervalMinutes = settings.cronSyncInterval || DEFAULT_CRON_INTERVAL_MINUTES;

  const base = { mode, intervalMinutes, channels: [] as ChannelOutcome[] };

  if (!settings.cronSyncEnabled) {
    return {
      ...base,
      status: "disabled",
      ok: true,
      message: "Sincronização automática está desativada nas configurações.",
    };
  }

  // Nenhuma fonte configurada não é motivo para consumir a janela de intervalo.
  const adChannels = await getConfiguredChannels();
  const slackEnabled = isSlackConfigured(settings);

  if (adChannels.length === 0 && !slackEnabled) {
    await logWarning(
      "CRON",
      "Sync automático acionado, mas nenhuma fonte tem credenciais cadastradas (Meta, TikTok ou Slack).",
      "/api/cron/sync-all"
    );
    return {
      ...base,
      status: "no-source",
      ok: false,
      message:
        "Nenhuma fonte configurada. Cadastre as credenciais da Meta, do TikTok e/ou do Slack em Configurações.",
    };
  }

  const previousClaim = settings.lastCronSyncAt;
  const startedAt = new Date();

  if (!force) {
    const cutoff = new Date(startedAt.getTime() - intervalMinutes * 60 * 1000);

    // Reivindicação atômica da janela: a própria condição do UPDATE é o portão,
    // então duas batidas simultâneas não conseguem passar as duas.
    const claim = await prisma.systemSettings.updateMany({
      where: {
        id: 1,
        OR: [{ lastCronSyncAt: null }, { lastCronSyncAt: { lt: cutoff } }],
      },
      data: { lastCronSyncAt: startedAt },
    });

    if (claim.count === 0) {
      const nextEligible = previousClaim
        ? new Date(previousClaim.getTime() + intervalMinutes * 60 * 1000)
        : undefined;
      const remaining = nextEligible
        ? Math.max(0, Math.round((nextEligible.getTime() - Date.now()) / 60000))
        : 0;

      return {
        ...base,
        status: "skipped",
        ok: true,
        message: `Fora da janela. Próxima execução elegível em ~${remaining} min.`,
        nextEligibleAt: nextEligible?.toISOString(),
      };
    }
  } else {
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: { lastCronSyncAt: startedAt },
    });
  }

  // Log de início, não só de fim: quando a plataforma mata a função no meio
  // (timeout de execução), o log final nunca acontece e a execução fica
  // invisível — foi exatamente o que escondeu as primeiras execuções, que
  // gravaram métricas e morreram antes de reportar. Um início sem fim
  // correspondente é o sintoma a procurar em Configurações › Logs.
  await logInfo(
    "CRON",
    `Iniciando sync automático. Modo: ${mode}. Fontes: ${[
      ...adChannels.map((c) => c.label),
      ...(slackEnabled ? ["Slack"] : []),
    ].join(", ")}.`,
    "/api/cron/sync-all"
  );

  // Daqui em diante a janela é nossa. Cada fonte é isolada: uma que falha não
  // impede as outras, e nenhuma falha passa silenciosa.
  const channelOutcomes: ChannelOutcome[] = [];
  let slackReport: ScheduledSyncReport["slack"];

  const slackWeight = slackEnabled ? 20 : 0;
  const channelWeight = 100 - slackWeight;

  if (adChannels.length > 0) {
    report(`Iniciando canais de anúncios. Modo: ${mode}`, 0);
    try {
      const { outcomes } = await runAllChannelSyncs(mode, (message, percentage) => {
        report(message, Math.round((percentage / 100) * channelWeight));
      });
      channelOutcomes.push(...outcomes);
    } catch (error: any) {
      // runAllChannelSyncs só lança quando não há canal algum — já tratado
      // acima — mas um erro inesperado aqui não pode derrubar o Slack.
      console.error("[Cron] Falha na orquestração dos canais:", error);
      await logError("CRON", error, "/api/cron/sync-all");
    }
  }

  if (slackEnabled) {
    report("Sincronizando entregas do Slack...", channelWeight);
    try {
      const result = await runSlackSync({}, (message, percentage) => {
        report(message, channelWeight + Math.round((percentage / 100) * slackWeight));
      });
      slackReport = { ok: true, ...result };
    } catch (error: any) {
      console.error("[Cron] Sincronização do Slack falhou:", error);
      slackReport = { ok: false, error: error?.message || "Erro desconhecido" };
    }
  }

  const finishedAt = new Date();
  const ok = channelOutcomes.every((outcome) => outcome.ok) && slackReport?.ok !== false;

  const summary = [
    channelOutcomes.length > 0 ? summarizeOutcomes(channelOutcomes) : null,
    slackReport?.ok ? summarizeSlackResult(slackReport as SlackSyncResult) : null,
    slackReport?.ok === false ? `Slack: falhou (${slackReport.error})` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Uma janela que falhou por completo é devolvida, para que a próxima batida
  // tente de novo em vez de esperar o intervalo inteiro.
  const totalFailure =
    !ok && channelOutcomes.every((o) => !o.ok) && slackReport?.ok !== true;

  if (totalFailure && !force) {
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: { lastCronSyncAt: previousClaim },
    });
  }

  report(`Sync finalizado. ${summary}`, 100);

  if (ok) {
    await logInfo("CRON", `Sync automático concluído (${mode}). ${summary}`, "/api/cron/sync-all");
  } else {
    await logWarning(
      "CRON",
      `Sync automático concluído com falhas (${mode}). ${summary}`,
      "/api/cron/sync-all"
    );
  }

  return {
    ...base,
    status: "ran",
    ok,
    message: summary || "Nada a sincronizar.",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    nextEligibleAt: new Date(startedAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
    channels: channelOutcomes,
    slack: slackReport,
  };
}

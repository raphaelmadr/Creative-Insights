/**
 * Registro de canais de anúncios.
 *
 * O orquestrador antigo tinha Meta e TikTok fixos no cliente, disparados em
 * `Promise.all` — os dois escreviam na mesma barra de progresso e o erro do
 * TikTok era engolido, de modo que a sincronização se declarava bem-sucedida
 * mesmo quando um canal falhava por completo.
 *
 * Aqui os canais são declarativos: quem tiver credenciais configuradas entra na
 * execução, um por vez, cada um com sua fatia de progresso e seu próprio
 * resultado reportado.
 */

import prisma from "./prisma";
import { runMetaSync } from "./meta-sync";
import { runTikTokSync } from "./tiktok-sync";

export type ChannelId = "META" | "TIKTOK";

export type SyncMode = "full" | "metrics";

export interface ChannelRunResult {
  syncedAds: number;
  syncedMetrics: number;
  reachedLimit: boolean;
}

export interface ChannelOutcome extends ChannelRunResult {
  channel: ChannelId;
  label: string;
  ok: boolean;
  error?: string;
}

type SettingsRow = Awaited<ReturnType<typeof prisma.systemSettings.findUnique>>;

interface ChannelDefinition {
  id: ChannelId;
  label: string;
  /** Um canal só entra na execução quando tem credenciais utilizáveis. */
  isConfigured(settings: SettingsRow): boolean;
  run(
    mode: SyncMode,
    onProgress: (message: string, percentage: number) => void,
    month?: number,
    year?: number
  ): Promise<ChannelRunResult>;
}

export const CHANNELS: ChannelDefinition[] = [
  {
    id: "META",
    label: "Meta",
    isConfigured: (settings) =>
      !!(settings?.metaAdAccountId || process.env.META_AD_ACCOUNT_ID) &&
      !!(settings?.metaAccessToken || process.env.META_ACCESS_TOKEN),
    run: (mode, onProgress, month, year) => runMetaSync(mode, onProgress, month, year),
  },
  {
    id: "TIKTOK",
    label: "TikTok",
    isConfigured: (settings) => !!settings?.tiktokAdvertiserId && !!settings?.tiktokAccessToken,
    run: async (mode, onProgress, month, year) => {
      const result = await runTikTokSync(mode, onProgress, month, year);
      return {
        syncedAds: result.syncedAds,
        syncedMetrics: result.syncedMetrics,
        reachedLimit: result.reachedLimit,
      };
    },
  },
];

export async function getConfiguredChannels(): Promise<ChannelDefinition[]> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  return CHANNELS.filter((channel) => channel.isConfigured(settings));
}

/**
 * Executa todos os canais configurados, em série.
 *
 * Em série, e não em paralelo, por três motivos: o progresso passa a ser legível,
 * os limites de taxa das APIs não competem entre si, e o teto de tempo de cada
 * canal fica previsível.
 */
export async function runAllChannelSyncs(
  mode: SyncMode,
  onProgress?: (message: string, percentage: number, channel?: ChannelId) => void,
  targetMonth?: number,
  targetYear?: number
): Promise<{ outcomes: ChannelOutcome[]; ok: boolean }> {
  const channels = await getConfiguredChannels();

  if (channels.length === 0) {
    throw new Error(
      "Nenhum canal configurado. Cadastre as credenciais da Meta e/ou do TikTok em Configurações."
    );
  }

  const outcomes: ChannelOutcome[] = [];
  const slice = 100 / channels.length;

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const base = i * slice;

    const report = (message: string, percentage: number) => {
      const overall = Math.min(100, Math.round(base + (percentage / 100) * slice));
      onProgress?.(`[${channel.label}] ${message}`, overall, channel.id);
    };

    try {
      report("Iniciando...", 0);
      const result = await channel.run(mode, report, targetMonth, targetYear);
      outcomes.push({ channel: channel.id, label: channel.label, ok: true, ...result });
    } catch (error: any) {
      // Um canal que falha não pode derrubar os demais — nem passar despercebido.
      console.error(`[Sync] Canal ${channel.label} falhou:`, error);
      outcomes.push({
        channel: channel.id,
        label: channel.label,
        ok: false,
        error: error?.message || "Erro desconhecido",
        syncedAds: 0,
        syncedMetrics: 0,
        reachedLimit: false,
      });
      onProgress?.(`[${channel.label}] Falhou: ${error?.message || "erro desconhecido"}`, Math.round(base + slice), channel.id);
    }
  }

  const ok = outcomes.every((outcome) => outcome.ok);

  if (ok && !outcomes.some((outcome) => outcome.reachedLimit)) {
    const finishedAt = new Date();
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: {
        lastSyncAt: finishedAt,
        ...(mode === "full" ? { lastDeepSyncAt: finishedAt } : { lastFastSyncAt: finishedAt }),
      },
    });
  }

  return { outcomes, ok };
}

/** Resumo curto para toast/log. */
export function summarizeOutcomes(outcomes: ChannelOutcome[]): string {
  return outcomes
    .map((outcome) => {
      if (!outcome.ok) return `${outcome.label}: falhou (${outcome.error})`;
      const partial = outcome.reachedLimit ? " — parcial, rode novamente" : "";
      return `${outcome.label}: ${outcome.syncedAds} criativos / ${outcome.syncedMetrics} métricas${partial}`;
    })
    .join(" · ");
}

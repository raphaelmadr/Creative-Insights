/**
 * Registro das fontes de dados e o único orquestrador de sincronização.
 *
 * Existem exatamente duas sincronizações no sistema, e as duas passam por aqui:
 *
 *   - Manual    → `POST /api/sync-all`      (botão "Sincronizar Redes")
 *   - Automática → `GET /api/cron/sync-all` (disparador externo do cPanel)
 *
 * As duas executam `runSync()`, sem parâmetro de comportamento: mesma
 * profundidade, mesmas fontes, mesmo mês. Não existe "modo rápido" e "modo
 * profundo" — a divergência entre o que o botão fazia e o que o cron fazia era
 * a maior fonte de confusão do processo.
 *
 * Adicionar uma fonte (Google Ads, por exemplo) é acrescentar uma entrada em
 * `SOURCES`. Ela passa a valer no manual e no automático de uma vez, sem tocar
 * em rota, painel ou orquestrador.
 */

import prisma from "./prisma";
import { runMetaSync } from "./meta-sync";
import { runTikTokSync } from "./tiktok-sync";
import { isSlackConfigured, runSlackSync } from "./slack-sync";

export type SourceId = "META" | "TIKTOK" | "SLACK";

export interface SourceRunResult {
  /** A fonte parou no teto de tempo e tem mais a fazer na próxima execução. */
  reachedLimit: boolean;
  /** Resumo curto, escrito pela própria fonte, para toast e log. */
  summary: string;
}

export interface SourceOutcome extends SourceRunResult {
  id: SourceId;
  label: string;
  ok: boolean;
  error?: string;
}

type SettingsRow = Awaited<ReturnType<typeof prisma.systemSettings.findUnique>>;

interface SourceDefinition {
  id: SourceId;
  label: string;
  /** Uma fonte só entra na execução quando tem credenciais utilizáveis. */
  isConfigured(settings: SettingsRow): boolean;
  run(onProgress: (message: string, percentage: number) => void): Promise<SourceRunResult>;
}

export const SOURCES: SourceDefinition[] = [
  {
    id: "META",
    label: "Meta",
    isConfigured: (settings) => !!settings?.metaAdAccountId && !!settings?.metaAccessToken,
    run: async (onProgress) => {
      const result = await runMetaSync("full", onProgress);
      return {
        reachedLimit: result.reachedLimit,
        summary: `${result.syncedAds} criativos / ${result.syncedMetrics} métricas`,
      };
    },
  },
  {
    id: "TIKTOK",
    label: "TikTok",
    isConfigured: (settings) => !!settings?.tiktokAdvertiserId && !!settings?.tiktokAccessToken,
    run: async (onProgress) => {
      const result = await runTikTokSync("full", onProgress);
      return {
        reachedLimit: result.reachedLimit,
        summary: `${result.syncedAds} criativos / ${result.syncedMetrics} métricas`,
      };
    },
  },
  {
    id: "SLACK",
    label: "Entregas",
    isConfigured: (settings) => isSlackConfigured(settings),
    run: async (onProgress) => {
      const result = await runSlackSync({}, onProgress);
      return {
        reachedLimit: false,
        summary:
          result.newDeliveries === 0 && result.updatedDeliveries === 0
            ? "nenhuma nova"
            : `${result.newDeliveries} novas / ${result.updatedDeliveries} atualizadas`,
      };
    },
  },
];

export async function getConfiguredSources(): Promise<SourceDefinition[]> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  return SOURCES.filter((source) => source.isConfigured(settings));
}

export interface SyncReport {
  outcomes: SourceOutcome[];
  /** Todas as fontes concluíram sem erro. */
  ok: boolean;
  /** Alguma fonte parou no teto de tempo — rodar de novo continua de onde parou. */
  partial: boolean;
  /** Não havia fonte alguma com credenciais: nada foi feito, e isso não é erro. */
  nothingConfigured: boolean;
  /** Uma linha para toast e log. */
  summary: string;
}

/**
 * Executa todas as fontes configuradas, em série.
 *
 * Em série, e não em paralelo, por três motivos: o progresso passa a ser
 * legível, os limites de taxa das APIs não competem entre si, e o teto de tempo
 * de cada fonte fica previsível.
 */
export async function runSync(
  onProgress?: (message: string, percentage: number, source?: SourceId) => void
): Promise<SyncReport> {
  const sources = await getConfiguredSources();

  // Ausência de credenciais não é falha: nada a fazer é um resultado legítimo,
  // relatado com a mensagem que diz o que configurar. Lançar aqui transformava
  // uma configuração incompleta em erro de sistema.
  if (sources.length === 0) {
    onProgress?.("Nenhuma fonte com credenciais configuradas.", 100);
    return {
      outcomes: [],
      ok: true,
      partial: false,
      nothingConfigured: true,
      summary:
        "Nenhuma fonte configurada — nada a sincronizar. Cadastre as credenciais da Meta, do TikTok e/ou do Slack em Configurações › API.",
    };
  }

  const outcomes: SourceOutcome[] = [];
  const slice = 100 / sources.length;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const base = i * slice;

    const report = (message: string, percentage: number) => {
      const overall = Math.min(100, Math.round(base + (percentage / 100) * slice));
      onProgress?.(`[${source.label}] ${message}`, overall, source.id);
    };

    try {
      report("Iniciando...", 0);
      const result = await source.run(report);
      outcomes.push({ id: source.id, label: source.label, ok: true, ...result });
    } catch (error: any) {
      // Uma fonte que falha não pode derrubar as demais — nem passar despercebida.
      console.error(`[Sync] Fonte ${source.label} falhou:`, error);
      outcomes.push({
        id: source.id,
        label: source.label,
        ok: false,
        error: error?.message || "Erro desconhecido",
        reachedLimit: false,
        summary: "falhou",
      });
      onProgress?.(
        `[${source.label}] Falhou: ${error?.message || "erro desconhecido"}`,
        Math.round(base + slice),
        source.id
      );
    }
  }

  const ok = outcomes.every((outcome) => outcome.ok);
  const partial = outcomes.some((outcome) => outcome.reachedLimit);

  // `lastSyncAt` é carimbado aqui, e só aqui, ao fim de toda execução que tenha
  // gravado algo — inclusive parcial. A versão anterior exigia conclusão 100%
  // limpa, então execuções parciais deixavam a interface anunciando uma data de
  // semanas atrás sobre dados de horas atrás.
  if (outcomes.some((outcome) => outcome.ok)) {
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: { lastSyncAt: new Date() },
    });
  }

  return { outcomes, ok, partial, nothingConfigured: false, summary: summarize(outcomes) };
}

/** Resumo curto para toast/log. */
export function summarize(outcomes: SourceOutcome[]): string {
  return outcomes
    .map((outcome) => {
      if (!outcome.ok) return `${outcome.label}: falhou (${outcome.error})`;
      const suffix = outcome.reachedLimit ? " — parcial, rode novamente" : "";
      return `${outcome.label}: ${outcome.summary}${suffix}`;
    })
    .join(" · ");
}

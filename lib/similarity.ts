/**
 * Critério de escopo da análise de similaridade.
 *
 * A página existe para explicar **como o algoritmo distribuiu a verba entre
 * peças concorrentes** — e essa pergunta só tem resposta onde houve disputa.
 * Duas regras saem daqui, e as duas rotas as compartilham para que a análise
 * cubra exatamente o que a tela mostra:
 *
 *  - a análise olha as peças que concentraram investimento, não a cauda que o
 *    algoritmo praticamente não entregou;
 *  - um grupo sem pelo menos duas peças concentradoras não tem distribuição a
 *    explicar, então não é exibido.
 */

/** Fatia mínima do gasto do grupo para a peça entrar na análise. */
export const MIN_SHARE_FOR_ANALYSIS = 0.1;

/** Peças concentradoras mínimas para existir uma distribuição a explicar. */
export const MIN_CONCENTRATING_CREATIVES = 2;

/** O único campo que o critério precisa ler da peça. */
export interface ScopedCreative {
  spend: number;
}

/**
 * As peças que concentraram a verba do grupo, da maior para a menor.
 *
 * O gasto total é recalculado a partir das próprias peças em vez de vir do
 * grupo: assim a fatia é sempre coerente com a lista recebida, mesmo quando a
 * chamada traz um subconjunto.
 */
export function concentratingCreatives<T extends ScopedCreative>(creatives: T[]): T[] {
  if (!Array.isArray(creatives) || creatives.length === 0) return [];

  const total = creatives.reduce((acc, c) => acc + (c.spend || 0), 0);
  if (total <= 0) return [];

  return creatives
    .filter(c => (c.spend || 0) / total >= MIN_SHARE_FOR_ANALYSIS)
    .sort((a, b) => b.spend - a.spend);
}

/** Um grupo só vale exibir se houver disputa de verba a explicar nele. */
export function hasDistributionToExplain<T extends ScopedCreative>(creatives: T[]): boolean {
  return concentratingCreatives(creatives).length >= MIN_CONCENTRATING_CREATIVES;
}

/** Rótulo do algoritmo que decide a entrega na plataforma da peça. */
export function deliveryAlgorithmLabel(platform: string | null | undefined): string {
  const key = (platform || "META").toUpperCase();
  if (key === "TIKTOK") return "o algoritmo de entrega do TikTok Ads";
  if (key === "GOOGLE") return "o algoritmo de entrega do Google Ads";
  return "o Andromeda, o sistema de ranqueamento e entrega do Meta Ads";
}

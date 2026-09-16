/**
 * Vocabulário único de status de anúncio.
 *
 * Antes cada canal gravava o vocabulário cru da sua API — Meta usava
 * ACTIVE/PAUSED/ARCHIVED e TikTok usava ENABLE/DISABLE — de modo que qualquer
 * filtro de "ativo" dependia da plataforma. Aqui tudo é normalizado para o
 * vocabulário do Meta, que já era o esperado pela UI.
 */

export type NormalizedAdStatus =
  | "ACTIVE"
  | "PAUSED"
  | "ARCHIVED"
  | "DELETED"
  | "REVIEW"
  | "REJECTED"
  | "UNKNOWN";

/** Status considerados "no ar". Fonte única para filtros e relatórios. */
export const ACTIVE_AD_STATUSES: string[] = ["ACTIVE", "ENABLE", "ENABLED"];

export function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_AD_STATUSES.includes(status.toUpperCase());
}

/**
 * Normaliza o status do Meta.
 *
 * `effective_status` é preferido a `status`: `status` reflete apenas o botão do
 * próprio anúncio, enquanto `effective_status` já considera conjunto e campanha
 * pausados — que é o que "ativo" significa na prática.
 */
export function normalizeMetaStatus(
  status?: string | null,
  effectiveStatus?: string | null
): NormalizedAdStatus {
  const raw = (effectiveStatus || status || "").toUpperCase();
  if (!raw) return "UNKNOWN";

  if (raw === "ACTIVE") return "ACTIVE";
  if (raw === "ARCHIVED") return "ARCHIVED";
  if (raw === "DELETED") return "DELETED";
  if (raw.includes("PAUSED")) return "PAUSED"; // PAUSED, ADSET_PAUSED, CAMPAIGN_PAUSED
  if (raw === "PENDING_REVIEW" || raw === "IN_PROCESS" || raw === "PENDING_BILLING_INFO") return "REVIEW";
  if (raw === "DISAPPROVED" || raw === "ADSET_DISAPPROVED") return "REJECTED";

  return "UNKNOWN";
}

/**
 * Normaliza o status do TikTok.
 *
 * `operation_status` sozinho mente: um anúncio devolve ENABLE mesmo quando a
 * campanha está desligada (`secondary_status: AD_STATUS_CAMPAIGN_DISABLE`).
 * `secondary_status` é a fonte confiável quando presente.
 */
export function normalizeTikTokStatus(
  operationStatus?: string | null,
  secondaryStatus?: string | null
): NormalizedAdStatus {
  const secondary = (secondaryStatus || "").toUpperCase();

  if (secondary) {
    if (secondary.includes("DELETE")) return "DELETED";
    if (secondary.includes("REJECT") || secondary.includes("DISAPPROVE")) return "REJECTED";
    if (secondary.includes("AUDIT") || secondary.includes("REVIEW")) return "REVIEW";
    // Cobre AD_STATUS_DISABLE, AD_STATUS_CAMPAIGN_DISABLE, AD_STATUS_ADGROUP_DISABLE...
    if (secondary.includes("DISABLE")) return "PAUSED";
    if (secondary.includes("DELIVERY_OK") || secondary.includes("AD_STATUS_DELIVERY")) return "ACTIVE";
  }

  const operation = (operationStatus || "").toUpperCase();
  if (operation === "ENABLE") return "ACTIVE";
  if (operation === "DISABLE") return "PAUSED";
  if (operation === "DELETE") return "DELETED";

  return "UNKNOWN";
}

/**
 * As quatro métricas que definem um criativo.
 *
 * Fonte única para exibição e para as regras de categorização (Winners), para
 * que o número mostrado no card seja exatamente o número que decidiu a categoria.
 */

export interface CreativeTotals {
  /** Investimento acumulado em todo o período de veiculação. */
  spend: number;
  /** Receita bruta — `payment_approved_cc`. */
  grossValue: number;
  /** Receita líquida — `risk_approved_cc`. Zero em canais sem análise de risco. */
  riskApprovedValue: number;
  impressions: number;
  clicks: number;
  purchases: number;
  netOrders: number;
}

/**
 * Canais em que a análise de risco existe.
 *
 * `risk_approved_cc` é um funil da Allugator que roda sobre o pixel da Meta.
 * Onde ele existe, receita líquida zero significa literalmente zero.
 */
const PLATFORMS_WITH_RISK_APPROVAL = new Set(["META"]);

export function hasRiskApprovalFunnel(platform?: string | null): boolean {
  return PLATFORMS_WITH_RISK_APPROVAL.has((platform || "META").toUpperCase());
}

/**
 * Receita de referência do criativo — a base das regras de categoria.
 *
 * A decisão é por CANAL, nunca pelo valor:
 *  - Meta: sempre a receita líquida, inclusive quando é zero.
 *  - Canais sem análise de risco (TikTok): a receita bruta, porque a plataforma
 *    não tem como fornecer a líquida.
 *
 * A versão anterior caía para a bruta sempre que a líquida fosse zero, e com
 * isso promovia a Super Winner criativos da Meta com receita líquida R$ 0 —
 * exatamente o que aparecia como categoria sem receita na tela.
 */
export function referenceRevenue(
  totals: Pick<CreativeTotals, "grossValue" | "riskApprovedValue">,
  platform?: string | null
): number {
  return hasRiskApprovalFunnel(platform) ? totals.riskApprovedValue : totals.grossValue;
}

/**
 * CPA — custo por receita líquida aprovada.
 *
 * Quanto de investimento foi necessário para cada R$ 1 de receita líquida.
 * Menor é melhor; abaixo de 1,00 significa que a peça se paga.
 *
 * Devolve `null` quando não houve receita, para a interface mostrar "—" em vez
 * de um número inventado.
 */
export function calculateCpa(
  totals: Pick<CreativeTotals, "spend" | "grossValue" | "riskApprovedValue">,
  platform?: string | null
): number | null {
  const revenue = referenceRevenue(totals, platform);
  if (revenue <= 0) return null;
  return totals.spend / revenue;
}

/** ROAS sobre a receita de referência — o inverso do CPA, para leitura direta. */
export function calculateRoas(
  totals: Pick<CreativeTotals, "spend" | "grossValue" | "riskApprovedValue">,
  platform?: string | null
): number | null {
  if (totals.spend <= 0) return null;
  return referenceRevenue(totals, platform) / totals.spend;
}

export function calculateCtr(totals: Pick<CreativeTotals, "impressions" | "clicks">): number {
  return totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
}

export const EMPTY_TOTALS: CreativeTotals = {
  spend: 0,
  grossValue: 0,
  riskApprovedValue: 0,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  netOrders: 0,
};

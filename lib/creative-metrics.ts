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
 * Receita de referência do criativo — a base das regras de categoria.
 *
 * Sempre a receita líquida (`riskApprovedValue`), em qualquer canal. Cada canal
 * é responsável por preencher esse campo com o que representa receita aprovada
 * lá dentro:
 *  - Meta: a conversão personalizada `risk_approved_cc`;
 *  - TikTok: a conversão padrão do canal (`complete_payment`), já que não há
 *    etapa de análise de risco separada.
 *
 * Não existe fallback para a receita bruta. Ele fazia criativos com receita
 * líquida R$ 0 serem promovidos a Super Winner pelo valor bruto, que era
 * exatamente a incoerência vista na tela.
 */
export function referenceRevenue(
  totals: Pick<CreativeTotals, "grossValue" | "riskApprovedValue">
): number {
  return totals.riskApprovedValue;
}

/**
 * CPA — custo por pedido aprovado.
 *
 * Investimento dividido pela quantidade de pedidos aprovados. Sem nenhum pedido,
 * devolve o próprio investimento: o valor gasto sem retorno.
 */
export function calculateCpa(totals: Pick<CreativeTotals, "spend" | "netOrders">): number {
  return totals.netOrders > 0 ? totals.spend / totals.netOrders : totals.spend;
}

/** ROAS sobre a receita de referência — o inverso do CPA, para leitura direta. */
export function calculateRoas(
  totals: Pick<CreativeTotals, "spend" | "grossValue" | "riskApprovedValue">
): number | null {
  if (totals.spend <= 0) return null;
  return referenceRevenue(totals) / totals.spend;
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

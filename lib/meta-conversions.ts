/**
 * Conversões personalizadas do pixel que definem a receita do negócio.
 *
 * Estes dois eventos são a fonte da verdade de faturamento — não os eventos
 * `purchase`/`omni_purchase` padrão do pixel, que contam o checkout e não o
 * pedido efetivamente aprovado.
 *
 * Podem ser sobrescritos por ambiente sem alterar código; o ideal a médio prazo
 * é movê-los para SystemSettings e expô-los na tela de configurações.
 */

/** `payment_approved_cc` — receita BRUTA (pagamento aprovado). */
export const PAYMENT_APPROVED_CONVERSION_ID =
  process.env.META_PAYMENT_APPROVED_CONVERSION_ID || "27308373288832722";

/** `risk_approved_cc` — receita LÍQUIDA (aprovado na análise de risco). */
export const RISK_APPROVED_CONVERSION_ID =
  process.env.META_RISK_APPROVED_CONVERSION_ID || "2105075753380751";

export const PAYMENT_APPROVED_ACTION = `offsite_conversion.custom.${PAYMENT_APPROVED_CONVERSION_ID}`;
export const RISK_APPROVED_ACTION = `offsite_conversion.custom.${RISK_APPROVED_CONVERSION_ID}`;

/**
 * Fallbacks de receita bruta, usados só quando a conversão personalizada não
 * veio na linha. Mantidos em ordem de preferência.
 */
export const GROSS_VALUE_FALLBACK_ACTIONS = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "offline_conversion.purchase",
];

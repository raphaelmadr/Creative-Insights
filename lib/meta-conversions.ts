/**
 * Eventos de conversão da conta e qual deles define cada métrica.
 *
 * A conta tem três candidatos concorrentes que dão números muito diferentes
 * para o mesmo período. Medido em 01-08/09, com R$ 514.295,56 de investimento:
 *
 *   evento                 qtd     valor          ticket      CPA
 *   purchase (padrão)     1.950   R$   890.422    R$ 456,63   R$ 263,74
 *   payment_approved_cc   7.629   R$ 3.492.092    R$ 457,74   R$  67,41
 *   risk_approved_cc        591   R$   253.744    R$ 429,35   R$ 870,21
 *
 * A razão `payment / purchase` varia de 2,1 a 5,6 entre anúncios (mediana 3,4),
 * com ticket praticamente idêntico ao da compra — o padrão de pagamentos
 * recorrentes, em que uma venda gera vários eventos ao longo dos meses.
 * `risk_approved_cc` fica em ~27% das compras, com ticket um pouco menor: um
 * filtro de aprovação, não uma recorrência.
 *
 * Por isso nenhuma métrica aqui é "o CPA" sem qualificação — cada uma declara
 * seu evento, e a interface mostra qual está em uso.
 */

export interface ConversionEvent {
  /** Identificador da conversão personalizada na Meta, quando aplicável. */
  id?: string;
  /** `action_type` como vem nos insights. */
  actionType: string;
  /** Nome do evento como o time o chama. */
  key: string;
  /** Texto curto para a interface. */
  label: string;
}

/** `risk_approved_cc` — pedido aprovado na análise de risco. */
export const RISK_APPROVED_EVENT: ConversionEvent = {
  id: process.env.META_RISK_APPROVED_CONVERSION_ID || "2105075753380751",
  actionType: `offsite_conversion.custom.${process.env.META_RISK_APPROVED_CONVERSION_ID || "2105075753380751"}`,
  key: "risk_approved_cc",
  label: "aprovado no risco",
};

/** `payment_approved_cc` — pagamento aprovado (recorrente). */
export const PAYMENT_APPROVED_EVENT: ConversionEvent = {
  id: process.env.META_PAYMENT_APPROVED_CONVERSION_ID || "27308373288832722",
  actionType: `offsite_conversion.custom.${process.env.META_PAYMENT_APPROVED_CONVERSION_ID || "27308373288832722"}`,
  key: "payment_approved_cc",
  label: "pagamento aprovado",
};

/** Evento de compra padrão do pixel. */
export const STANDARD_PURCHASE_EVENT: ConversionEvent = {
  actionType: "offsite_conversion.fb_pixel_purchase",
  key: "purchase",
  label: "compra (padrão Meta)",
};

/**
 * O evento que define CPA, Receita Líquida e as categorias de winner.
 *
 * É `risk_approved_cc` para acompanhar o workspace-goal do Motion, que usa
 * `risk_approved_value`, e para bater com a meta de CPA definida no painel —
 * calibrada na escala das centenas de reais, que só esse evento produz.
 *
 * Trocar aqui muda o número em todo o produto de uma vez; a meta de CPA em
 * Configurações precisa ser recalibrada junto.
 */
export const PRIMARY_CONVERSION_EVENT = RISK_APPROVED_EVENT;

/** O evento que define a Receita Bruta exibida ao lado da líquida. */
export const GROSS_REVENUE_EVENT = PAYMENT_APPROVED_EVENT;

// Compatibilidade com os pontos que já importam os action types diretamente.
export const RISK_APPROVED_ACTION = RISK_APPROVED_EVENT.actionType;
export const PAYMENT_APPROVED_ACTION = PAYMENT_APPROVED_EVENT.actionType;

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

/**
 * Descritor que a API devolve junto das métricas, para a interface poder
 * declarar qual evento está por trás dos números que está exibindo.
 */
export function activeConversionDescriptor() {
  return {
    cpa: {
      key: PRIMARY_CONVERSION_EVENT.key,
      label: PRIMARY_CONVERSION_EVENT.label,
      id: PRIMARY_CONVERSION_EVENT.id ?? null,
    },
    grossRevenue: {
      key: GROSS_REVENUE_EVENT.key,
      label: GROSS_REVENUE_EVENT.label,
      id: GROSS_REVENUE_EVENT.id ?? null,
    },
  };
}

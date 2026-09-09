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

/**
 * IDs de fábrica das conversões personalizadas desta conta.
 *
 * São o ponto de partida quando o painel não define nada; configurá-los em
 * Configurações › API sobrepõe estes valores. Antes viviam em variável de
 * ambiente, o que os tornava invisíveis e impossíveis de trocar sem deploy.
 */
export const DEFAULT_RISK_APPROVED_CONVERSION_ID = "2105075753380751";
export const DEFAULT_PAYMENT_APPROVED_CONVERSION_ID = "27308373288832722";

export interface ConversionSettings {
  metaRiskApprovedConversionId?: string | null;
  metaPaymentApprovedConversionId?: string | null;
}

/** Evento de compra padrão do pixel — não é configurável, é do próprio Meta. */
export const STANDARD_PURCHASE_EVENT: ConversionEvent = {
  actionType: "offsite_conversion.fb_pixel_purchase",
  key: "purchase",
  label: "compra (padrão Meta)",
};

export interface ResolvedConversions {
  /** `risk_approved_cc` — pedido aprovado na análise de risco. */
  riskApproved: ConversionEvent;
  /** `payment_approved_cc` — pagamento aprovado (recorrente). */
  paymentApproved: ConversionEvent;
  standardPurchase: ConversionEvent;
  /**
   * O evento que define CPA, Receita Líquida e as categorias de winner.
   *
   * É `risk_approved_cc` para acompanhar o workspace-goal do Motion, que usa
   * `risk_approved_value`, e para bater com a meta de CPA definida no painel —
   * calibrada na escala das centenas de reais, que só esse evento produz.
   */
  primary: ConversionEvent;
  /** O evento que define a Receita Bruta exibida ao lado da líquida. */
  grossRevenue: ConversionEvent;
}

/**
 * Resolve os eventos a partir das configurações do painel.
 *
 * Recebe as configurações em vez de lê-las: `runMetaSync` já as carregou, e uma
 * segunda consulta no meio do laço de métricas custaria caro.
 */
export function resolveConversions(settings?: ConversionSettings | null): ResolvedConversions {
  const riskId =
    (settings?.metaRiskApprovedConversionId || "").trim() || DEFAULT_RISK_APPROVED_CONVERSION_ID;
  const paymentId =
    (settings?.metaPaymentApprovedConversionId || "").trim() ||
    DEFAULT_PAYMENT_APPROVED_CONVERSION_ID;

  const riskApproved: ConversionEvent = {
    id: riskId,
    actionType: `offsite_conversion.custom.${riskId}`,
    key: "risk_approved_cc",
    label: "aprovado no risco",
  };

  const paymentApproved: ConversionEvent = {
    id: paymentId,
    actionType: `offsite_conversion.custom.${paymentId}`,
    key: "payment_approved_cc",
    label: "pagamento aprovado",
  };

  return {
    riskApproved,
    paymentApproved,
    standardPurchase: STANDARD_PURCHASE_EVENT,
    primary: riskApproved,
    grossRevenue: paymentApproved,
  };
}

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
export function activeConversionDescriptor(settings?: ConversionSettings | null) {
  const conversions = resolveConversions(settings);
  return {
    cpa: {
      key: conversions.primary.key,
      label: conversions.primary.label,
      id: conversions.primary.id ?? null,
    },
    grossRevenue: {
      key: conversions.grossRevenue.key,
      label: conversions.grossRevenue.label,
      id: conversions.grossRevenue.id ?? null,
    },
  };
}

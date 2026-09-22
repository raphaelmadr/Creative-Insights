/**
 * Quem são os provedores de IA, e em que ordem eles são tentados.
 *
 * Este módulo é só dado: nenhum SDK, nenhum acesso ao banco, nenhuma chamada de
 * rede. É o que permite que a MESMA lista seja lida pelo servidor, onde
 * `lib/ai.ts` pendura a função que fala com cada API, e pela tela de
 * Configurações › IA, que é um componente de cliente. Antes a tela mantinha uma
 * cópia manual da ordem escrita em `lib/ai.ts` com um comentário pedindo que as
 * duas fossem mantidas em sincronia — e a partir do momento em que a ordem virou
 * configurável, "manter em sincronia" deixou de ser possível: a ordem passou a
 * morar no banco.
 */

export type AiProviderId =
  | "gemini"
  | "groq"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "cohere"
  | "huggingface";

/** A coluna de `SystemSettings` onde a chave daquele provedor mora. */
export type AiProviderKeyField =
  | "geminiApiKey"
  | "groqApiKey"
  | "openRouterApiKey"
  | "openaiApiKey"
  | "anthropicApiKey"
  | "cohereApiKey"
  | "huggingFaceApiKey";

export interface AiProviderMeta {
  id: AiProviderId;
  /**
   * O nome como aparece no log de falhas.
   *
   * Precisa bater exatamente com as chaves de `CREDENTIALS` em
   * `lib/external-log.ts`: é por este texto que o log descobre qual campo e qual
   * tela citar na correção.
   */
  label: string;
  keyField: AiProviderKeyField;
  /** Aceita imagem junto do prompt — a transcrição visual depende disto. */
  vision: boolean;
  /** O que distingue este provedor dos outros, para quem escolhe a ordem. */
  note: string;
}

/**
 * A ordem de declaração é a ordem PADRÃO — a que vale enquanto ninguém
 * configurou nada, e a que preenche o fim da fila quando a ordem salva não
 * menciona algum provedor.
 */
export const AI_PROVIDERS: AiProviderMeta[] = [
  { id: "gemini", label: "Gemini", keyField: "geminiApiKey", vision: true, note: "Lê imagens; cota gratuita generosa" },
  { id: "groq", label: "Groq", keyField: "groqApiKey", vision: true, note: "O mais rápido da fila" },
  { id: "openrouter", label: "OpenRouter", keyField: "openRouterApiKey", vision: true, note: "Roteia para vários modelos" },
  { id: "openai", label: "OpenAI", keyField: "openaiApiKey", vision: true, note: "Lê imagens" },
  { id: "anthropic", label: "Anthropic", keyField: "anthropicApiKey", vision: true, note: "Lê imagens" },
  { id: "cohere", label: "Cohere", keyField: "cohereApiKey", vision: false, note: "Só texto" },
  { id: "huggingface", label: "HuggingFace", keyField: "huggingFaceApiKey", vision: false, note: "Só texto; modelos abertos" },
];

export const DEFAULT_AI_PROVIDER_ORDER: AiProviderId[] = AI_PROVIDERS.map((p) => p.id);

const BY_ID = new Map(AI_PROVIDERS.map((p) => [p.id, p]));

export function aiProviderById(id: AiProviderId): AiProviderMeta | undefined {
  return BY_ID.get(id);
}

/**
 * A ordem salva, transformada em fila utilizável.
 *
 * Três garantias, e cada uma existe por um modo de quebrar:
 *
 * 1. **Id desconhecido é descartado.** O que está gravado veio de uma versão
 *    anterior do produto; um provedor removido do código não pode derrubar a
 *    cadeia inteira.
 * 2. **Provedor ausente entra no fim**, na ordem padrão. Um provedor NOVO,
 *    adicionado depois que alguém salvou a ordem, seria invisível para sempre —
 *    e o sintoma seria uma chave preenchida que nunca é usada.
 * 3. **Repetido só conta uma vez**, senão o mesmo provedor seria tentado duas
 *    vezes e o log de falhas contaria a mesma queda em dobro.
 */
export function resolveAiProviderOrder(stored?: string | null): AiProviderId[] {
  const pedida: AiProviderId[] = [];

  if (stored && stored.trim()) {
    let bruto: unknown = null;
    try {
      bruto = JSON.parse(stored);
    } catch {
      // Tolerância a um valor escrito à mão direto no banco: "gemini,groq,...".
      bruto = stored.split(",");
    }

    if (Array.isArray(bruto)) {
      for (const item of bruto) {
        if (typeof item !== "string") continue;
        const id = item.trim().toLowerCase() as AiProviderId;
        if (BY_ID.has(id) && !pedida.includes(id)) pedida.push(id);
      }
    }
  }

  for (const id of DEFAULT_AI_PROVIDER_ORDER) {
    if (!pedida.includes(id)) pedida.push(id);
  }

  return pedida;
}

/** A forma como a ordem é gravada: JSON, normalizado antes de descer ao banco. */
export function serializeAiProviderOrder(ids: unknown): string {
  const normalizada = resolveAiProviderOrder(
    Array.isArray(ids) ? JSON.stringify(ids) : typeof ids === "string" ? ids : null
  );
  return JSON.stringify(normalizada);
}

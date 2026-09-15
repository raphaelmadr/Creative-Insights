/**
 * O vocabulário do gerador de copy — formatos e tons de voz.
 *
 * Módulo puro, sem Prisma e sem `fetch`, porque a tela do gerador é componente
 * de cliente e precisa das mesmas listas que o servidor usa para validar. É a
 * mesma divisão que já existe entre `lib/acronyms.ts` (puro) e
 * `lib/designer-match.ts` (banco) — o projeto já pagou o preço de misturar as
 * duas coisas uma vez, quando um componente de cliente acabou importando o
 * Prisma por tabela.
 */

/**
 * Onde a peça vai rodar.
 *
 * Não é o mesmo que "canal": o canal diz em qual leilão se compra, o formato diz
 * a forma da peça. Um banner de categoria e um story têm proporção, quantidade
 * de texto e distância do clique completamente diferentes — e é isso que muda a
 * copy.
 */
export const COPY_FORMATS = [
  {
    id: "feed",
    label: "Feed",
    /** O que o formato impõe à escrita, dito ao modelo. */
    guidance:
      "Peça de feed (proporção 1:1 ou 4:5). Comporta corpo de texto mais longo, lido com o polegar parado. A headline precisa sobreviver ao corte de \"ver mais\".",
  },
  {
    id: "stories",
    label: "Stories",
    guidance:
      "Peça de stories (9:16, tela cheia, vertical). Poucas palavras, lidas em menos de 3 segundos e com o dedo pronto para pular. Uma ideia só, CTA que combina com deslizar para cima.",
  },
  {
    id: "feed-stories",
    label: "Feed e Stories",
    guidance:
      "Peça que roda em feed e em stories ao mesmo tempo. O texto precisa funcionar nas duas proporções: headline curta o bastante para o vertical e corpo que ainda faça sentido no feed.",
  },
  {
    id: "banner-site",
    label: "Banner site",
    guidance:
      "Banner do site, horizontal, no topo da página. Quem lê já está na loja — não há necessidade de apresentar a marca. Headline curta, uma promessa, CTA de ação imediata.",
  },
  {
    id: "mini-banner-site",
    label: "Mini banner site",
    guidance:
      "Mini banner do site, área pequena. Espaço para pouquíssimo texto: uma linha de headline e um CTA de duas ou três palavras. NÃO escreva corpo de texto — não há onde exibi-lo.",
  },
  {
    id: "banner-categoria",
    label: "Banner de categoria",
    guidance:
      "Banner de uma categoria do site. Quem vê já demonstrou interesse naquela categoria — a copy fala do recorte, não do catálogo inteiro, e destaca o diferencial dentro daquela linha de produtos.",
  },
] as const;

export type CopyFormatId = (typeof COPY_FORMATS)[number]["id"];

export function findFormat(id: string | undefined | null) {
  return COPY_FORMATS.find((f) => f.id === id) ?? null;
}

/**
 * Os tons de voz predefinidos.
 *
 * Cada um traz a instrução que o modelo recebe, e não só o rótulo: "urgência"
 * sozinho é interpretado de sete maneiras diferentes por sete provedores, e a
 * cadeia de fallback de `lib/ai.ts` usa justamente provedores diferentes. O
 * rótulo é para a pessoa; a instrução é o que mantém a saída estável.
 */
export const COPY_TONES = [
  {
    id: "direto",
    label: "Direto e objetivo",
    guidance: "Frases curtas, sem adjetivo decorativo. Diz o que é, quanto custa e o que fazer.",
  },
  {
    id: "urgencia",
    label: "Urgência e escassez",
    guidance:
      "Pressão de tempo ou de disponibilidade, mas apenas sobre fatos reais informados no briefing. Nunca invente prazo, estoque ou contagem regressiva.",
  },
  {
    id: "educativo",
    label: "Educativo e explicativo",
    guidance:
      "Explica como funciona antes de pedir a ação. Serve a quem ainda não entendeu o modelo de aluguel.",
  },
  {
    id: "conversacional",
    label: "Próximo e conversacional",
    guidance: "Segunda pessoa, linguagem falada, como quem recomenda a um amigo. Sem gíria forçada.",
  },
  {
    id: "aspiracional",
    label: "Aspiracional e premium",
    guidance:
      "Foca no que a pessoa passa a ser e a ter, não na especificação. Cuidado para não soar distante do preço.",
  },
  {
    id: "prova-social",
    label: "Prova social",
    guidance:
      "Apoia-se em quantas pessoas já usam e no que elas dizem. Só com dados fornecidos no briefing — não invente número de clientes nem depoimento.",
  },
  {
    id: "bem-humorado",
    label: "Bem-humorado",
    guidance: "Leve e com humor, sem piada interna e sem ironia que possa soar como deboche do cliente.",
  },
  {
    id: "quebra-objecao",
    label: "Quebra de objeção",
    guidance:
      "Nomeia a objeção logo na headline e a desmonta no corpo. Bom para retargeting de quem não converteu.",
  },
] as const;

export type CopyToneId = (typeof COPY_TONES)[number]["id"];

export function findTone(id: string | undefined | null) {
  return COPY_TONES.find((t) => t.id === id) ?? null;
}

/**
 * Quantas variações cabem numa geração.
 *
 * Doze é o teto pedido. Vale lembrar que o teto de saída é de 4.000 tokens
 * (`AI_MAX_TOKENS`), e doze variações no formato de quatro campos chegam perto
 * dele — por isso o prompt pede concisão explicitamente quando o número é alto.
 */
export const MAX_VARIATIONS = 12;
export const MIN_VARIATIONS = 1;
export const DEFAULT_VARIATIONS = 3;

export function clampVariations(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_VARIATIONS;
  return Math.min(Math.max(n, MIN_VARIATIONS), MAX_VARIATIONS);
}

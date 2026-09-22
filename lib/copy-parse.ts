/**
 * A saída da IA, quebrada em variações editáveis — e remontada depois.
 *
 * O gerador pede um formato fixo (`### Variação N — ângulo`, com Headline,
 * Corpo, CTA e "Por que deve funcionar"), mas o que volta é markdown: um texto
 * só. Para o copywriter poder mexer numa headline sem reescrever o bloco
 * inteiro, esse texto precisa virar estrutura.
 *
 * Módulo puro, sem Prisma e sem `fetch`: a tela do gerador é componente de
 * cliente e é ela quem edita. Mesma divisão de `lib/copy-options.ts`.
 */

export interface CopyVariation {
  /** Chave estável da linha na tela. Não vai para o texto final. */
  id: string;
  /** O ângulo, do título da variação. */
  angle: string;
  headline: string;
  body: string;
  cta: string;
  /**
   * O argumento da IA. Não se edita: é o que ela sustentou, e reescrevê-lo
   * seria assinar como raciocínio dela algo que não é.
   */
  rationale: string;
}

/** Os rótulos que o prompt define, e as variações que os modelos insistem em usar. */
const FIELD_PATTERNS: { key: keyof CopyVariation; pattern: RegExp }[] = [
  { key: "headline", pattern: /^\s*\**\s*(?:headline|título|titulo)\s*:\**\s*/i },
  /*
   * "Roteiro" e "Texto da página" são o MESMO campo que "Corpo".
   *
   * O prompt passou a nomear o corpo conforme o tipo da peça — num vídeo ele é o
   * roteiro, numa landing page é o texto da página. Sem estes rótulos aqui, a
   * resposta de um roteiro casava só com o "Texto" solto, ou com nada: o campo
   * chegava vazio na tela e o trabalho do modelo era descartado em silêncio.
   */
  {
    key: "body",
    pattern: /^\s*\**\s*(?:corpo|roteiro|script|texto(?:\s+d[ao]\s+p[áa]gina)?|body)\s*:\**\s*/i,
  },
  { key: "cta", pattern: /^\s*\**\s*(?:cta|chamada)\s*:\**\s*/i },
  {
    key: "rationale",
    pattern: /^\s*\**\s*(?:por que deve funcionar|porque deve funcionar|por quê deve funcionar|justificativa)\s*:\**\s*/i,
  },
];

/**
 * Uma seção de landing page — `**Seção Benefícios:** ...`.
 *
 * Vai toda para o CORPO, e acumulando: uma página tem cinco seções, e cada uma é
 * um pedaço do mesmo texto. Sem isto, só a última sobreviveria — o laço abaixo
 * SUBSTITUI o valor quando reencontra um rótulo, que é o certo para "Headline" e
 * o errado para "Seção".
 */
const SECTION_PATTERN = /^\s*\**\s*(?:se[çc][ãa]o|sess[ãa]o)\s+([^:*]+?)\s*:\**\s*/i;

/** Tira o negrito e o espaço sobrando de um valor colhido. */
function clean(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\s+$/g, "")
    .replace(/^\s+/g, "")
    .trim();
}

let counter = 0;
const nextId = () => `var-${Date.now().toString(36)}-${(counter += 1)}`;

/**
 * Quebra o texto da IA em variações.
 *
 * Devolve lista vazia quando não reconhece o formato — e aí a tela cai no campo
 * de texto corrido, em vez de mostrar cartões vazios. Um modelo da cadeia de
 * fallback pode responder fora do padrão, e perder a copy por causa disso seria
 * bem pior do que editá-la como texto.
 */
export function parseCopyVariations(raw: string): CopyVariation[] {
  if (!raw?.trim()) return [];

  // `normalizeAiOutput` já uniformiza qualquer nível de título para `###`; o
  // `#{1,6}` aqui é para o caso de este parser ser usado sobre texto cru.
  const blocks = raw.split(/^#{1,6}\s+/m).filter((b) => b.trim());
  if (blocks.length === 0) return [];

  const variations: CopyVariation[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const heading = lines.shift() ?? "";

    /*
     * O ângulo é o que vem depois do travessão no título. Modelos usam travessão
     * longo, hífen ou dois-pontos, e alguns não põem separador nenhum — nesse
     * caso o título inteiro sem o "Variação N" já é o ângulo.
     */
    const angle = clean(
      heading
        .replace(/^\s*varia(?:ção|cao)\s*\d+\s*[—–\-:]?\s*/i, "")
        .replace(/^[—–\-:]\s*/, "")
    );

    const found: Partial<Record<keyof CopyVariation, string[]>> = {};
    let current: keyof CopyVariation | null = null;

    for (const line of lines) {
      /*
       * Seção primeiro: `**Seção Home:**` também casaria com nada dos padrões
       * normais, mas a ordem deixa explícito que ela é um caso próprio — ela
       * ACRESCENTA ao corpo em vez de recomeçá-lo.
       */
      const secao = line.match(SECTION_PATTERN);
      if (secao) {
        current = "body";
        found.body = found.body ?? [];
        if (found.body.length) found.body.push("");
        found.body.push(`**${clean(secao[1])}:** ${line.replace(SECTION_PATTERN, "")}`);
        continue;
      }

      const match = FIELD_PATTERNS.find((f) => f.pattern.test(line));

      if (match) {
        current = match.key;
        found[current] = [line.replace(match.pattern, "")];
        continue;
      }

      // Continuação do campo anterior: o corpo às vezes vem em duas linhas.
      if (!current) continue;

      if (line.trim()) {
        found[current]!.push(line);
        continue;
      }

      /*
       * A linha em branco DENTRO do corpo é preservada — ela é o que separa uma
       * seção da seguinte. Descartá-la fazia a página voltar do quadro com as
       * cinco seções emendadas num bloco só: o texto ia inteiro, mas a forma,
       * que é metade do trabalho numa landing page, se perdia na primeira
       * ida-e-volta.
       */
      if (current === "body" && found.body?.length) found.body.push("");
    }

    const headline = clean((found.headline ?? []).join(" "));
    /*
     * O corpo preserva as QUEBRAS DE LINHA; os campos de uma linha só, não.
     *
     * Tudo era unido com espaço, e isso achatava o que tem forma: um roteiro de
     * vídeo com uma fala por linha virava um parágrafo corrido, e as seções de
     * uma landing page se emendavam umas nas outras. O que chegava à tela não
     * era o que o modelo tinha escrito — era ele sem estrutura nenhuma.
     */
    const body = clean((found.body ?? []).join("\n"));
    const cta = clean((found.cta ?? []).join(" "));
    const rationale = clean((found.rationale ?? []).join(" "));

    // Um bloco sem headline e sem corpo não é uma variação — é o preâmbulo que
    // algum modelo escreveu apesar do contrato de saída.
    if (!headline && !body) continue;

    variations.push({ id: nextId(), angle, headline, body, cta, rationale });
  }

  return variations;
}

/**
 * Remonta o texto final a partir das variações editadas.
 *
 * Mesmo formato da saída original, renumerado: é o que vai para o card do
 * Kanban, e quem abrir lá não deve conseguir dizer se a copy passou ou não pela
 * edição de alguém.
 */
export function serializeCopyVariations(
  variations: CopyVariation[],
  /** Como o corpo se chama nesta peça — "Roteiro" num vídeo. Ver `COPY_PIECE_KINDS`. */
  bodyLabel = "Corpo"
): string {
  return variations
    .map((v, i) => {
      const titulo = v.angle ? `### Variação ${i + 1} — ${v.angle}` : `### Variação ${i + 1}`;

      const linhas = [
        titulo,
        v.headline ? `**Headline:** ${v.headline}` : null,
        v.body ? `**${bodyLabel}:** ${v.body}` : null,
        v.cta ? `**CTA:** ${v.cta}` : null,
        v.rationale ? `**Por que deve funcionar:** ${v.rationale}` : null,
      ].filter(Boolean);

      return linhas.join("\n");
    })
    .join("\n\n");
}

/** Uma variação em branco, para quem quiser escrever a sua própria. */
export function emptyVariation(): CopyVariation {
  return { id: nextId(), angle: "", headline: "", body: "", cta: "", rationale: "" };
}

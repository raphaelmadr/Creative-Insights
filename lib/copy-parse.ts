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
  { key: "body", pattern: /^\s*\**\s*(?:corpo|texto|body)\s*:\**\s*/i },
  { key: "cta", pattern: /^\s*\**\s*(?:cta|chamada)\s*:\**\s*/i },
  {
    key: "rationale",
    pattern: /^\s*\**\s*(?:por que deve funcionar|porque deve funcionar|por quê deve funcionar|justificativa)\s*:\**\s*/i,
  },
];

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
      const match = FIELD_PATTERNS.find((f) => f.pattern.test(line));

      if (match) {
        current = match.key;
        found[current] = [line.replace(match.pattern, "")];
        continue;
      }

      // Continuação do campo anterior: o corpo às vezes vem em duas linhas.
      if (current && line.trim()) {
        found[current]!.push(line);
      }
    }

    const headline = clean((found.headline ?? []).join(" "));
    const body = clean((found.body ?? []).join(" "));
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
export function serializeCopyVariations(variations: CopyVariation[]): string {
  return variations
    .map((v, i) => {
      const titulo = v.angle ? `### Variação ${i + 1} — ${v.angle}` : `### Variação ${i + 1}`;

      const linhas = [
        titulo,
        v.headline ? `**Headline:** ${v.headline}` : null,
        v.body ? `**Corpo:** ${v.body}` : null,
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

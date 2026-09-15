/**
 * O gerador de copy — e a razão de ele morar dentro desta plataforma.
 *
 * Uma copy escrita num chat genérico começa do zero toda vez. Aqui, o mesmo
 * banco que alimenta o painel de performance já sabe quais peças converteram no
 * período, e `AdCreative.visionTranscript` guarda o que estava escrito dentro
 * de cada uma delas. A copy nasce, então, com referência do que de fato
 * funcionou nesta conta — que é a única coisa que uma ferramenta de fora não
 * tem como oferecer.
 */

import prisma from "./prisma";
import { generateWithFallback, normalizeAiOutput } from "./ai";
import { ACTIVE_AD_STATUSES } from "./ad-status";
import { clampVariations, findFormat, findTone } from "./copy-options";
import { describePricing, type AlluProduct } from "./allu-catalog";
import { describeAudience, type MetaAudience } from "./meta-audiences";

/** Quantas peças vencedoras entram como referência. */
const REFERENCE_LIMIT = 6;

/** A janela de onde as referências saem. */
const REFERENCE_WINDOW_DAYS = 30;

export interface CopyBrief {
  /**
   * O produto escolhido no catálogo da Allu.
   *
   * Vindo do catálogo e não digitado: o preço que entra na copy passa a ser o
   * preço que está no site, e não o que alguém lembrava. Continua opcional
   * porque nem toda peça é de um produto — campanha institucional, por exemplo.
   */
  product?: AlluProduct | null;
  /** O nome livre, quando a peça não é de um produto do catálogo. */
  productName?: string;

  /** O público personalizado do Meta escolhido na lista. */
  audience?: MetaAudience | null;
  /** A descrição livre, quando não se escolheu um público da conta. */
  audienceText?: string;

  /** O que a peça precisa provocar. */
  objective: string;

  /** O id do tom na lista predefinida — ver `lib/copy-options.ts`. */
  toneId?: string;
  /** Tom escrito à mão, quando nenhum da lista serve. */
  toneText?: string;

  /** O id do formato — Feed, Stories, Banner de categoria… */
  formatId?: string;

  /** Onde a copy vai rodar. */
  channel?: string;
  /** Quantas variações, de 1 a 12. */
  variations?: number;
  /** Restrições: o que não dizer, termos obrigatórios, limite de caracteres. */
  constraints?: string;
}

/** O nome do produto, venha ele do catálogo ou digitado. */
export function briefProductName(brief: CopyBrief): string {
  return brief.product?.name || brief.productName?.trim() || "";
}

/** A descrição do público, venha ela da conta do Meta ou digitada. */
export function briefAudienceName(brief: CopyBrief): string {
  return brief.audience?.name || brief.audienceText?.trim() || "";
}

export interface WinnerReference {
  adName: string;
  spend: number;
  revenue: number;
  roas: number | null;
  transcript: string | null;
}

/**
 * As peças que mais devolveram receita líquida na janela.
 *
 * Ordenadas por receita e não por ROAS: um ROAS altíssimo sobre R$ 40 de gasto
 * é ruído estatístico, e é justamente o tipo de peça que lidera um ranking por
 * eficiência. O que serve de referência para escrever é o que sustentou volume.
 */
/**
 * Os ids das peças vencedoras da janela, em ordem de receita.
 *
 * Separado de `fetchWinnerReferences` porque a rota de transcrição precisa da
 * mesma lista: é justamente destas peças que falta o texto, e transcrever um
 * conjunto diferente do que o gerador lê não resolveria nada. Uma seleção só,
 * dois consumidores.
 */
export async function fetchWinnerAdIds(limit = REFERENCE_LIMIT): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - REFERENCE_WINDOW_DAYS);

  const totals = await prisma.adDailyMetrics.groupBy({
    by: ["adCreativeId"],
    where: { date: { gte: since } },
    _sum: { riskApprovedValue: true },
    orderBy: { _sum: { riskApprovedValue: "desc" } },
    // Folga sobre o limite: parte dos mais rentáveis já saiu do ar, e esses não
    // entram como referência — sem a folga, o conjunto chegaria incompleto.
    take: limit * 3,
  });

  const ids = totals.map((t) => t.adCreativeId);
  if (!ids.length) return [];

  const ativos = await prisma.adCreative.findMany({
    where: { id: { in: ids }, status: { in: [...ACTIVE_AD_STATUSES] } },
    select: { id: true },
  });

  const vivos = new Set(ativos.map((a) => a.id));
  return ids.filter((id) => vivos.has(id)).slice(0, limit);
}

export async function fetchWinnerReferences(limit = REFERENCE_LIMIT): Promise<WinnerReference[]> {
  const since = new Date();
  since.setDate(since.getDate() - REFERENCE_WINDOW_DAYS);

  const totals = await prisma.adDailyMetrics.groupBy({
    by: ["adCreativeId"],
    where: { date: { gte: since } },
    _sum: { spend: true, riskApprovedValue: true },
    orderBy: { _sum: { riskApprovedValue: "desc" } },
    take: limit * 3,
  });

  const ids = totals.map((t) => t.adCreativeId);
  if (!ids.length) return [];

  const creatives = await prisma.adCreative.findMany({
    where: { id: { in: ids }, status: { in: [...ACTIVE_AD_STATUSES] } },
    select: { id: true, adName: true, visionTranscript: true },
  });

  const byId = new Map(creatives.map((c) => [c.id, c]));

  return totals
    .map((t) => {
      const creative = byId.get(t.adCreativeId);
      if (!creative) return null;

      const spend = t._sum.spend ?? 0;
      const revenue = t._sum.riskApprovedValue ?? 0;

      return {
        adName: creative.adName,
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : null,
        transcript: creative.visionTranscript,
      };
    })
    .filter((r): r is WinnerReference => r !== null && r.revenue > 0)
    .slice(0, limit);
}

/**
 * O bloco de referências — o molde que a copy tem de seguir.
 *
 * Quando a peça tem transcrição, o texto dela vai **inteiro**, e não resumido:
 * o pedido é que a copy siga o modelo vencedor, e um resumo apaga exatamente o
 * que faz o modelo funcionar — a ordem em que o argumento aparece, o tipo de
 * gancho, o comprimento das frases.
 *
 * Sem transcrição, o bloco diz isso na cara em vez de fingir que o nome do
 * arquivo é a peça. Um modelo que recebe `VD_allu_ads_unboxing_iphone_Feed`
 * como "referência de sucesso" preenche o vazio com lugar-comum publicitário —
 * que é exatamente o texto genérico que aparecia na tela.
 */
function buildReferenceBlock(winners: WinnerReference[]): string {
  if (!winners.length) {
    return "REFERÊNCIAS DE PERFORMANCE: nenhuma peça com receita registrada nos últimos 30 dias. Escreva a partir do briefing apenas, e não invente números nem resultados anteriores.";
  }

  const money = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const comTexto = winners.filter((w) => w.transcript);

  const lines = winners.map((w, i) => {
    const roas = w.roas !== null ? `${w.roas.toFixed(2)}x` : "sem base";
    const head = `${i + 1}. "${w.adName}" — investimento ${money(w.spend)}, receita líquida ${money(w.revenue)}, ROAS ${roas}.`;
    const body = w.transcript
      ? `   TEXTO DA PEÇA:\n   ${w.transcript.replace(/\s+/g, " ").trim()}`
      : "   TEXTO DA PEÇA: não transcrito. Use apenas o nome como pista de ângulo — NÃO suponha o que estava escrito nela.";
    return `${head}\n${body}`;
  });

  /*
   * A instrução muda conforme haja ou não texto real para seguir. Mandar
   * "siga estritamente as referências" quando nenhuma delas tem conteúdo é
   * pedir que o modelo invente um padrão e o obedeça.
   */
  const instrucao = comTexto.length
    ? [
        "",
        `SIGA ESTES MODELOS. ${comTexto.length} das referências acima trazem o texto real da peça — eles são o padrão que converte NESTA conta, e a sua copy deve se parecer com eles:`,
        "- Reproduza a ESTRUTURA: a ordem em que o argumento é construído, o tipo de gancho de abertura, onde a oferta entra, como o CTA é formulado.",
        "- Reproduza o REGISTRO: comprimento de frase, nível de formalidade, uso de pergunta, de número, de primeira ou segunda pessoa.",
        "- Prefira ângulos vizinhos aos que já funcionaram a ângulos novos e não testados.",
        "- O corpo pode ser tão longo quanto o das referências. Não corte o argumento pela metade para ficar curto: uma peça que converteu com cinco linhas converteu COM as cinco linhas.",
        "",
        "NÃO copie as frases literalmente e não cite os números de performance acima dentro da copy.",
      ].join("\n")
    : [
        "",
        "ATENÇÃO: nenhuma das referências acima tem o texto da peça transcrito — você tem os números, não a copy que os produziu.",
        "Portanto: NÃO afirme nem finja que está seguindo um padrão vencedor, e não invente o que essas peças diziam. Escreva a partir do briefing, e use os nomes apenas como indicação do tipo de ângulo que a conta costuma usar (depoimento de influenciador, unboxing, caixa de perguntas).",
      ].join("\n");

  return [
    `REFERÊNCIAS DE PERFORMANCE — as ${winners.length} peças com maior receita líquida nos últimos ${REFERENCE_WINDOW_DAYS} dias nesta conta:`,
    ...lines,
    instrucao,
  ].join("\n");
}

/**
 * O bloco do produto.
 *
 * O preço vai por plano e com a etiqueta de disponibilidade do próprio site,
 * porque é assim que a oferta existe: "a partir de R$ 151,91/mês em 36 meses" é
 * uma frase de anúncio, e "R$ 151,91" sozinho deixa o modelo escolher um prazo
 * que talvez nem seja oferecido para aquela peça.
 */
function buildProductBlock(brief: CopyBrief): string[] {
  const product = brief.product;

  if (!product) {
    const nome = brief.productName?.trim();
    return nome ? [`Produto / oferta: ${nome}`] : [];
  }

  const linhas = [
    `Produto: ${product.name}`,
    `Preço por plano: ${describePricing(product)}`,
  ];

  if (product.category) linhas.push(`Categoria: ${product.category}`);
  if (product.availabilityLabel) linhas.push(`Disponibilidade: ${product.availabilityLabel}`);
  if (product.deliveryDays !== null) {
    linhas.push(`Prazo de entrega: ${product.deliveryDays} dias`);
  }

  /*
   * O aviso de preço é o único ponto do prompt com "NUNCA" em maiúsculas: preço
   * inventado em anúncio de aluguel é problema de consumidor, não de estilo. O
   * contrato geral de `lib/ai.ts` já proíbe inventar dado, mas aqui a tentação é
   * concreta — há três números na mesa e o modelo tende a arredondar.
   */
  linhas.push(
    "Use EXATAMENTE estes valores ao citar preço. NUNCA arredonde, não invente desconto, não crie preço promocional e não cite um plano que não esteja na lista acima."
  );

  return linhas;
}

/** O bloco do público. */
function buildAudienceBlock(brief: CopyBrief): string[] {
  if (brief.audience) {
    return [
      `Público (público personalizado do Meta): ${describeAudience(brief.audience)}`,
      "O nome do público descreve a segmentação real desta conta — leia-o como briefing de quem é a pessoa e há quanto tempo ela demonstrou interesse. Não cite o nome do público na copy.",
    ];
  }

  const texto = brief.audienceText?.trim();
  return texto ? [`Público: ${texto}`] : [];
}

export function buildCopyPrompt(brief: CopyBrief, winners: WinnerReference[]): string {
  const variations = clampVariations(brief.variations);
  const formato = findFormat(brief.formatId);
  const tom = findTone(brief.toneId);

  const briefLines = [
    ...buildProductBlock(brief),
    ...buildAudienceBlock(brief),
    `Objetivo da peça: ${brief.objective}`,
    brief.channel ? `Canal: ${brief.channel}` : null,
    formato ? `Formato: ${formato.label} — ${formato.guidance}` : null,
    tom ? `Tom de voz: ${tom.label} — ${tom.guidance}` : null,
    // O tom escrito à mão vem depois do da lista e não no lugar dele: quem
    // escolheu um tom e ainda escreveu uma observação quer as duas coisas.
    brief.toneText?.trim() ? `Observação sobre o tom: ${brief.toneText.trim()}` : null,
    brief.constraints ? `Restrições obrigatórias: ${brief.constraints}` : null,
  ].filter(Boolean);

  /*
   * O corpo não tem teto de caracteres, e isso é uma decisão.
   *
   * Uma versão anterior impunha um orçamento apertado por formato — 50
   * caracteres no stories, 90 no feed — para caber na leitura de 3 segundos. O
   * resultado foi copy correta e genérica: com o espaço tomado pelo preço, não
   * sobrava nada do argumento, e o corpo virava uma etiqueta ("A partir de R$
   * 413,15/mês"). A régua certa é a peça que converteu, não um número redondo,
   * e quem corta é a equipe criativa ao montar a arte.
   */
  return `Você é redator publicitário da equipe de growth da Allu, que aluga eletrônicos por assinatura mensal. Escreva ${variations} variações de copy para a demanda abaixo.

A REGRA MAIS IMPORTANTE: as referências de performance mais abaixo são o padrão a seguir. Elas são as peças que realmente converteram nesta conta — a sua copy deve sair parecida com elas em estrutura e registro, não com um anúncio genérico de tecnologia.

BRIEFING
${briefLines.join("\n")}

${buildReferenceBlock(winners)}

O QUE TORNA UMA COPY RUIM AQUI
Frases que caberiam em qualquer anúncio de qualquer marca ("praticidade e economia", "a tecnologia que você merece", "sem complicação"). Benefício declarado sem prova nem consequência concreta. Corpo que só repete o preço que já está na headline. Se a variação pudesse ser usada por um concorrente trocando o nome do produto, ela está errada — reescreva.

FORMATO DA RESPOSTA
Para cada variação, use exatamente esta estrutura, nesta ordem:

### Variação N — <ângulo em 2 ou 3 palavras>
**Headline:** <uma linha>
**Corpo:** <o que o argumento exigir; siga o comprimento das referências>
**CTA:** <uma linha>
**Por que deve funcionar:** <uma frase ligando o ângulo ao que as referências mostram; se as referências não tiverem texto, ligue ao briefing e diga isso>

Cada variação parte de um ângulo DIFERENTE — não reescreva a mesma ideia com outras palavras. Sem introdução antes da primeira variação e sem fechamento depois da última.`;
}

/** Gera a copy e devolve o texto já limpo das manias de cada provedor. */
export async function generateCopy(brief: CopyBrief): Promise<{
  text: string;
  winners: WinnerReference[];
}> {
  const winners = await fetchWinnerReferences();
  const raw = await generateWithFallback(
    buildCopyPrompt(brief, winners),
    undefined,
    "gerar copy no módulo Creator"
  );

  return { text: normalizeAiOutput(raw), winners };
}

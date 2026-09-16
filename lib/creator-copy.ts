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
import { clampVariations, findChannel, findFormat, findTone } from "./copy-options";
import { describePricing, type AlluProduct } from "./allu-catalog";
import { describeAudience, type MetaAudience } from "./meta-audiences";
import { loadCategories, matchCategoryIndex, referenceCategoryIndex } from "./creative-categories";
import { type CreativeTotals } from "./creative-metrics";

/** Quantas peças vencedoras entram como referência. */
const REFERENCE_LIMIT = 6;

/**
 * A janela de atualidade.
 *
 * Não é o que define quem é vencedor — isso são as categorias, calculadas sobre
 * a veiculação inteira, como no painel. A janela define quem ainda está em jogo:
 * um vencedor que não entrega há dois meses é modelo de uma safra que acabou.
 */
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

  /** O id do formato — Estático Feed, Carrossel, Banner de categoria… */
  formatId?: string;

  /** O id do canal — é ele que define quais formatos existem. */
  channelId?: string;
  /** O rótulo do canal, já resolvido. Vai para a descrição do card. */
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
  /** A categoria da peça: "Prime Winners", "Super Winners", "Winners". */
  category: string;
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
/** Uma peça vencedora, com o que a seleção precisa saber sobre ela. */
interface WinnerRow {
  id: string;
  adName: string;
  category: string;
  spend: number;
  revenue: number;
  /** Receita na janela — é por ela que as vencedoras são ordenadas. */
  recentRevenue: number;
  transcript: string | null;
}

/**
 * As peças que servem de modelo — e a única definição disso no gerador.
 *
 * Antes eram as N de maior receita na janela de 30 dias, sem olhar categoria.
 * Isso deixava entrar peça de "Testando" que teve um bom mês, e peça de
 * "Validando" que ainda não provou nada — e a copy aprendia com material que a
 * própria operação não considera aprovado. Agora a regra é a do painel, vinda de
 * `lib/creative-categories.ts`: só a categoria **Winners**.
 *
 * As duas coisas usam recortes diferentes de propósito. A categoria é calculada
 * sobre a veiculação inteira, exatamente como na tela — é o que torna a peça
 * vencedora. A janela de 30 dias diz quem ainda está entregando, e ordena: entre
 * vencedoras, a mais relevante é a que está convertendo agora.
 *
 * `fetchWinnerAdIds` e `fetchWinnerReferences` saem daqui para não divergirem:
 * a transcrição precisa mirar exatamente as peças que o prompt vai ler, e duas
 * seleções paralelas iam parar em conjuntos diferentes no primeiro ajuste.
 */
async function selectWinners(limit: number): Promise<WinnerRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - REFERENCE_WINDOW_DAYS);

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const categories = loadCategories(settings);
  const alvo = referenceCategoryIndex(categories);

  // Sem uma categoria de referência configurada não há como dizer quem venceu.
  // Devolver "as de maior receita" aqui seria voltar, calado, ao critério que
  // esta função existe para substituir.
  if (alvo === -1) return [];

  /* Quem entregou na janela — candidatas, e a ordenação. */
  const janela = await prisma.adDailyMetrics.groupBy({
    by: ["adCreativeId"],
    where: {
      date: { gte: since },
      OR: [{ impressions: { gt: 0 } }, { spend: { gt: 0 } }],
    },
    _sum: { riskApprovedValue: true },
  });

  const candidatos = janela.map((j) => j.adCreativeId);
  if (!candidatos.length) return [];

  const ativos = await prisma.adCreative.findMany({
    where: { id: { in: candidatos }, status: { in: [...ACTIVE_AD_STATUSES] } },
    select: { id: true, adName: true, platform: true, visionTranscript: true },
  });
  if (!ativos.length) return [];

  /* E os totais de veiculação inteira, que são o que a categoria enxerga. */
  const vida = await prisma.adDailyMetrics.groupBy({
    by: ["adCreativeId"],
    where: {
      adCreativeId: { in: ativos.map((a) => a.id) },
      OR: [{ impressions: { gt: 0 } }, { spend: { gt: 0 } }],
    },
    _sum: {
      spend: true,
      grossValue: true,
      riskApprovedValue: true,
      impressions: true,
      clicks: true,
      purchases: true,
      netOrders: true,
    },
  });

  const totaisPorAd = new Map<string, CreativeTotals>(
    vida.map((v) => [
      v.adCreativeId,
      {
        spend: v._sum.spend ?? 0,
        grossValue: v._sum.grossValue ?? 0,
        riskApprovedValue: v._sum.riskApprovedValue ?? 0,
        impressions: v._sum.impressions ?? 0,
        clicks: v._sum.clicks ?? 0,
        purchases: v._sum.purchases ?? 0,
        netOrders: v._sum.netOrders ?? 0,
      },
    ])
  );

  const recentePorAd = new Map(janela.map((j) => [j.adCreativeId, j._sum.riskApprovedValue ?? 0]));

  const vencedoras: WinnerRow[] = [];

  for (const ad of ativos) {
    const totais = totaisPorAd.get(ad.id);
    if (!totais) continue;

    if (matchCategoryIndex(totais, ad.platform, categories) !== alvo) continue;

    vencedoras.push({
      id: ad.id,
      adName: ad.adName,
      category: categories[alvo].name,
      spend: totais.spend,
      revenue: totais.riskApprovedValue,
      recentRevenue: recentePorAd.get(ad.id) ?? 0,
      transcript: ad.visionTranscript,
    });
  }

  return vencedoras.sort((a, b) => b.recentRevenue - a.recentRevenue).slice(0, limit);
}

/** Os ids das peças de referência — é o que a transcrição visual mira. */
export async function fetchWinnerAdIds(limit = REFERENCE_LIMIT): Promise<string[]> {
  return (await selectWinners(limit)).map((w) => w.id);
}

export async function fetchWinnerReferences(limit = REFERENCE_LIMIT): Promise<WinnerReference[]> {
  return (await selectWinners(limit)).map((w) => ({
    adName: w.adName,
    category: w.category,
    spend: w.spend,
    revenue: w.revenue,
    roas: w.spend > 0 ? w.revenue / w.spend : null,
    transcript: w.transcript,
  }));
}

function buildReferenceBlock(winners: WinnerReference[]): string {
  if (!winners.length) {
    return "REFERÊNCIAS DE PERFORMANCE: nenhuma peça aprovada como Winner entregando nos últimos 30 dias. Escreva a partir do briefing apenas, e não invente números nem resultados anteriores.";
  }

  const money = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const comTexto = winners.filter((w) => w.transcript);

  const lines = winners.map((w, i) => {
    const roas = w.roas !== null ? `${w.roas.toFixed(2)}x` : "sem base";
    const head = `${i + 1}. "${w.adName}" [${w.category}] — investimento ${money(w.spend)}, receita líquida ${money(w.revenue)}, ROAS ${roas}.`;
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
    /*
     * O cabeçalho diz de onde as peças saíram, porque isso muda o que elas
     * significam. "As de maior receita" incluiria o acaso de um mês bom; "as
     * aprovadas como Winner" é uma peça que a operação já decidiu que funciona —
     * e é justamente por serem o padrão repetível, e não o fora da curva, que
     * elas servem de molde.
     */
    `REFERÊNCIAS DE PERFORMANCE — ${winners.length} peça(s) classificadas como **Winners** nesta conta (aprovadas na validação e ainda entregando nos últimos ${REFERENCE_WINDOW_DAYS} dias):`,
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
  const canal = findChannel(brief.channelId);

  const briefLines = [
    ...buildProductBlock(brief),
    ...buildAudienceBlock(brief),
    `Objetivo da peça: ${brief.objective}`,
    /*
     * O canal entra com a sua instrução, e não só com o nome. "Canal: Meta" não
     * diz ao modelo que o texto é cortado em 125 caracteres pelo "ver mais", nem
     * que ele fica acima do criativo — e são essas duas coisas que mudam onde o
     * argumento precisa estar.
     */
    canal ? `Canal: ${canal.label} — ${canal.guidance}` : brief.channel ? `Canal: ${brief.channel}` : null,
    formato ? `Formato: ${formato.label} — ${formato.guidance}` : null,
    tom ? `Tom de voz: ${tom.label} — ${tom.guidance}` : null,
    /*
     * O texto livre é o tom quando não há um da lista — é o que a opção "Outro /
     * especifique" produz. Rotulá-lo sempre como "observação" faria o único tom
     * informado chegar ao modelo como nota de rodapé de um tom que não existe.
     * Os dois juntos ainda são aceitos, e aí o texto complementa o rótulo.
     */
    brief.toneText?.trim()
      ? tom
        ? `Observação sobre o tom: ${brief.toneText.trim()}`
        : `Tom de voz: ${brief.toneText.trim()}`
      : null,
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

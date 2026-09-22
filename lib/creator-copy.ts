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
import { parseCopyVariations } from "./copy-parse";
import { ACTIVE_AD_STATUSES } from "./ad-status";
import {
  channelGuidanceFor,
  clampBodyMaxWords,
  clampVariations,
  estimateOutputTokens,
  findPieceKind,
  findTone,
  formatGuidanceFor,
  splitVariations,
  type CopyPieceKind,
} from "./copy-options";
import { describePricing, type AlluProduct } from "./allu-catalog";
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
   * Os produtos escolhidos no catálogo da Allu.
   *
   * Vindos do catálogo e não digitados: o preço que entra na copy passa a ser o
   * preço que está no site, e não o que alguém lembrava. Continua opcional
   * porque nem toda peça é de um produto — campanha institucional, por exemplo.
   *
   * São VÁRIOS porque uma demanda costuma cobrir um lançamento inteiro — os
   * iPhone 16 e 17 na mesma leva. O número de variações pedido é o total, e ele
   * se reparte entre eles; ver `splitVariations`.
   */
  products?: AlluProduct[];
  /** O nome livre, quando a peça não é de um produto do catálogo. */
  productName?: string;

  /** O que a peça precisa provocar. */
  objective: string;

  /** O id do tom na lista predefinida — ver `lib/copy-options.ts`. */
  toneId?: string;
  /** Tom escrito à mão, quando nenhum da lista serve. */
  toneText?: string;

  /**
   * O formato, pelo RÓTULO que o quadro usa — "Reels (9:16)", "Banner de
   * Categoria".
   *
   * Era o id de uma lista fixa em `lib/copy-options.ts`. A lista do gerador e a
   * do formulário não se encontravam, e quem configurava formatos novos no
   * quadro não os via aqui. Agora o vocabulário é um só: o do quadro. A
   * orientação de escrita que aquela lista guarda continua sendo usada, buscada
   * pelo nome — ver `formatGuidanceFor`.
   */
  format?: string;

  /** O canal, pelo rótulo do quadro. É ele que define quais formatos existem. */
  channel?: string;

  /**
   * O que a peça é — estático, vídeo ou landing page.
   *
   * Deduzido do nome do formato e confirmado na tela. É ele que decide o que o
   * campo "corpo" significa: argumento, roteiro de gravação ou texto de página.
   */
  pieceKind?: string;

  /**
   * Teto de palavras do corpo. A headline não tem teto — quem a corta é a arte.
   */
  bodyMaxWords?: number;
  /** Quantas variações, de 1 a 12. */
  variations?: number;
  /** Restrições: o que não dizer, termos obrigatórios, limite de caracteres. */
  constraints?: string;
}

/**
 * Os nomes dos produtos, venham do catálogo ou digitados.
 *
 * Com vários, separados por " + " — é o que vai para o título do card e para a
 * descrição, e "iPhone 16 + iPhone 17" diz de relance o que a demanda cobre.
 */
export function briefProductName(brief: CopyBrief): string {
  const doCatalogo = (brief.products ?? []).map((p) => p.name);
  const livre = brief.productName?.trim();
  return [...doCatalogo, ...(livre ? [livre] : [])].join(" + ");
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

function buildReferenceBlock(winners: WinnerReference[], peca: CopyPieceKind): string {
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
        comTexto.length === 1
          ? "O QUE APROVEITAR DESTES MODELOS. 1 das referências acima traz o texto real da peça — ela é o padrão que converte NESTA conta:"
          : `O QUE APROVEITAR DESTES MODELOS. ${comTexto.length} das referências acima trazem o texto real da peça — elas são o padrão que converte NESTA conta:`,
        ...peca.referenceBullets.map((regra) => `- ${regra}`),
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
function describeProduct(product: AlluProduct, titulo: string): string[] {
  const linhas = [`${titulo}: ${product.name}`, `Preço por plano: ${describePricing(product)}`];

  if (product.category) linhas.push(`Categoria: ${product.category}`);
  if (product.availabilityLabel) linhas.push(`Disponibilidade: ${product.availabilityLabel}`);
  if (product.deliveryDays !== null) {
    linhas.push(`Prazo de entrega: ${product.deliveryDays} dias`);
  }

  return linhas;
}

/*
 * O aviso de preço é o único ponto do prompt com "NUNCA" em maiúsculas: preço
 * inventado em anúncio de aluguel é problema de consumidor, não de estilo. O
 * contrato geral de `lib/ai.ts` já proíbe inventar dado, mas aqui a tentação é
 * concreta — há três números na mesa e o modelo tende a arredondar. Com mais de
 * um produto a tentação piora: são três números POR produto, e trocá-los entre
 * um iPhone 16 e um 17 é o erro mais provável desta tela.
 */
const AVISO_DE_PRECO =
  "Use EXATAMENTE estes valores ao citar preço. NUNCA arredonde, não invente desconto, não crie preço promocional e não cite um plano que não esteja na lista acima.";

function buildProductBlock(brief: CopyBrief): string[] {
  const produtos = brief.products ?? [];
  const nomeLivre = brief.productName?.trim();

  if (produtos.length === 0) {
    return nomeLivre ? [`Produto / oferta: ${nomeLivre}`] : [];
  }

  if (produtos.length === 1) {
    return [...describeProduct(produtos[0], "Produto"), AVISO_DE_PRECO];
  }

  /*
   * Vários produtos: cada um com o seu bloco e com a SUA cota de variações.
   *
   * O número pedido é o total e se reparte entre eles (ver `splitVariations`) —
   * repartição que é decidida aqui, no mesmo lugar que a tela consulta para
   * mostrar a divisão antes de gerar. Dizer a cota dentro do bloco de cada
   * produto, e não numa lista à parte, é o que impede o modelo de escrever doze
   * variações de um e nenhuma do outro.
   */
  const cotas = splitVariations(brief.variations ?? produtos.length, produtos);

  const linhas = [
    `Esta demanda cobre ${produtos.length} produtos. Cada variação é de UM produto só — nunca misture dois na mesma peça, e nunca use o preço de um ao falar do outro.`,
  ];

  produtos.forEach((produto, i) => {
    const cota = cotas.find((c) => c.id === produto.id)?.variations ?? 0;
    if (cota === 0) return;
    linhas.push(
      "",
      `PRODUTO ${i + 1} — escreva exatamente ${cota} ${cota === 1 ? "variação" : "variações"} deste:`,
      ...describeProduct(produto, "Nome")
    );
  });

  if (nomeLivre) linhas.push("", `Observação sobre a oferta: ${nomeLivre}`);
  linhas.push("", AVISO_DE_PRECO);

  return linhas;
}

/**
 * O que cada seção de uma landing page precisa conter.
 *
 * Sem isto, "Seção Comparativo" é um nome e o modelo inventa o que quiser ali —
 * ou escreve sobre o comparativo em vez de escrever o comparativo. A descrição é
 * o que transforma o esqueleto em texto pronto para montar.
 */
function descreveSecao(nome: string): string {
  const porNome: Record<string, string> = {
    Home: "o topo da página: headline, uma linha de apoio que explica o modelo de aluguel em uma frase, e a chamada principal. É o que a pessoa vê antes de rolar",
    Benefícios:
      "de três a cinco benefícios, cada um com título curto e uma frase de explicação. Benefício é consequência para quem aluga, não característica do aparelho",
    Comparativo:
      "alugar na Allu contra comprar: os dois lados, honestos, com os números que o briefing deu. Sem inventar preço de concorrente nem de loja",
    "Prova Social":
      "o texto de apoio da seção e a moldura dos depoimentos. Se o briefing não trouxer depoimento ou número de clientes reais, escreva o texto em volta e marque entre colchetes exatamente o dado que falta — nunca invente depoimento",
    Formulário:
      "o texto que convence a preencher: título da seção, uma linha dizendo o que acontece depois de enviar, os rótulos dos campos e o texto do botão",
  };

  return (
    porNome[nome] ??
    `o texto pronto da seção ${nome}, completo e utilizável como está`
  );
}

export function buildCopyPrompt(brief: CopyBrief, winners: WinnerReference[]): string {
  const variations = clampVariations(brief.variations);
  const tom = findTone(brief.toneId);

  /*
   * A orientação de escrita é procurada pelo NOME do canal e do formato.
   *
   * Os dois vêm do quadro, onde a equipe os configura, e ali só existe o rótulo
   * — um formulário não tem onde guardar um parágrafo dizendo ao modelo que o
   * texto do Meta é cortado aos 125 caracteres. Esse parágrafo continua em
   * `lib/copy-options.ts` e é reencontrado pelo rótulo; quando não há, o prompt
   * leva o nome sozinho, que já orienta bastante.
   */
  const orientacaoDoCanal = channelGuidanceFor(brief.channel);
  const orientacaoDoFormato = formatGuidanceFor(brief.format);

  const briefLines = [
    ...buildProductBlock(brief),
    `Objetivo da peça: ${brief.objective}`,
    /*
     * O canal entra com a sua instrução, e não só com o nome. "Canal: Meta" não
     * diz ao modelo que o texto é cortado em 125 caracteres pelo "ver mais", nem
     * que ele fica acima do criativo — e são essas duas coisas que mudam onde o
     * argumento precisa estar.
     */
    brief.channel
      ? `Canal: ${brief.channel}${orientacaoDoCanal ? ` — ${orientacaoDoCanal}` : ""}`
      : null,
    brief.format
      ? `Formato: ${brief.format}${orientacaoDoFormato ? ` — ${orientacaoDoFormato}` : ""}`
      : null,
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
   * O tipo da peça é a primeira coisa que o modelo precisa saber, e por isso vai
   * no topo do briefing e não no fim: "escreva um anúncio" e "escreva um roteiro
   * para gravar" são pedidos diferentes, e o resto do briefing é lido à luz do
   * qual dos dois é.
   */
  const peca = findPieceKind(brief.pieceKind);
  briefLines.unshift(`Tipo de peça: ${peca.label} — ${peca.guidance}`);

  /*
   * O teto do corpo é um MÁXIMO em palavras, escolhido por quem abre a demanda —
   * e essa é a diferença que faz ele não repetir o erro do teto anterior.
   *
   * Uma versão antiga impunha um orçamento por formato, em caracteres e fixo no
   * código: 50 no stories, 90 no feed. A copy saía correta e genérica, porque o
   * preço comia o espaço e o corpo virava etiqueta ("A partir de R$ 413,15/mês").
   * O defeito não era existir um limite: era ser apertado, em caracteres, e igual
   * para peças que não são a mesma coisa.
   *
   * Agora o número é do pedido, o padrão muda com o tipo da peça — um roteiro de
   * vídeo nasce com quase quatro vezes o espaço de um estático — e é teto, não
   * alvo: o modelo é instruído a usar o que o argumento exigir e parar aí. A
   * headline segue livre, porque quem corta headline é a arte.
   */
  const tetoDoCorpo = clampBodyMaxWords(brief.bodyMaxWords, peca.id);
  /*
   * O pedido e o papel das referências mudam com o tipo da peça.
   *
   * Eram fixos, escritos para anúncio: "escreva N variações de copy" e "as
   * referências são o padrão a seguir em estrutura e registro". Com isso, pedir
   * uma landing page devolvia um criativo comprido — o modelo estava sendo
   * mandado, na frase mais enfática do prompt, a imitar a estrutura de um anúncio
   * de feed.
   */
  return `Você é redator publicitário da equipe de growth da Allu, que aluga eletrônicos por assinatura mensal. Escreva ${variations} ${variations === 1 ? peca.unitLabelOne : peca.unitLabel} para a demanda abaixo.

A REGRA MAIS IMPORTANTE: as referências de performance mais abaixo são as peças que realmente converteram nesta conta — ${peca.referenceUse}.

BRIEFING
${briefLines.join("\n")}

${buildReferenceBlock(winners, peca)}

O QUE TORNA UMA COPY RUIM AQUI
Frases que caberiam em qualquer anúncio de qualquer marca ("praticidade e economia", "a tecnologia que você merece", "sem complicação"). Benefício declarado sem prova nem consequência concreta. Corpo que só repete o preço que já está na headline. Se a variação pudesse ser usada por um concorrente trocando o nome do produto, ela está errada — reescreva.

FORMATO DA RESPOSTA
Para cada ${peca.sections ? "versão da página" : "variação"}, use exatamente esta estrutura, nesta ordem:

### Variação N — ${(brief.products?.length ?? 0) > 1 ? "<nome do produto> · <ângulo em 2 ou 3 palavras>" : "<ângulo em 2 ou 3 palavras>"}
**Headline:** <uma linha, sem limite de palavras>
${
    peca.sections
      ? peca.sections
          .map((secao) => `**Seção ${secao}:** <${descreveSecao(secao)}>`)
          .join("\n")
      : `**${peca.bodyLabel}:** <${peca.bodyInstruction} NO MÁXIMO ${tetoDoCorpo} palavras — é teto, não alvo: use o que o argumento exigir e pare aí>`
  }
**CTA:** <uma linha>
**Por que deve funcionar:** <uma frase ligando o ângulo ao que as referências mostram; se as referências não tiverem texto, ligue ao briefing e diga isso>

${
    peca.sections
      ? `As seções são OBRIGATÓRIAS e saem todas, nesta ordem, uma linha \`**Seção Nome:**\` seguida do texto pronto daquela seção. Acrescente outra seção se o briefing pedir; nunca omita uma das listadas. O limite de ${tetoDoCorpo} palavras é a soma de TODAS as seções de uma versão — reparta entre elas conforme o peso de cada uma.`
      : `O limite de ${tetoDoCorpo} palavras vale para o campo ${peca.bodyLabel} de CADA variação, contado separadamente. Passar do teto é erro — reescreva mais curto em vez de entregar mais longo.`
  }

Cada variação parte de um ângulo DIFERENTE — não reescreva a mesma ideia com outras palavras. Sem introdução antes da primeira variação e sem fechamento depois da última.${
    (brief.products?.length ?? 0) > 1
      ? "\n\nAgrupe as variações por produto, na ordem em que os produtos aparecem no briefing, e comece o título de cada uma pelo nome do produto — é assim que quem produz sabe de qual peça cada texto é."
      : ""
  }`;
}

/** Gera a copy e devolve o texto já limpo das manias de cada provedor. */
/** Texto comparável: sem acento, sem caixa, sem pontuação de borda. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface FormatIssue {
  /** O que faltou, numa frase para quem clicou em gerar. */
  message: string;
  /** A instrução corretiva mandada ao modelo na segunda tentativa. */
  fix: string;
}

/**
 * A resposta obedeceu ao FORMATO que foi pedido?
 *
 * Instrução no prompt não é garantia. A mesma demanda pode ser atendida por
 * qualquer um dos sete provedores da cadeia de fallback, e a obediência a um
 * contrato de saída varia muito entre eles — o que chegou como landing page num
 * dia pode voltar como parágrafo de anúncio no outro, sem nada ter mudado aqui.
 * Conferir a saída é o que transforma o formato em garantia em vez de pedido: o
 * que não passa volta para uma segunda rodada, com a correção nomeada.
 *
 * A checagem é ESTRUTURAL, não de gosto: seções presentes, falas marcadas no
 * tempo, quantidade de variações. Julgar a qualidade do texto é trabalho de quem
 * pediu — julgar se ele tem a forma pedida é trabalho do código.
 */
export function checkCopyFormat(text: string, brief: CopyBrief): FormatIssue[] {
  const peca = findPieceKind(brief.pieceKind);
  const variacoes = parseCopyVariations(text);
  const problemas: FormatIssue[] = [];

  if (variacoes.length === 0) {
    return [
      {
        message: "A IA respondeu fora do formato de variações — o texto veio corrido.",
        fix: "Devolva as variações no formato pedido, cada uma começando por `### Variação N — ângulo`.",
      },
    ];
  }

  const pedidas = clampVariations(brief.variations);
  if (variacoes.length < pedidas) {
    problemas.push({
      message: `Foram pedidas ${pedidas} variações e vieram ${variacoes.length}.`,
      fix: `Devolva exatamente ${pedidas} variações. Vieram ${variacoes.length}.`,
    });
  }

  if (peca.sections) {
    /*
     * Cada versão precisa trazer TODAS as seções. É o defeito mais comum desta
     * peça: o modelo escreve um parágrafo bom e ignora o esqueleto, devolvendo
     * um criativo comprido com cara de página.
     */
    const faltando = new Set<string>();
    for (const v of variacoes) {
      const corpo = chave(v.body);
      for (const secao of peca.sections) {
        if (!corpo.includes(`${chave(secao)}:`)) faltando.add(secao);
      }
    }

    if (faltando.size) {
      const lista = [...faltando].join(", ");
      problemas.push({
        message: `A página voltou sem ${faltando.size === 1 ? "a seção" : "as seções"}: ${lista}.`,
        fix: `Toda versão da página tem de trazer TODAS as seções, cada uma numa linha \`**Seção Nome:**\` seguida do texto pronto. ${faltando.size === 1 ? "Faltou" : "Faltaram"}: ${lista}.`,
      });
    }
  }

  if (peca.id === "video") {
    /*
     * Roteiro sem marcação de tempo é legenda: o sinal de que o modelo escreveu
     * um texto de anúncio em vez das falas na ordem em que são ditas.
     */
    const semMarcacao = variacoes.filter(
      (v) => (v.body.match(/\(\s*\d+\s*[-–—a]\s*\d+\s*s\s*\)/gi) ?? []).length < 2
    );

    if (semMarcacao.length) {
      problemas.push({
        message: "O roteiro voltou sem as falas marcadas no tempo — veio como legenda.",
        fix: "O roteiro é uma FALA POR LINHA, cada linha começando pela marcação de tempo — `(0-3s) fala`, `(3-8s) fala`. Não escreva um parágrafo corrido.",
      });
    }
  }

  return problemas;
}

/**
 * O pedido de correção: o prompt original, a resposta recusada e o que houve de
 * errado com ela.
 *
 * A resposta anterior vai junto de propósito. O que costuma falhar é a FORMA, e
 * não o conteúdo — mandar reescrever do zero jogaria fora um argumento que já
 * estava bom para recuperar um esqueleto que faltava.
 */
function buildRepairPrompt(promptOriginal: string, anterior: string, problemas: FormatIssue[]): string {
  return `${promptOriginal}

---

ATENÇÃO: uma resposta anterior a este mesmo pedido foi RECUSADA por não obedecer ao formato. Os problemas foram:
${problemas.map((p) => `- ${p.fix}`).join("\n")}

Esta era a resposta recusada:
${anterior}

Reescreva-a INTEIRA no formato pedido acima, corrigindo os problemas listados. Aproveite o conteúdo que já estava bom — o que foi recusado é a forma. Responda apenas com as variações, sem comentar esta correção.`;
}

export async function generateCopy(brief: CopyBrief): Promise<{
  text: string;
  winners: WinnerReference[];
  /** O que continuou fora do formato depois da tentativa de correção. */
  formatIssues: string[];
}> {
  const winners = await fetchWinnerReferences();
  const prompt = buildCopyPrompt(brief, winners);

  /*
   * O espaço de resposta é pedido conforme o tamanho do trabalho.
   *
   * Era fixo em `AI_MAX_TOKENS`, e isso bastava enquanto toda saída era um
   * anúncio curto. Uma landing page de mil palavras não cabe ali: a resposta
   * chegava cortada no meio de uma seção, e a checagem de formato acusava seção
   * faltando sem que o modelo tivesse desobedecido a nada.
   */
  const orcamento = estimateOutputTokens(
    (clampBodyMaxWords(brief.bodyMaxWords, findPieceKind(brief.pieceKind).id) + 40) *
      clampVariations(brief.variations)
  );

  const raw = await generateWithFallback(
    prompt,
    undefined,
    "gerar copy no módulo Creator",
    orcamento
  );
  let texto = normalizeAiOutput(raw);
  let problemas = checkCopyFormat(texto, brief);

  /*
   * UMA segunda tentativa, e só quando a primeira falhou no formato.
   *
   * Uma, e não várias: cada rodada custa uma chamada e alguns segundos de espera
   * de quem está olhando a tela, e um modelo que errou o formato duas vezes
   * seguidas não vai acertar na terceira — a essa altura o que resolve é a
   * pessoa trocar a ordem dos provedores ou ajustar o pedido, e para isso ela
   * precisa é de um aviso, não de mais espera.
   */
  if (problemas.length > 0) {
    try {
      const corrigido = normalizeAiOutput(
        await generateWithFallback(
          buildRepairPrompt(prompt, texto, problemas),
          undefined,
          "corrigir o formato da copy no módulo Creator",
          orcamento
        )
      );

      const restantes = checkCopyFormat(corrigido, brief);
      // Só troca se a segunda for melhor: uma correção que piora o formato é
      // pior que o texto original, que ao menos a pessoa já podia editar.
      if (restantes.length < problemas.length) {
        texto = corrigido;
        problemas = restantes;
      }
    } catch (erro) {
      // A cadeia inteira caiu na segunda chamada. O texto da primeira continua
      // valendo — devolvê-lo com aviso é melhor do que perder a geração.
      console.error("[Copy] Falha ao tentar corrigir o formato:", erro);
    }
  }

  return { text: texto, winners, formatIssues: problemas.map((p) => p.message) };
}

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
 * Por onde a peça é comprada.
 *
 * O canal era um campo de texto livre, e virou lista porque ele é a pergunta de
 * cima: um formato só existe dentro de um canal. "Carrossel" quer dizer coisas
 * diferentes no Meta e no TikTok, e "Banner de categoria" não quer dizer nada
 * fora do site — oferecer os dezenove formatos de uma vez obrigava quem preenche
 * a filtrar de cabeça uma lista em que a maioria das linhas não se aplica.
 *
 * O vocabulário é o que a plataforma já usa: as fontes de `lib/channels.ts`
 * (Meta, TikTok), os canais do formulário padrão do Kanban (Google, Orgânico,
 * CRM) e o site, que é de onde vêm os três formatos de banner.
 */
export const COPY_CHANNELS = [
  {
    id: "meta",
    label: "Meta",
    /** O que o leilão e a superfície impõem à escrita, dito ao modelo. */
    guidance:
      "Meta Ads (Instagram e Facebook). O texto principal fica acima do criativo e é cortado por \"ver mais\" perto dos 125 caracteres — a primeira linha precisa segurar sozinha.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    guidance:
      "TikTok Ads. A legenda é curta e aparece sobre o vídeo, disputando espaço com a interface. Linguagem de quem está na plataforma, não de quem está anunciando nela.",
  },
  {
    id: "google",
    label: "Google",
    guidance:
      "Google Ads. Quem vê ou já procurou pelo produto, ou está em contexto de leitura — em nenhum dos dois casos há tolerância para rodeio.",
  },
  {
    id: "site",
    label: "Site",
    guidance:
      "Peça do próprio site da allu. Quem lê já está na loja: não há marca a apresentar, e o clique leva direto para o produto.",
  },
  {
    id: "crm",
    label: "CRM",
    guidance:
      "Disparo para a base própria — gente que já se cadastrou ou já alugou. Trate como conversa com quem conhece a marca, não como anúncio de primeira impressão.",
  },
  {
    id: "organico",
    label: "Orgânico",
    guidance:
      "Post sem mídia paga. Não há leilão a vencer, há atenção a merecer: o texto precisa valer a leitura mesmo de quem não estava procurando nada.",
  },
] as const;

export type CopyChannelId = (typeof COPY_CHANNELS)[number]["id"];

export function findChannel(id: string | undefined | null) {
  return COPY_CHANNELS.find((c) => c.id === id) ?? null;
}

/**
 * Onde a peça vai rodar, dentro do canal.
 *
 * Não é o mesmo que "canal": o canal diz em qual leilão se compra, o formato diz
 * a forma da peça. Um banner de categoria e um story têm proporção, quantidade
 * de texto e distância do clique completamente diferentes — e é isso que muda a
 * copy.
 *
 * O `channelId` é o que liga os dois. O id do formato carrega o canal no nome
 * porque "carrossel" existe em mais de um lugar, e dois formatos com o mesmo id
 * fariam a lista devolver o primeiro que aparecesse.
 */
export const COPY_FORMATS = [
  {
    id: "meta-feed-stories",
    channelId: "meta",
    label: "Estático Feed e Stories",
    /** Como o formato se anuncia no título do card do Kanban — ver `buildCopyCardTitle`. */
    cardLabel: "Criativos Feed e Stories",
    /** O que o formato impõe à escrita, dito ao modelo. */
    guidance:
      "Peça estática que roda em feed e em stories ao mesmo tempo. O texto precisa funcionar nas duas proporções: headline curta o bastante para o vertical e corpo que ainda faça sentido no feed.",
  },
  {
    id: "meta-feed",
    channelId: "meta",
    label: "Estático Feed",
    cardLabel: "Criativos Feed",
    guidance:
      "Peça estática de feed (1:1 ou 4:5), lida com o polegar parado. Comporta corpo de texto mais longo, e a headline precisa sobreviver ao corte de \"ver mais\".",
  },
  {
    id: "meta-stories",
    channelId: "meta",
    label: "Estático Stories",
    cardLabel: "Criativos Stories",
    guidance:
      "Peça estática de stories (9:16, tela cheia), lida em menos de 3 segundos e com o dedo pronto para pular. Uma ideia só, CTA que combina com deslizar para cima.",
  },
  {
    id: "meta-carrossel",
    channelId: "meta",
    label: "Carrossel",
    cardLabel: "Carrosséis",
    guidance:
      "Carrossel do Meta. Cada cartão precisa entregar uma ideia inteira e deixar uma razão para deslizar até o próximo; o último é o que fecha. Escreva o texto principal pensando que ele vale para a sequência toda.",
  },
  {
    id: "tiktok-video",
    channelId: "tiktok",
    label: "Vídeo In-Feed",
    cardLabel: "Vídeos In-Feed",
    guidance:
      "Vídeo in-feed do TikTok (9:16). O gancho vive nos dois primeiros segundos e costuma ser falado, não escrito — a copy aqui é a legenda curta e a fala de abertura.",
  },
  {
    id: "tiktok-spark",
    channelId: "tiktok",
    label: "Spark Ads",
    cardLabel: "Spark Ads",
    guidance:
      "Post orgânico impulsionado. Precisa continuar parecendo post: legenda de criador, sem estrutura de anúncio e sem CTA de vitrine.",
  },
  {
    id: "tiktok-carrossel",
    channelId: "tiktok",
    label: "Carrossel",
    cardLabel: "Carrosséis TikTok",
    guidance:
      "Carrossel de imagens no TikTok. Texto curto sobre cada imagem, no ritmo de quem desliza rápido — mais próximo de um meme comentado do que de um catálogo.",
  },
  {
    id: "google-pesquisa",
    channelId: "google",
    label: "Pesquisa (texto)",
    cardLabel: "Anúncios de pesquisa",
    guidance:
      "Anúncio de pesquisa: títulos de até 30 caracteres e descrições de até 90. Escreva cada linha para fazer sentido sozinha — o Google as combina em ordens que você não escolhe. Use a palavra que a pessoa procurou.",
  },
  {
    id: "google-display",
    channelId: "google",
    label: "Display responsivo",
    cardLabel: "Peças de display",
    guidance:
      "Display responsivo: a peça aparece no meio do conteúdo alheio, em tamanhos que você não controla. Uma promessa por vez, headline que não depende do corpo para ser entendida.",
  },
  {
    id: "google-youtube",
    channelId: "google",
    label: "Vídeo YouTube",
    cardLabel: "Vídeos YouTube",
    guidance:
      "Vídeo no YouTube, com o botão de pular à espreita. Os cinco primeiros segundos precisam dar uma razão para ficar, e o nome do produto precisa ser dito, não só escrito na tela.",
  },
  {
    id: "site-banner",
    channelId: "site",
    label: "Banner site",
    cardLabel: "Banners site",
    guidance:
      "Banner do site, horizontal, no topo da página. Quem lê já está na loja — não há necessidade de apresentar a marca. Headline curta, uma promessa, CTA de ação imediata.",
  },
  {
    id: "site-mini-banner",
    channelId: "site",
    label: "Mini banner site",
    cardLabel: "Mini banners site",
    guidance:
      "Mini banner do site, área pequena. Espaço para pouquíssimo texto: uma linha de headline e um CTA de duas ou três palavras. NÃO escreva corpo de texto — não há onde exibi-lo.",
  },
  {
    id: "site-banner-categoria",
    channelId: "site",
    label: "Banner de categoria",
    cardLabel: "Banners de categoria",
    guidance:
      "Banner de uma categoria do site. Quem vê já demonstrou interesse naquela categoria — a copy fala do recorte, não do catálogo inteiro, e destaca o diferencial dentro daquela linha de produtos.",
  },
  {
    id: "crm-email",
    channelId: "crm",
    label: "E-mail",
    cardLabel: "E-mails",
    guidance:
      "E-mail para a base. O assunto é a peça inteira até alguém abrir: escreva-o como headline, com até 50 caracteres. O corpo pode desenvolver o argumento — é o único formato aqui em que há tempo para isso.",
  },
  {
    id: "crm-push",
    channelId: "crm",
    label: "Push",
    cardLabel: "Pushes",
    guidance:
      "Notificação push: um título curtíssimo e uma linha, lidos na tela bloqueada, fora de contexto. Sem urgência inventada — push que engana desinstala aplicativo.",
  },
  {
    id: "crm-whatsapp",
    channelId: "crm",
    label: "WhatsApp",
    cardLabel: "Disparos WhatsApp",
    guidance:
      "Mensagem de WhatsApp. Chega junto das conversas pessoais de alguém: tom de mensagem, não de comunicado, e curta o bastante para ser lida sem abrir a conversa.",
  },
  {
    id: "organico-feed",
    channelId: "organico",
    label: "Post de feed",
    cardLabel: "Posts de feed",
    guidance:
      "Post orgânico de feed. Sem verba empurrando, a primeira linha é o que decide se alguém continua. Pode ter ponto de vista, o que um anúncio raramente comporta.",
  },
  {
    id: "organico-stories",
    channelId: "organico",
    label: "Stories",
    cardLabel: "Stories",
    guidance:
      "Stories orgânico, em sequência com os outros do dia. Uma ideia por tela, linguagem falada, e espaço para convite direto (enquete, caixinha, arrasta).",
  },
  {
    id: "organico-reels",
    channelId: "organico",
    label: "Reels",
    cardLabel: "Reels",
    guidance:
      "Reels. O texto é roteiro: gancho falado nos dois primeiros segundos, desenvolvimento curto e um fecho que justifique ter ficado até o fim. A legenda é secundária.",
  },
] as const;

export type CopyFormatId = (typeof COPY_FORMATS)[number]["id"];

export function findFormat(id: string | undefined | null) {
  return COPY_FORMATS.find((f) => f.id === id) ?? null;
}

/** Os formatos de um canal. Sem canal, lista vazia — e não a lista inteira. */
export function formatsForChannel(channelId: string | undefined | null) {
  return COPY_FORMATS.filter((f) => f.channelId === channelId);
}

/** O formato pertence ao canal escolhido? Nulo em qualquer dos dois é "não dá para dizer". */
export function formatBelongsToChannel(
  formatId: string | undefined | null,
  channelId: string | undefined | null
): boolean {
  const formato = findFormat(formatId);
  return !!formato && !!channelId && formato.channelId === channelId;
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

/**
 * O título do card no Kanban: `Criativos Feed e Stories • iPhone 17 • 12 Peças`.
 *
 * Quem produz lê a coluna inteira de relance, e "Copy — iPhone 17 Pro Max" não
 * dizia nem o que era para fazer nem quanta coisa havia ali dentro: a diferença
 * entre uma peça e doze só aparecia depois de abrir o card. Nesta ordem — tipo,
 * produto, quantidade — porque é a ordem em que a pergunta é feita: "é banner ou
 * criativo? de quê? quantos?".
 *
 * Mora aqui, e não na rota, porque a tela do gerador mostra o título antes de
 * enviar. Com duas montagens, a prévia e o card divergiriam.
 */
export function buildCopyCardTitle({
  formatId,
  productName,
  variations,
}: {
  formatId?: string | null;
  productName?: string | null;
  variations: number;
}): string {
  const partes = [
    findFormat(formatId)?.cardLabel,
    // O nome do catálogo pode ser bem longo ("iPhone 17 Pro Max 256GB Preto") e
    // ainda assim é o que a pessoa reconhece — corta no fim, não some.
    productName?.trim()?.slice(0, 80),
    variations > 0 ? `${variations} ${variations === 1 ? "Peça" : "Peças"}` : null,
  ].filter(Boolean);

  return partes.join(" • ").slice(0, 180);
}

/**
 * O título já anuncia quantas peças há ali dentro?
 *
 * O quadro traz um selo com a contagem de variações, e repeti-la ao lado de um
 * título que termina em "12 Peças" é ruído em um card de 300px. Os cards criados
 * antes deste formato continuam precisando do selo — daí a checagem, em vez de
 * simplesmente remover um dos dois.
 */
export function titleShowsPieceCount(title: string, count: number): boolean {
  return new RegExp(`\\b${count}\\s+pe[çc]as?\\b`, "i").test(title);
}

/**
 * Quem escreve a copy.
 *
 * A IA não é o único caminho até o quadro. O copywriter que já sabe o que quer
 * dizer estava tendo de gerar algo para poder apagar e escrever por cima — ou,
 * mais provável, escrevia fora da ferramenta e a demanda nunca virava card.
 * A escolha é a primeira coisa da tela porque muda o que a tela pede: no modo
 * manual não há briefing a preencher para um modelo ler.
 */
export const COPY_MODES = [
  {
    id: "ai",
    label: "Gerar com IA",
    hint: "A IA escreve a partir do briefing e das peças que mais converteram.",
  },
  {
    id: "manual",
    label: "Escrever eu mesmo",
    hint: "Um card em branco por variação, para o copywriter preencher.",
  },
] as const;

export type CopyModeId = (typeof COPY_MODES)[number]["id"];

export function isCopyMode(value: unknown): value is CopyModeId {
  return typeof value === "string" && COPY_MODES.some((m) => m.id === value);
}

/**
 * "Outro / especifique" — o item que não está na lista.
 *
 * O campo livre ficava sempre visível embaixo da caixa suspensa, e isso fazia a
 * tela oferecer dois jeitos de responder à mesma pergunta ao mesmo tempo: quem
 * já tinha escolhido do catálogo continuava vendo um campo pedindo que
 * descrevesse a oferta. Agora é uma opção da própria lista, e o campo livre só
 * existe depois que alguém a escolhe.
 *
 * O id nunca chega ao servidor como id de verdade — a tela o converte em nulo, e
 * a rota o ignora de qualquer forma. Sem isso, "outro" seria procurado no
 * catálogo, não encontrado, e a pessoa receberia "este produto não está mais
 * disponível" por ter dito justamente que ele não está lá.
 */
export const OTHER_OPTION_ID = "__outro__";
export const OTHER_OPTION_LABEL = "Outro / especifique";

export function isOtherOption(id: string | null | undefined): boolean {
  return id === OTHER_OPTION_ID;
}

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
    id: "parcerias",
    label: "Parcerias",
    /** O que o leilão e a superfície impõem à escrita, dito ao modelo. */
    guidance:
      "Peça para ação com parceiro — marca, criador ou veículo. Quem lê encontra a allu pela voz de outra pessoa, então o texto não pode soar como anúncio nosso colado no conteúdo dela.",
  },
  {
    id: "meta",
    label: "Meta (Facebook, Instagram, WhatsApp)",
    guidance:
      "Meta Ads (Instagram, Facebook e WhatsApp). O texto principal fica acima do criativo e é cortado por \"ver mais\" perto dos 125 caracteres — a primeira linha precisa segurar sozinha.",
  },
  {
    id: "tiktok",
    label: "TikTok Ads",
    guidance:
      "TikTok Ads. A legenda é curta e aparece sobre o vídeo, disputando espaço com a interface. Linguagem de quem está na plataforma, não de quem está anunciando nela.",
  },
  {
    id: "google",
    label: "Google (PMax)",
    guidance:
      "Google Performance Max. O mesmo texto é remontado pela máquina em pesquisa, display, YouTube e Shopping — cada linha precisa se sustentar fora de ordem e sem as vizinhas.",
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
    id: "outros",
    label: "Outros",
    guidance:
      "Canal fora da lista, descrito por quem abriu a demanda. Sem superfície conhecida, escreva de forma neutra e evite referências a leilão, feed ou assunto de e-mail.",
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
  /*
   * Meta, TikTok, Google e Parcerias entram com UMA opção: "Todos os formatos e
   * tamanhos".
   *
   * É como a equipe pede hoje — a demanda cobre o pacote inteiro do canal, e não
   * uma peça de uma proporção. Detalhar story, feed e carrossel aqui obrigaria a
   * abrir uma demanda por proporção da mesma campanha, que é justamente o que se
   * quer evitar. Site e CRM continuam listados porque ali o formato MUDA o
   * trabalho: um ícone e um slide de home não são a mesma peça.
   */
  {
    id: "parcerias-todos",
    channelId: "parcerias",
    label: "Todos os formatos e tamanhos",
    /** Como o formato se anuncia no título do card do Kanban — ver `buildCopyCardTitle`. */
    cardLabel: "Peças de parceria",
    /** O que o formato impõe à escrita, dito ao modelo. */
    guidance:
      "O pacote inteiro da ação com o parceiro. Escreva um texto que sobreviva a qualquer proporção: headline curta e corpo que não dependa de espaço largo.",
  },
  {
    id: "meta-feed-1x1",
    channelId: "meta",
    label: "Feed 1:1 (1080x1080)",
    cardLabel: "Criativos Feed 1:1",
    guidance:
      "Estático quadrado de feed. O texto principal fica acima da peça e é cortado por \"ver mais\" perto dos 125 caracteres — a primeira linha precisa segurar sozinha.",
  },
  {
    id: "meta-feed-1x3",
    channelId: "meta",
    label: "Feed 1:3 (1080x1350)",
    cardLabel: "Criativos Feed 1:3",
    guidance:
      "Estático vertical de feed. Ocupa mais altura na rolagem que o quadrado, então comporta uma headline maior — mas o corte do \"ver mais\" continua valendo para o texto de cima.",
  },
  {
    id: "meta-stories",
    channelId: "meta",
    label: "Stories 9:16 (1920x1080)",
    cardLabel: "Criativos Stories",
    guidance:
      "Peça de tela cheia, vista com o polegar já a caminho do próximo story. Uma ideia só, legível em dois segundos, e a chamada para ação perto do dedo.",
  },
  {
    id: "meta-carrossel-1x1",
    channelId: "meta",
    label: "Carrossel 1:1 (1080x1080)",
    cardLabel: "Carrossel 1:1",
    guidance:
      "Carrossel quadrado. Cada cartão precisa dar vontade de arrastar para o seguinte, e o primeiro carrega sozinho quem não arrastar nenhum.",
  },
  {
    id: "meta-carrossel-1x3",
    channelId: "meta",
    label: "Carrossel 1:3 (1080x1350)",
    cardLabel: "Carrossel 1:3",
    guidance:
      "Carrossel vertical. Mesma lógica do quadrado, com mais altura por cartão: cabe uma linha de apoio abaixo da headline sem apertar.",
  },
  {
    id: "meta-feed-stories",
    channelId: "meta",
    label: "Feed e Stories",
    cardLabel: "Criativos Feed e Stories",
    guidance:
      "A mesma peça roda nas duas superfícies. O texto precisa funcionar nas duas proporções: headline curta o bastante para o vertical e corpo que ainda faça sentido no feed.",
  },
  {
    id: "meta-video",
    channelId: "meta",
    label: "Vídeo",
    cardLabel: "Vídeos Meta",
    guidance:
      "Peça em vídeo. O texto aqui é roteiro e legenda: os três primeiros segundos decidem se o resto é visto, e a legenda precisa funcionar com o som desligado.",
  },
  {
    id: "tiktok-video-9x16",
    channelId: "tiktok",
    label: "Vídeo 9:16 (1920x1080)",
    cardLabel: "Vídeos 9:16",
    guidance:
      "Vídeo de tela cheia no feed do TikTok. Linguagem de quem está na plataforma, não de quem anuncia nela — e a legenda divide a tela com a interface.",
  },
  {
    id: "tiktok-video-1x1",
    channelId: "tiktok",
    label: "Vídeo 1:1 (1080x1080)",
    cardLabel: "Vídeos 1:1",
    guidance:
      "Vídeo quadrado. Sobra tarja acima e abaixo, então nada essencial pode estar nas bordas do quadro.",
  },
  {
    id: "tiktok-estatico-9x16",
    channelId: "tiktok",
    label: "Estático 9:16 (1920x1080)",
    cardLabel: "Estáticos 9:16",
    guidance:
      "Peça parada em tela cheia, num feed de vídeo. Ela precisa justificar a parada logo: uma frase, grande, e nada de leitura demorada.",
  },
  {
    id: "tiktok-estatico-1x1",
    channelId: "tiktok",
    label: "Estático 1:1 (1080x1080)",
    cardLabel: "Estáticos 1:1",
    guidance:
      "Peça parada quadrada. Mesma pressa do 9:16, com menos área: uma ideia e a chamada, sem apoio.",
  },
  {
    id: "google-quadrado",
    channelId: "google",
    label: "Quadrado 1:1 (1200x1200)",
    cardLabel: "Quadrados PMax",
    guidance:
      "Peça quadrada do Performance Max. A máquina remonta títulos e descrições em ordens imprevisíveis: cada linha precisa fazer sentido sozinha.",
  },
  {
    id: "google-horizontal",
    channelId: "google",
    label: "Horizontal 21:9 (1200x628)",
    cardLabel: "Horizontais PMax",
    guidance:
      "Peça deitada, a que aparece em display e em parceiros de leitura. Largura sobrando e altura curta: headline de uma linha, sem corpo longo.",
  },
  {
    id: "google-vertical",
    channelId: "google",
    label: "Vertical 4:5 (1200x1500)",
    cardLabel: "Verticais PMax",
    guidance:
      "Peça vertical do Performance Max. Cabe mais altura de texto, mas a máquina pode cortar o rodapé — o essencial vai no alto.",
  },
  {
    id: "google-outros",
    channelId: "google",
    label: "Outros formatos e tamanhos que existirem",
    cardLabel: "Outras peças PMax",
    guidance:
      "Tamanho fora dos três acima. Sem proporção conhecida, escreva de forma que sirva tanto deitado quanto em pé: linhas curtas e independentes.",
  },
  {
    id: "site-slide",
    channelId: "site",
    label: "Slide",
    cardLabel: "Slides do site",
    guidance:
      "Slide da vitrine da home. É a primeira coisa que se vê na loja: headline grande, uma promessa só, e o clique já dentro da categoria certa.",
  },
  {
    id: "site-mini-banner",
    channelId: "site",
    label: "Mini Banners",
    cardLabel: "Mini banners",
    guidance:
      "Mini banner de apoio, pequeno e ao lado do conteúdo. Cabe uma frase e um verbo — qualquer coisa além disso não é lida.",
  },
  {
    id: "site-banner-categoria",
    channelId: "site",
    label: "Banners de Categorias",
    cardLabel: "Banners de categoria",
    guidance:
      "Banner do topo de uma categoria. Quem chega já escolheu o assunto: o texto qualifica a seleção, não apresenta a marca.",
  },
  {
    id: "site-foto-produto",
    channelId: "site",
    label: "Fotos de Produtos",
    cardLabel: "Fotos de produto",
    guidance:
      "Foto de produto para a vitrine. O texto aqui é legenda e apoio de ficha: objetivo, sem adjetivo de campanha.",
  },
  {
    id: "site-icone",
    channelId: "site",
    label: "Ícones",
    cardLabel: "Ícones",
    guidance:
      "Ícone de navegação ou de selo. O texto é um rótulo de uma ou duas palavras — não há espaço para frase.",
  },
  {
    id: "crm-email",
    channelId: "crm",
    label: "Disparo Email",
    cardLabel: "E-mails",
    guidance:
      "E-mail para a base. O assunto decide se o resto existe: ele não pode prometer o que o corpo não cumpre, e o corpo fala com quem já conhece a allu.",
  },
  {
    id: "crm-push",
    channelId: "crm",
    label: "Pushs",
    cardLabel: "Pushs",
    guidance:
      "Notificação push. Duas linhas, lidas fora de contexto e na tela de bloqueio: diga o que é e por que agora, sem rodeio.",
  },
  {
    id: "crm-whatsapp",
    channelId: "crm",
    label: "WhatsApp",
    cardLabel: "Mensagens de WhatsApp",
    guidance:
      "Mensagem de WhatsApp para a base. É conversa, não peça: primeira pessoa, frases curtas e nenhuma formatação de anúncio.",
  },
  {
    id: "outros-todos",
    channelId: "outros",
    label: "Todos os formatos e tamanhos",
    cardLabel: "Peças",
    guidance:
      "Canal fora da lista: não há superfície conhecida a respeitar. Escreva de forma neutra, que sirva tanto impressa quanto em tela.",
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

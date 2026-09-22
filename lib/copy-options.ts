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

/**
 * O rótulo reduzido ao que ele identifica, para casar duas listas escritas por
 * pessoas diferentes.
 *
 * O quadro chama o canal de "Meta"; esta lista o chama de "Meta (Facebook,
 * Instagram, WhatsApp)". São o mesmo canal, e a orientação curada que existe
 * aqui — o que o leilão impõe à escrita — não pode se perder porque um rótulo
 * traz o parêntese e o outro não. Corta o parêntese, o sufixo "Ads", os acentos
 * e a caixa; o que sobra é o nome.
 */
function labelKey(label: string | null | undefined): string {
  return (label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bads\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

/**
 * A orientação curada de um canal, procurada pelo RÓTULO.
 *
 * O gerador passou a oferecer os canais e formatos DO QUADRO — é lá que a
 * equipe os define, e manter uma segunda lista aqui fazia a tela oferecer
 * "Todos os formatos e tamanhos" para Parcerias enquanto o quadro tinha nove
 * formatos configurados. O que continua morando aqui é a orientação de escrita,
 * que não cabe num formulário: ela é reencontrada pelo nome.
 *
 * Nulo quando não há orientação para aquele rótulo — e aí o prompt leva só o
 * nome, que já diz bastante ("Reels (9:16)").
 */
export function channelGuidanceFor(label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  const alvo = labelKey(label);
  return COPY_CHANNELS.find((c) => labelKey(c.label) === alvo)?.guidance ?? null;
}

/** A orientação curada de um formato, procurada pelo rótulo. Ver `channelGuidanceFor`. */
export function formatGuidanceFor(label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  const alvo = labelKey(label);
  return COPY_FORMATS.find((f) => labelKey(f.label) === alvo)?.guidance ?? null;
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
 * O que a peça É — e é isso que decide o que o "corpo" significa.
 *
 * Um estático, um vídeo e uma landing page pedem três textos diferentes do
 * mesmo briefing: no estático o corpo é o argumento que cabe numa olhada; no
 * vídeo o corpo é o ROTEIRO que alguém vai gravar, com as falas na ordem em que
 * são ditas; na página é o texto que a pessoa lê rolando, com fôlego para
 * seções. Pedir "um corpo" para os três, com o mesmo teto, era o que fazia o
 * roteiro sair do tamanho de uma legenda de feed.
 */
export type CopyPieceKindId = "estatico" | "video" | "lp";

export interface CopyPieceKind {
  id: CopyPieceKindId;
  label: string;
  /** Como o campo "Corpo" se chama nesta peça, na tela e no prompt. */
  bodyLabel: string;
  /** Teto de palavras que a tela sugere — e que quem pede pode mudar. */
  defaultBodyMaxWords: number;
  /** O que o modelo precisa entender sobre o tipo de peça. */
  guidance: string;
  /** Como o corpo deve ser escrito, dito no formato da resposta. */
  bodyInstruction: string;
  /** O que se pede N vezes: "variações de copy", "versões completas da página". */
  unitLabel: string;
  /** O mesmo no singular — "Escreva 1 versões completas" é o tipo de descuido
   *  que faz o texto parecer gerado por máquina logo na primeira linha. */
  unitLabelOne: string;
  /**
   * Para que servem as peças vencedoras nesta peça.
   *
   * O prompt dizia, para todos, que as referências eram "o padrão a seguir em
   * ESTRUTURA e registro". Num anúncio isso está certo; numa landing page é a
   * instrução que estraga o resultado — mandar a página copiar a estrutura de um
   * criativo de feed devolve um criativo com mais palavras, que foi exatamente o
   * defeito relatado. O registro e os argumentos continuam valendo; a forma, não.
   */
  referenceUse: string;
  /**
   * O que fazer com as peças vencedoras, em regras — o bloco "SIGA ESTES
   * MODELOS", que fica logo antes do formato da resposta.
   *
   * Era uma lista única, escrita para anúncio, e a primeira regra dela mandava
   * REPRODUZIR A ESTRUTURA das referências. Como ela aparece perto do fim do
   * prompt e é a mais concreta de todas, era ela que o modelo seguia: pedir uma
   * landing page devolvia um criativo, e a justificativa da própria resposta
   * dizia "reproduz a estrutura da referência". Mudar a frase de abertura do
   * prompt não bastava — as duas precisavam dizer a mesma coisa.
   */
  referenceBullets: string[];
  /**
   * As seções que a peça tem, quando ela é feita de seções.
   *
   * Só a landing page tem. É o esqueleto que sai pronto para montar a página, em
   * vez de um texto corrido que alguém teria de repartir depois.
   */
  sections?: string[];
}

export const COPY_PIECE_KINDS: CopyPieceKind[] = [
  {
    id: "estatico",
    label: "Peça estática",
    bodyLabel: "Corpo",
    defaultBodyMaxWords: 40,
    guidance:
      "A peça é um anúncio estático: imagem parada, lida de passagem. O texto disputa a atenção com o resto do feed e precisa entregar o argumento antes de a pessoa rolar.",
    bodyInstruction:
      "o argumento, em frases curtas e diretas. Nada de introdução: a primeira frase já é o argumento.",
    unitLabel: "variações de copy",
    unitLabelOne: "variação de copy",
    referenceUse:
      "a sua copy deve sair parecida com elas em estrutura e registro, não com um anúncio genérico de tecnologia",
    referenceBullets: [
      "Reproduza a ESTRUTURA: a ordem em que o argumento é construído, o tipo de gancho de abertura, onde a oferta entra, como o CTA é formulado.",
      "Reproduza o REGISTRO: comprimento de frase, nível de formalidade, uso de pergunta, de número, de primeira ou segunda pessoa.",
      "Prefira ângulos vizinhos aos que já funcionaram a ângulos novos e não testados.",
      "O corpo pode ser tão longo quanto o das referências. Não corte o argumento pela metade para ficar curto: uma peça que converteu com cinco linhas converteu COM as cinco linhas.",
    ],
  },
  {
    id: "video",
    label: "Vídeo (roteiro)",
    bodyLabel: "Roteiro",
    defaultBodyMaxWords: 150,
    guidance:
      "A peça é um VÍDEO, e o que você escreve é o ROTEIRO que alguém vai gravar e editar. Escreva as FALAS, na ordem em que são ditas, do jeito que se fala — não descreva a cena, não narre o que aparece na tela e não escreva em terceira pessoa sobre o vídeo. Indicação de imagem entra só quando a fala depende dela, entre parênteses e curta. O roteiro tem fôlego maior que uma legenda: ele precisa segurar a pessoa por alguns segundos, não caber numa olhada.",
    bodyInstruction:
      "o roteiro em falas, UMA POR LINHA, cada linha começando pela marcação de tempo aproximada — `(0-3s) fala`, `(3-8s) fala`. O primeiro trecho é o gancho e decide se o resto é visto.",
    unitLabel: "roteiros",
    unitLabelOne: "roteiro",
    referenceUse:
      "use o registro e os ganchos delas como referência — o que prende a atenção nelas é o que precisa prender no primeiro trecho do roteiro. A estrutura, essa é a do roteiro, não a do anúncio",
    referenceBullets: [
      "Reproduza o GANCHO: o que prende a atenção nas referências é o que precisa prender nos três primeiros segundos do roteiro.",
      "Reproduza o REGISTRO: comprimento de frase, nível de formalidade, uso de pergunta, de número, de primeira ou segunda pessoa.",
      "NÃO reproduza a estrutura delas. Elas são peças de leitura; o seu roteiro é FALADO, e a estrutura dele é a ordem em que as frases são ditas na câmera.",
      "Prefira ângulos vizinhos aos que já funcionaram a ângulos novos e não testados.",
    ],
  },
  {
    id: "lp",
    label: "Landing page",
    bodyLabel: "Texto da página",
    /*
     * Uma página inteira, com cinco seções de texto pronto, não cabe no
     * orçamento de um anúncio. Com 300 o modelo entregava um parágrafo por
     * seção — ou, mais provável, desistia das seções e escrevia um criativo
     * comprido, que foi o defeito relatado.
     */
    defaultBodyMaxWords: 500,
    guidance:
      "A peça é uma LANDING PAGE INTEIRA: a página que recebe quem clicou no anúncio. Você não está escrevendo um anúncio sobre a página — você está escrevendo o TEXTO DELA, seção por seção, pronto para ser montado. Cada seção tem de sair completa e utilizável como está: nada de descrever o que a seção deveria dizer, nada de instrução para o time, nada de espaço reservado, a não ser onde falte um dado que só a empresa tem (um depoimento real, um número de clientes) — e aí diga exatamente o que falta, entre colchetes.",
    bodyInstruction:
      "o texto de cada seção, pronto. Uma linha `**Nome da seção:**` e, abaixo dela, o texto daquela seção",
    unitLabel: "versões completas da página",
    unitLabelOne: "versão completa da página",
    referenceUse:
      "elas são ANÚNCIOS, e a sua peça é uma página: aproveite delas o registro, os argumentos que converteram e as objeções que elas atacam. NÃO copie a estrutura delas — a estrutura da sua peça é a da página, seção por seção",
    referenceBullets: [
      "Aproveite os ARGUMENTOS e as OBJEÇÕES que aparecem nelas: é o que já provou converter com este público, e é isso que alimenta as seções de benefícios, comparativo e prova social.",
      "Reproduza o REGISTRO: comprimento de frase, nível de formalidade, uso de pergunta, de número, de primeira ou segunda pessoa.",
      "NÃO reproduza a estrutura delas. Elas são anúncios de uma tela só; a sua peça é uma PÁGINA INTEIRA, lida rolando, e a estrutura dela são as seções pedidas no formato da resposta — todas, na ordem pedida.",
      "Uma única seção da sua página pode ser mais longa que um anúncio inteiro. Não encolha a página para o tamanho de um criativo.",
    ],
    sections: [
      "Home",
      "Benefícios",
      "Comparativo",
      "Prova Social",
      "Formulário",
    ],
  },
];

export function findPieceKind(id: string | null | undefined): CopyPieceKind {
  return COPY_PIECE_KINDS.find((k) => k.id === id) ?? COPY_PIECE_KINDS[0];
}

/**
 * O tipo de peça deduzido do nome do formato.
 *
 * O quadro nomeia os formatos livremente, então não há campo dizendo "isto é
 * vídeo": o que existe é "Reels (9:16)" e "Criação de LP". As palavras são o
 * único sinal, e elas erram — "Stories (9:16)" pode ser as duas coisas. Por isso
 * a tela MOSTRA o que foi deduzido, num campo que se troca em um clique: o
 * palpite acerta o caso comum e nunca fica no caminho do outro.
 */
export function guessPieceKind(formatLabel: string | null | undefined): CopyPieceKindId {
  const nome = (formatLabel ?? "").toLowerCase();
  if (!nome.trim()) return "estatico";
  if (/\blps?\b|landing|\bpágina\b|\bpagina\b/.test(nome)) return "lp";
  if (/v[ií]deo|reels?|roteiro|shorts?|\btvc\b/.test(nome)) return "video";
  return "estatico";
}

export const MIN_BODY_WORDS = 10;

/**
 * O teto do teto.
 *
 * Eram 800, número que eu escolhi por cima e que não tem nada a ver com o
 * trabalho: uma landing page longa passa fácil disso. Cinco mil palavras é o
 * tamanho de uma página de vendas inteira, e é o limite que faz sentido pedir.
 *
 * Quem de fato limita, mais abaixo, é o teto de SAÍDA do provedor que atender —
 * ver `estimateOutputTokens` e `maxOutputTokens` em `lib/ai-providers.ts`. Por
 * isso a tela avisa quando o pedido não cabe numa resposta só, em vez de deixar
 * a página chegar cortada no meio de uma frase.
 */
export const MAX_BODY_WORDS = 5000;

/**
 * Quantos tokens de saída um pedido precisa reservar.
 *
 * Português rende cerca de 1,7 token por palavra — mais que o inglês, por causa
 * dos acentos e das palavras longas. A folga cobre os campos que acompanham cada
 * variação (headline, CTA, justificativa) e a marcação do formato.
 */
export function estimateOutputTokens(totalWords: number): number {
  return Math.ceil(totalWords * 1.7) + 400;
}

export function clampBodyMaxWords(value: unknown, kind: CopyPieceKindId): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return findPieceKind(kind).defaultBodyMaxWords;
  return Math.min(Math.max(n, MIN_BODY_WORDS), MAX_BODY_WORDS);
}

/** Quantas palavras há num texto — a mesma conta na tela e no prompt. */
export function countWords(text: string | null | undefined): number {
  const limpo = (text ?? "").trim();
  return limpo ? limpo.split(/\s+/).length : 0;
}

/**
 * A "geração" que o nome de um produto anuncia — 17 em "iPhone 17 Pro", 2 em
 * "Nintendo Switch 2".
 *
 * Números que vêm colados a uma unidade não contam: o catálogo tem "Switch 2
 * 256GB", "Monitor Acer 31.5\"" e "Kindle Paperwhite 12ª Geração 2024", e lê-los
 * como geração faria um monitor de 31,5 polegadas parecer trinta vezes mais novo
 * que um iPhone 17.
 *
 * Nulo quando não há número nenhum — e aí não há o que comparar.
 */
function generationOf(name: string): number | null {
  const limpo = name
    .toLowerCase()
    // Capacidade, tamanho, taxa e afins: o número e a unidade saem juntos.
    /* A unidade escrita em letras exige fronteira de palavra; a escrita em
       símbolo NÃO pode exigir — `\b` depois de aspas nunca casa no fim do texto,
       e era por isso que `Monitor Acer Nitro 27"` chegava aqui como geração 27,
       ficando "mais novo" que um iPhone 17. */
    .replace(
      /\d+(?:[.,]\d+)?\s*(?:(?:gb|tb|mb|kb|mm|cm|kg|g|hz|w|k|fps|p|pol|polegadas|mah|v)\b|["”'’ª])/g,
      " "
    )
    // Ano de lançamento escrito por extenso não é geração.
    .replace(/\b(?:19|20)\d{2}\b/g, " ");

  const achado = limpo.match(/\b\d+(?:[.,]\d+)?\b/);
  if (!achado) return null;

  const n = Number(achado[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** O nome até o primeiro número — "iPhone" em "iPhone 17 Pro". É a família. */
function familyOf(name: string): string {
  return name.toLowerCase().split(/\s*\b\d/)[0].trim();
}

export interface CopyProductPick {
  id: string;
  name: string;
}

export interface VariationShare extends CopyProductPick {
  /** Quantas variações este produto recebe nesta geração. */
  variations: number;
}

/**
 * Como as variações se repartem entre os produtos escolhidos.
 *
 * O número pedido é o TOTAL — doze variações com dois produtos são seis e seis,
 * e não doze de cada. Quando não divide certo, a sobra vai para o aparelho mais
 * novo: três variações entre iPhone 16 e iPhone 17 são duas do 17 e uma do 16.
 *
 * "Mais novo" é decidido pela geração no nome, e SÓ entre produtos da mesma
 * família: 17 é maior que 16 dentro de "iPhone", mas comparar o 17 de um iPhone
 * com o 25 de um Galaxy não significaria nada. Famílias diferentes mantêm a
 * ordem em que foram escolhidas — e a tela mostra a divisão antes de gerar,
 * para que um palpite errado seja visto, e não descoberto na entrega.
 */
export function splitVariations(total: number, produtos: CopyProductPick[]): VariationShare[] {
  if (produtos.length === 0) return [];

  const n = clampVariations(total);

  /*
   * A ordem de prioridade da sobra. `sort` no JavaScript é estável, então
   * produtos sem geração comparável — ou de famílias diferentes — ficam
   * exatamente como foram escolhidos.
   */
  const prioridade = [...produtos].sort((a, b) => {
    if (familyOf(a.name) !== familyOf(b.name)) return 0;
    const ga = generationOf(a.name);
    const gb = generationOf(b.name);
    if (ga === null || gb === null) return 0;
    return gb - ga;
  });

  const base = Math.floor(n / produtos.length);
  let sobra = n % produtos.length;

  const porProduto = new Map<string, number>();
  for (const produto of prioridade) {
    porProduto.set(produto.id, base + (sobra > 0 ? 1 : 0));
    if (sobra > 0) sobra -= 1;
  }

  // Devolvida na ordem em que foram ESCOLHIDOS: é assim que a pessoa os vê na
  // caixa, e uma lista que se reordena sozinha na tela parece defeito.
  return produtos.map((produto) => ({
    ...produto,
    variations: porProduto.get(produto.id) ?? 0,
  }));
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
  formatLabel,
  productName,
  variations,
}: {
  formatId?: string | null;
  /**
   * O rótulo do formato como o QUADRO o chama — é daí que ele vem agora.
   *
   * `cardLabel` é o apelido curto de um formato desta lista ("Criativos Feed
   * 1:1"); um formato configurado no quadro não tem apelido, e o próprio rótulo
   * serve. Sem isto, todo card gerado com um formato do quadro nascia com o
   * título começando no nome do produto, sem dizer o que era para fazer.
   */
  formatLabel?: string | null;
  productName?: string | null;
  variations: number;
}): string {
  const partes = [
    findFormat(formatId)?.cardLabel ?? formatLabel?.trim() ?? null,
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

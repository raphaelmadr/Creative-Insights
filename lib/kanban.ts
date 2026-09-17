/**
 * As regras do Kanban — tipos de campo, prioridades e o quadro inicial.
 *
 * Moram aqui, e não dentro das rotas nem da tela, porque três lugares precisam
 * concordar sobre a mesma coisa: o formulário que desenha o campo, a rota que
 * valida a resposta e o card que a exibe de volta. Com a lista de tipos escrita
 * em cada um deles, basta alguém acrescentar um tipo em um para os outros dois
 * passarem a recusá-lo — ou, pior, aceitarem sem validar.
 */

import { COPY_CHANNELS, MAX_VARIATIONS, formatsForChannel } from "./copy-options";

export const FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "SELECT",
  "MULTISELECT",
  "NUMBER",
  "RANGE",
  "DATE",
  "URL",
  "CHECKBOX",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: "Texto curto",
  TEXTAREA: "Texto longo",
  SELECT: "Escolha única",
  MULTISELECT: "Escolha múltipla",
  NUMBER: "Número",
  RANGE: "Quantidade (deslizante)",
  DATE: "Data",
  URL: "Link",
  CHECKBOX: "Sim / Não",
};

/**
 * Os limites do campo deslizante.
 *
 * O teto é o mesmo do gerador de copy (`MAX_VARIATIONS`), e de propósito: uma
 * demanda nascida do gerador chega ao quadro com o número de variações que foi
 * pedido lá, e um teto menor aqui recusaria um card que o próprio sistema criou.
 */
export const RANGE_MIN = 1;
export const RANGE_MAX = MAX_VARIATIONS;

/**
 * A unidade de um campo de quantidade, tirada do próprio rótulo.
 *
 * Um número sozinho no card não diz nada: "12" pode ser peças, dias ou reais.
 * Prefixar com o rótulo inteiro resolveria — "Número de peças: 12" —, mas gasta
 * metade da largura do card repetindo a palavra "número", que é justamente a
 * parte que o algarismo já diz.
 *
 * Então o rótulo perde o prefixo de contagem e vira unidade: "Número de peças"
 * → "12 peças". Um rótulo que já seja a unidade ("Peças", "Slides") passa
 * inteiro, o que dá o mesmo resultado.
 */
export function unidadeDoCampo(label: string, quantidade?: number): string {
  const plural = label
    .replace(/^\s*(n[úu]mero|quantidade|qtde?\.?|qtd\.?)\s*(de\s+)?/i, "")
    .trim()
    .toLowerCase();

  if (quantidade !== 1) return plural;

  /*
   * Uma peça é "1 peça", não "1 peças".
   *
   * Heurística, e assumidamente parcial: cobre as terminações que aparecem em
   * rótulo de campo — que é sempre um substantivo curto e concreto. Não é um
   * flexionador de português, e não precisa ser; se um rótulo novo cair fora
   * das regras, o pior resultado é a concordância errada em UM caso, não um
   * texto quebrado.
   */
  if (/(õ|ã)es$/.test(plural)) return plural.replace(/(õ|ã)es$/, "ão"); // variações → variação
  if (/ns$/.test(plural)) return plural.replace(/ns$/, "m"); // imagens → imagem
  if (/ais$/.test(plural)) return plural.replace(/ais$/, "al"); // materiais → material
  if (/[eé]is$/.test(plural)) return plural.replace(/[eé]is$/, "el"); // papéis → papel
  if (/[oó]is$/.test(plural)) return plural.replace(/[oó]is$/, "ol"); // faróis → farol
  if (/is$/.test(plural)) return plural.replace(/is$/, "il"); // perfis → perfil
  if (/s$/.test(plural)) return plural.slice(0, -1); // peças → peça
  return plural;
}

/**
 * A opção que libera digitar uma resposta fora da lista.
 *
 * Uma escolha única com "Outros" entre as opções passa a aceitar texto livre: a
 * pessoa escolhe "Outros", digita, e o que fica gravado é o TEXTO — não a
 * palavra "Outros". Assim o card mostra "Evento presencial" em vez de "Outros",
 * e quem lê não precisa abrir a demanda para descobrir qual era o outro.
 *
 * É por isso que gravar a palavra sozinha é recusado: escolher "Outros" sem
 * especificar não responde a pergunta.
 */
export const OPCAO_OUTROS = "Outros";

/** Os tipos em que a lista de opções é obrigatória — e nos outros, proibida. */
export const FIELD_TYPES_WITH_OPTIONS: FieldType[] = ["SELECT", "MULTISELECT"];

export function isFieldType(value: unknown): value is FieldType {
  return typeof value === "string" && (FIELD_TYPES as readonly string[]).includes(value);
}

export const PRIORITIES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

/**
 * A cor de cada prioridade, em token semântico.
 *
 * `--muted` e não um cinza literal: um cinza escolhido no claro desaparece no
 * escuro, e a prioridade baixa é justamente a que já tem pouco contraste.
 */
export const PRIORITY_COLOR: Record<Priority, string> = {
  BAIXA: "var(--muted)",
  MEDIA: "var(--info)",
  ALTA: "var(--warning)",
  URGENTE: "var(--danger)",
};

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * De onde a demanda veio.
 *
 * "PUBLIC" é o link aberto: o solicitante digitou o próprio e-mail e ninguém
 * provou que é dele. A origem existe para que essa diferença fique à vista —
 * um card de fora não deve ser lido com a mesma confiança de um aberto por
 * quem estava logado.
 */
export const CARD_ORIGINS = ["FORM", "COPY", "PUBLIC"] as const;
export type CardOrigin = (typeof CARD_ORIGINS)[number];

/**
 * A chave estável de um campo, derivada do rótulo.
 *
 * O rótulo é o que a pessoa escreve e pode reescrever; a chave é o que fica
 * gravado nas respostas dos cards. Acentos e espaços saem porque a chave também
 * viaja em JSON e em nomes de campo de formulário.
 */
export function slugifyFieldKey(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  // Um rótulo só de emoji ou de pontuação não sobra nada: a chave precisa
  // existir de qualquer jeito, senão o campo grava por cima do vizinho vazio.
  return base || `campo_${Math.random().toString(36).slice(2, 8)}`;
}

/** Garante que a chave não colida com outra já usada no mesmo quadro. */
export function uniqueFieldKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugifyFieldKey(label);
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export interface FieldShape {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string | null;
  /** A chave do campo de que este depende. Ver `optionsFor`. */
  dependsOn?: string | null;
}

/** As opções de um SELECT, já como lista — no banco elas são uma linha JSON. */
export function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

/**
 * As opções de um campo DEPENDENTE: um mapa do valor do pai para as escolhas.
 *
 * `{"Meta Ads": ["Estático", "Carrossel"], "TikTok Ads": ["Vídeo 9:16"]}`.
 *
 * Existe separada de `parseOptions` porque o mesmo campo `options` guarda duas
 * formas diferentes, e confundi-las é exatamente o defeito que este módulo
 * passou meses tendo: um campo marcado como dependente com uma LISTA gravada
 * dentro devolvia zero opções para sempre, sem erro nenhum — o seletor
 * simplesmente nunca abria.
 */
export function parseOptionsMap(raw: string | null | undefined): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const mapa: Record<string, string[]> = {};
    for (const [chave, valor] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(valor)) {
        mapa[chave] = valor.filter((o): o is string => typeof o === "string");
      }
    }
    return mapa;
  } catch {
    return {};
  }
}

/**
 * As escolhas de um campo, considerando o campo de que ele depende.
 *
 * Campo independente devolve a lista de sempre. Campo dependente lê o valor do
 * pai e devolve só as escolhas daquele valor — "formato" mostra 9:16 quando o
 * canal é TikTok, e as medidas de banner quando é o site.
 *
 * Pai ainda em branco devolve lista vazia, de propósito: oferecer todos os
 * formatos de todos os canais é exatamente o que esta função existe para
 * evitar, e um seletor vazio com a dica certa diz "escolha o canal primeiro"
 * melhor do que uma lista que aceita a combinação errada.
 */
export function optionsFor(
  field: FieldShape,
  values: Record<string, unknown>
): string[] {
  if (!field.dependsOn) return parseOptions(field.options);

  const pai = values[field.dependsOn];
  if (typeof pai !== "string" || !pai) return [];

  return parseOptionsMap(field.options)[pai] ?? [];
}

export function parseValues(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export interface ValueValidation {
  ok: boolean;
  /** Mensagem pronta para a interface, nomeando o campo que falhou. */
  error?: string;
  /** As respostas já limpas: só campos que existem, no tipo certo. */
  values: Record<string, unknown>;
}

/**
 * Confere as respostas contra os campos daquele quadro.
 *
 * Descarta chave que não corresponde a campo nenhum em vez de gravá-la: o JSON
 * é aberto por natureza, e sem esse corte qualquer cliente poderia inflar o
 * card com conteúdo que a tela nunca mostra e ninguém nunca revisa.
 */
export function validateValues(
  fields: FieldShape[],
  incoming: Record<string, unknown>
): ValueValidation {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = incoming[field.key];
    const empty =
      raw === undefined ||
      raw === null ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (field.required) {
        return { ok: false, error: `O campo "${field.label}" é obrigatório.`, values: {} };
      }
      continue;
    }

    switch (field.type as FieldType) {
      case "NUMBER": {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
        if (Number.isNaN(n)) {
          return { ok: false, error: `"${field.label}" precisa ser um número.`, values: {} };
        }
        values[field.key] = n;
        break;
      }

      case "CHECKBOX":
        values[field.key] = raw === true || raw === "true";
        break;

      case "MULTISELECT": {
        /*
         * `incoming`, e não `values`: a lista do pai precisa ser resolvida
         * independentemente da ORDEM dos campos.
         *
         * `values` só tem o que já foi validado, então um campo dependente que
         * apareça antes do pai no formulário veria o pai em branco e recusaria
         * toda escolha — com a mensagem "não é uma opção", que manda procurar o
         * erro no valor quando ele está na ordem.
         */
        const options = optionsFor(field, incoming);
        const chosen = (Array.isArray(raw) ? raw : [raw]).map(String);
        const invalid = chosen.find((c) => !options.includes(c));
        if (invalid) {
          return { ok: false, error: `"${invalid}" não é uma opção de "${field.label}".`, values: {} };
        }
        values[field.key] = chosen;
        break;
      }

      case "SELECT": {
        const options = optionsFor(field, incoming);
        const chosen = String(raw).trim();
        const aceitaTexto = options.includes(OPCAO_OUTROS);

        if (aceitaTexto && chosen === OPCAO_OUTROS) {
          return {
            ok: false,
            error: `Diga qual é o outro em "${field.label}".`,
            values: {},
          };
        }

        if (!options.includes(chosen) && !aceitaTexto) {
          return { ok: false, error: `"${chosen}" não é uma opção de "${field.label}".`, values: {} };
        }

        values[field.key] = chosen;
        break;
      }

      case "RANGE": {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n)) {
          return { ok: false, error: `"${field.label}" precisa ser um número.`, values: {} };
        }
        // Preso à faixa em vez de recusado: o deslizante não produz valor fora
        // dela, então um número fora veio de requisição adulterada ou de um card
        // antigo — e nenhum dos dois merece derrubar a abertura da demanda.
        values[field.key] = Math.min(RANGE_MAX, Math.max(RANGE_MIN, n));
        break;
      }

      case "DATE": {
        const d = new Date(String(raw));
        if (Number.isNaN(d.getTime())) {
          return { ok: false, error: `"${field.label}" precisa ser uma data válida.`, values: {} };
        }
        // Guardado como texto ISO curto: o card mostra o dia, não o instante,
        // e um `Date` dentro do JSON voltaria como string de qualquer forma.
        values[field.key] = d.toISOString().slice(0, 10);
        break;
      }

      default:
        values[field.key] = String(raw).slice(0, 5000);
    }
  }

  return { ok: true, values };
}

/**
 * O quadro que o módulo cria sozinho na primeira visita.
 *
 * Um Kanban vazio não se explica: quem abre pela primeira vez vê três botões de
 * configuração e nenhuma pista de para que serve. Com um fluxo plausível já
 * montado, a primeira ação possível é abrir uma demanda — e as colunas e campos
 * são todos editáveis dali mesmo.
 */
/*
 * Os canais do formulário de demanda são OS MESMOS do gerador de copy.
 *
 * Derivados de `COPY_CHANNELS`, e não digitados de novo aqui: eram duas listas
 * — uma no vocabulário do gerador, outra no molde do quadro — e elas já tinham
 * divergido ("Google Ads" de um lado, "Google" do outro; "Banner Site" que não
 * existia no outro). Quem preenchia via a lista do quadro; quem gerava copy via
 * a outra; e o formato que uma oferecia a outra recusava.
 *
 * O formulário guarda o RÓTULO, não o id, porque é o rótulo que a pessoa leu ao
 * responder e é ele que o card exibe depois.
 */
const CANAIS = COPY_CHANNELS.map((c) => c.label);

const FORMATOS_POR_CANAL = Object.fromEntries(
  COPY_CHANNELS.map((c) => [c.label, formatsForChannel(c.id).map((f) => f.label)])
);

export const DEFAULT_BOARD = {
  name: "Demandas Criativas",
  description: "Pedidos de peça para a equipe criativa — do briefing à entrega.",
  receivesCopy: true,
  columns: [
    { name: "Backlog", color: "var(--muted)", isIntake: true, isDone: false },
    { name: "Em produção", color: "var(--info)", isIntake: false, isDone: false },
    { name: "Em revisão", color: "var(--warning)", isIntake: false, isDone: false },
    { name: "Entregue", color: "var(--success)", isIntake: false, isDone: true },
  ],
  fields: [
    {
      label: "Objetivo da peça",
      type: "TEXTAREA" as FieldType,
      required: true,
      placeholder: "O que esta peça precisa fazer? Para quem?",
      showOnCard: false,
    },
    /*
     * O canal vem ANTES do formato, e o formato depende dele.
     *
     * A ordem não é estética: "Carrossel" quer dizer coisas diferentes no Meta e
     * no TikTok, e perguntar o formato antes do canal obriga quem preenche a
     * escolher dentro de uma lista que ainda não sabe a qual lugar se aplica.
     *
     * Um campo dependente guarda um MAPA do valor do pai para as escolhas
     * daquele valor, e não uma lista — ver `optionsFor`. Um quadro nascido com
     * `dependsOn` e uma lista solta produz um seletor permanentemente vazio,
     * que foi exatamente o defeito que o quadro em produção teve.
     *
     * O pai é apontado pelo RÓTULO, e não pela chave: a chave é gerada a partir
     * do rótulo na hora de criar o quadro, e escrevê-la aqui seria repetir uma
     * conta que outro módulo faz.
     */
    {
      label: "Canal",
      type: "SELECT" as FieldType,
      required: true,
      options: CANAIS,
      showOnCard: true,
    },
    {
      label: "Formato",
      type: "SELECT" as FieldType,
      required: true,
      dependsOnLabel: "Canal",
      options: FORMATOS_POR_CANAL,
      showOnCard: true,
    },
    /*
     * A volumetria: é este número que vira "peças entregues" quando o card
     * chega à coluna de conclusão. Ver `lib/kanban-deliveries.ts`.
     */
    {
      label: "Número de peças",
      type: "RANGE" as FieldType,
      required: false,
      showOnCard: true,
    },
    {
      label: "Referências",
      type: "URL" as FieldType,
      required: false,
      placeholder: "Link do Drive, Figma ou referência externa",
      showOnCard: false,
    },
  ],
};

/**
 * A data de um prazo, ancorada ao meio-dia local.
 *
 * O campo de data do navegador manda "2026-09-30", e `new Date()` sobre isso
 * devolve **meia-noite UTC**. No fuso do negócio (UTC-3) essa instância é
 * 21:00 do dia 29 — e o quadro exibia "29/09" para um prazo marcado em 30/09.
 * Ao meio-dia a data sobrevive a qualquer fuso entre UTC-11 e UTC+11.
 *
 * É a mesma convenção que `formatFieldValue` já usa para os campos de data do
 * formulário; aqui ela vale para a gravação, que é onde faltava.
 */
export function parseDueDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;

  const ymd = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    // Não é uma data civil — pode ser um ISO completo vindo de outro caminho.
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** O prazo já vencido — comparado por dia civil, não por instante. */
export function isOverdue(dueDate: Date | string | null | undefined): boolean {
  if (!dueDate) return false;

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (Number.isNaN(due.getTime())) return false;

  /*
   * Por instante, um card com prazo "hoje" viraria atrasado ao meio-dia e um
   * minuto — a âncora do meio-dia é detalhe de armazenamento e não devia
   * aparecer como regra de negócio. Atrasado é "o dia passou".
   */
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diaDoPrazo = new Date(due);
  diaDoPrazo.setHours(0, 0, 0, 0);

  return diaDoPrazo.getTime() < hoje.getTime();
}

/**
 * O que o card mostra na frente, sem precisar ser aberto.
 *
 * Um lugar só, e não três. Até aqui a resposta a "o que aparece no card?"
 * estava espalhada: quatro atributos aqui, o `showOnCard` de cada campo na tela
 * de campos, e o resto — briefing, peças de copy, link, anexos — cravado dentro
 * do componente do quadro, sem opção nenhuma. Quem queria enxugar o card tinha
 * de descobrir sozinho qual das três decidia o quê, e a terceira não decidia:
 * era código.
 *
 * `default` é o que vale antes de alguém escolher, e foi escolhido para não
 * mudar nada em quadro nenhum: o que o card já mostrava continua mostrando.
 *
 * `legacy` marca os quatro que existiam quando a configuração era uma lista de
 * chaves ligadas. Ver `parseCardBadges` — é essa marca que permite ler as
 * configurações antigas sem ressuscitar o que alguém desligou de propósito.
 */
export const CARD_BADGES = [
  {
    key: "code",
    label: "Número da demanda",
    hint: "O \"MKT-42\" acima do título — é por ele que a demanda é citada no Slack, na notificação e na conversa.",
    default: true,
    /*
     * Sem `legacy`, e por isso ligado por padrão mesmo em quadro antigo.
     *
     * `parseCardBadges` trata chave ausente como "isto é novo": quadros
     * configurados antes deste selo existir não o listam, e listá-los como
     * desligados esconderia o número de quem nunca teve a chance de escolher.
     */
  },
  {
    key: "priority",
    label: "Urgência",
    hint: "A prioridade da demanda, na cor dela.",
    default: true,
    legacy: true,
  },
  {
    key: "dueDate",
    label: "Data",
    hint: "O prazo de entrega — em vermelho quando vencido.",
    default: true,
    legacy: true,
  },
  {
    key: "assignee",
    label: "Responsável",
    hint: "Quem assumiu o card, no rodapé à direita.",
    default: true,
    legacy: true,
  },
  {
    key: "stage",
    label: "Etapa",
    hint: "A coluna em que o card está. Útil fora do quadro, na busca e no filtro.",
    default: false,
    legacy: true,
  },
  {
    key: "briefing",
    label: "Briefing",
    hint: "As primeiras linhas do contexto escrito na abertura — ou do briefing que o gerador montou.",
    default: false,
  },
  {
    key: "pieces",
    label: "Peças de copy",
    hint: "Quantas variações de texto há dentro do card.",
    default: true,
  },
  {
    key: "link",
    label: "Link de referência",
    hint: "A pasta ou o material de apoio, clicável direto do quadro.",
    default: true,
  },
  {
    key: "attachments",
    label: "Anexos",
    hint: "O clipe com os arquivos que vieram junto da demanda.",
    default: true,
  },
] as const;

export type CardBadgeKey = (typeof CARD_BADGES)[number]["key"];

/** O que o quadro mostra enquanto ninguém escolheu. */
export const DEFAULT_CARD_BADGES: CardBadgeKey[] = CARD_BADGES.filter((b) => b.default).map(
  (b) => b.key
);

/** As quatro chaves que a configuração antiga, em lista, sabia nomear. */
const LEGACY_BADGES: CardBadgeKey[] = CARD_BADGES.filter(
  (b) => "legacy" in b && b.legacy
).map((b) => b.key);

export function isCardBadge(value: unknown): value is CardBadgeKey {
  return typeof value === "string" && CARD_BADGES.some((b) => b.key === value);
}

/** Na ordem do catálogo, sem repetição — a ordem de leitura não é opinião de quem clicou primeiro. */
function canonicalOrder(keys: Iterable<string>): CardBadgeKey[] {
  const chosen = new Set(Array.from(keys).filter(isCardBadge));
  return CARD_BADGES.filter((b) => chosen.has(b.key)).map((b) => b.key);
}

/**
 * A configuração gravada, de volta como lista do que aparece.
 *
 * Grava-se um MAPA de decisões, e não a lista do que está ligado, porque a
 * lista não distingue duas coisas que precisam ser distintas: "desliguei isto"
 * e "isto ainda não existia quando eu configurei". Com uma lista, todo item
 * novo nasceria desligado nos quadros já configurados — o card perderia o link
 * e os anexos que hoje mostra, sem ninguém ter pedido. No mapa, a ausência é
 * "nunca decidi", e vale o padrão do catálogo.
 *
 * Três formatos entram aqui:
 *
 * - **nulo** — nunca configurado. Vale o padrão inteiro.
 * - **mapa** — o formato de agora. Cada chave presente é uma decisão.
 * - **lista** — o formato antigo, que só sabia nomear os quatro de `legacy`.
 *   Entre eles, estar fora da lista é uma decisão de desligar e é respeitada;
 *   para os demais, a lista nada diz, e vale o padrão.
 */
export function parseCardBadges(raw: string | null | undefined): CardBadgeKey[] {
  if (raw === null || raw === undefined) return [...DEFAULT_CARD_BADGES];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_CARD_BADGES];
  }

  if (Array.isArray(parsed)) {
    const listados = new Set(parsed.map(String).filter(isCardBadge));
    const decididos = LEGACY_BADGES.filter((k) => listados.has(k));
    const novos = CARD_BADGES.filter((b) => !LEGACY_BADGES.includes(b.key) && b.default).map(
      (b) => b.key
    );
    return canonicalOrder([...decididos, ...novos]);
  }

  if (parsed && typeof parsed === "object") {
    const mapa = parsed as Record<string, unknown>;
    return canonicalOrder(
      CARD_BADGES.filter((b) => (b.key in mapa ? !!mapa[b.key] : b.default)).map((b) => b.key)
    );
  }

  return [...DEFAULT_CARD_BADGES];
}

/**
 * A escolha vinda da tela, pronta para gravar.
 *
 * Sai como mapa com TODAS as chaves do catálogo, inclusive as falsas: a tela
 * sempre manda a intenção completa, e gravá-la completa é o que torna cada
 * ausência futura legível como "isto é novo" em vez de "isto está desligado".
 */
export function serializeCardBadges(value: unknown): string {
  const ligados = new Set(canonicalOrder(Array.isArray(value) ? value.map(String) : []));
  return JSON.stringify(
    Object.fromEntries(CARD_BADGES.map((b) => [b.key, ligados.has(b.key)]))
  );
}

/**
 * O instante em que o mês corrente começou, no fuso do negócio.
 *
 * O prazo de permanência das entregas é o **mês civil**, não uma contagem de
 * dias: o quadro mostra o que foi entregue neste mês e vira a página quando o
 * mês vira. Tomar o primeiro dia em UTC deixaria as últimas três horas de cada
 * dia 31 contando como mês seguinte — uma entrega das 23h seria arquivada um
 * mês inteiro antes da hora.
 *
 * O deslocamento é medido, não assumido. O Brasil não usa horário de verão desde
 * 2019, mas um `-3` cravado no código é o tipo de constante que ninguém revisa
 * quando a regra muda.
 */
export function startOfCurrentMonth(timeZone = "America/Sao_Paulo", agora = new Date()): Date {
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  /** O relógio de parede daquele fuso, relido como se fosse UTC. */
  const relogioComoUtc = (instante: Date): number => {
    const p = Object.fromEntries(
      formatador.formatToParts(instante).map((x) => [x.type, x.value])
    ) as Record<string, string>;

    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };

  const hojeLa = new Date(relogioComoUtc(agora));

  /*
   * A ida e volta: o primeiro dia do mês tratado como UTC, medido o quanto o
   * fuso o desloca naquele instante, e corrigido por esse tanto. `formatToParts`
   * em vez de `toLocaleString` porque o texto do segundo depende do idioma e
   * volta a ser interpretado no fuso da máquina — que é justamente o que não se
   * pode assumir aqui.
   */
  const chute = Date.UTC(hojeLa.getUTCFullYear(), hojeLa.getUTCMonth(), 1, 0, 0, 0, 0);
  const deslocamento = chute - relogioComoUtc(new Date(chute));

  return new Date(chute + deslocamento);
}

/**
 * As cores de uma fase.
 *
 * Tokens do design system, e não hexadecimais escolhidos na hora: um azul
 * literal que funciona no tema claro some no escuro — é o mesmo motivo de
 * `PRIORITY_COLOR` não ter um cinza cravado. São as mesmas cinco
 * que as etapas já oferecem — `--success` fica de fora porque é o mesmo verde de
 * `--primary`, e duas opções idênticas na paleta só confundem quem escolhe.
 */
export const GROUP_COLORS = [
  { token: "var(--primary)", label: "Verde" },
  { token: "var(--info)", label: "Azul" },
  { token: "var(--warning)", label: "Âmbar" },
  { token: "var(--danger)", label: "Vermelho" },
  { token: "var(--muted)", label: "Neutro" },
] as const;

export const DEFAULT_GROUP_COLOR = GROUP_COLORS[0].token;

export function isGroupColor(value: unknown): boolean {
  return typeof value === "string" && GROUP_COLORS.some((c) => c.token === value);
}

export interface GroupDefinition {
  id: string;
  name: string;
  color: string;
  position: number;
  /** Quem responde por esta fase, em JSON de e-mails. Ver `ownershipOf`. */
  assignees?: string | null;
  /** Quem assume, das pessoas acima, quando um card entra na fase. */
  defaultAssignee?: string | null;
}

/** Uma faixa do quadro: a fase e as etapas que ela cobre. */
export interface BoardSegment<T> {
  group: GroupDefinition | null;
  columns: T[];
}

/**
 * As etapas do quadro, repartidas em faixas.
 *
 * Uma fase precisa de etapas **vizinhas** para ter uma faixa contínua acima
 * delas. Em vez de exigir que alguém ordene as colunas até que fiquem juntas —
 * e de quebrar a faixa em duas quando não ficarem —, a fase ocupa a posição da
 * sua primeira etapa e as demais vêm atrás dela.
 *
 * O efeito colateral é bom: marcar uma coluna do fim como "Briefing" a traz
 * para junto das outras do briefing, que é o que a pessoa queria ao marcar.
 * Etapa sem fase vira uma faixa de uma coluna só, e mantém o lugar que tinha.
 */
export function groupColumns<T extends { id: string; position: number; groupId?: string | null }>(
  columns: T[],
  groups: GroupDefinition[]
): BoardSegment<T>[] {
  const porId = new Map(groups.map((g) => [g.id, g]));
  const ordenadas = [...columns].sort((a, b) => a.position - b.position);

  const segmentos: BoardSegment<T>[] = [];
  const porChave = new Map<string, BoardSegment<T>>();

  for (const coluna of ordenadas) {
    // Grupo que não existe mais vale como etapa solta: o `SetNull` do banco
    // cobre a exclusão, mas não uma tela carregada antes dela.
    const grupo = coluna.groupId ? porId.get(coluna.groupId) ?? null : null;
    const chave = grupo ? `g:${grupo.id}` : `c:${coluna.id}`;

    const existente = porChave.get(chave);
    if (existente) {
      existente.columns.push(coluna);
      continue;
    }

    const novo: BoardSegment<T> = { group: grupo, columns: [coluna] };
    porChave.set(chave, novo);
    segmentos.push(novo);
  }

  return segmentos;
}

/**
 * Quem responde por uma etapa.
 *
 * JSON de e-mails, e não uma tabela de ligação: a lista é curta e só se lê
 * junto com a coluna, e uma tabela nova daria um `JOIN` a cada carga do quadro
 * para responder "quem pode assumir isto aqui".
 *
 * E-mail, e não sigla, porque quem toca uma demanda não é necessariamente quem
 * desenha peças — a sigla pertence a `Creator`, que existe para atribuir
 * criativos, e chavear o quadro por ela deixava mídia paga e conteúdo de fora.
 */
export function parseAssignees(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const limpas = parsed
      .filter((s): s is string => typeof s === "string")
      .map(normalizePerson)
      .filter((s): s is string => !!s);
    return Array.from(new Set(limpas));
  } catch {
    return [];
  }
}

/** A lista vinda da tela, pronta para gravar. Nulo é "qualquer um". */
export function serializeAssignees(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  const limpas = Array.from(
    new Set(
      list
        .filter((s): s is string => typeof s === "string")
        .map(normalizePerson)
        .filter((s): s is string => !!s)
    )
  );
  return limpas.length ? JSON.stringify(limpas) : null;
}

/**
 * A forma canônica de uma pessoa no quadro: o e-mail, em minúsculas.
 *
 * Uma função só, usada por todo lado, porque comparação de pessoa acontece em
 * cinco lugares diferentes aqui dentro — e bastava um deles esquecer o
 * `toLowerCase` para "Ana@x.com" e "ana@x.com" virarem duas pessoas, com o
 * seletor recusando quem o card mostra como dono.
 */
export function normalizePerson(value: string | null | undefined): string | null {
  const limpo = value?.trim().toLowerCase();
  return limpo || null;
}

export interface StageOwnership {
  assignees?: string | null;
  defaultAssignee?: string | null;
}

/**
 * Quem responde por uma etapa — que é sempre quem responde pela FASE dela.
 *
 * A equipe mora no grupo, não na coluna: a fase É o time. "Produção" nomeia um
 * conjunto de pessoas tanto quanto um trecho do fluxo, e repetir a mesma
 * equipe em cada etapa da fase era descrever três vezes o mesmo fato — e
 * garantir que um dia as três divergissem.
 *
 * Etapa solta, sem fase, não tem equipe: qualquer pessoa pode assumir. É o
 * estado de todo quadro antes de alguém desenhar o processo, e continua sendo
 * o padrão de quem nunca criou uma fase.
 *
 * Esta função é a única ponte entre coluna e equipe. Todo o resto do sistema
 * recebe a `StageOwnership` já resolvida e não precisa saber de onde ela veio —
 * é o que permitiu mudar o eixo sem reescrever as regras.
 */
export function ownershipOf<G extends StageOwnership & { id: string }>(
  column: { groupId?: string | null } | null | undefined,
  groups: G[]
): StageOwnership {
  if (!column?.groupId) return {};
  return groups.find((g) => g.id === column.groupId) ?? {};
}

/**
 * Quem fica com o card ao chegar nesta etapa.
 *
 * Três situações, nesta ordem:
 *
 * 1. **Fase sem equipe** — nada muda. É o quadro de antes de existir a regra,
 *    e continua sendo o padrão de quem nunca configurou.
 * 2. **O dono atual é da equipe** — fica. Quem já estava tocando a demanda não
 *    é substituído só porque ela avançou.
 * 3. **O dono atual não é da equipe (ou não há dono)** — entra o PRIMEIRO da
 *    equipe. É a passagem de bastão: a copy sai das mãos de quem escreveu e cai
 *    nas de quem desenha, sem ninguém precisar lembrar de repassar.
 *
 * A ordem da lista é a resposta para "qual deles". Escolher a equipe já diz
 * quem responde pela fase; pedir um segundo clique para eleger um padrão era
 * perguntar duas vezes a mesma coisa — e quem esquecesse o segundo ficava com
 * cards de Growth sob responsabilidade de alguém da Criação, em silêncio.
 *
 * `defaultAssignee` ainda é honrado quando existe, para não invalidar quadros
 * configurados antes desta regra, mas nada na tela o define mais.
 */
export function resolveStageAssignee(
  column: StageOwnership,
  current: string | null | undefined
): string | null {
  const equipe = parseAssignees(column.assignees);
  const dono = normalizePerson(current);
  if (!equipe.length) return dono;
  if (dono && equipe.includes(dono)) return dono;

  const escolhido = normalizePerson(column.defaultAssignee);
  const padrao = escolhido && equipe.includes(escolhido) ? escolhido : equipe[0];

  return padrao ?? dono;
}

/**
 * Se esta etapa dá o card por bem-atribuído.
 *
 * Só vale para etapas que **exigem** responsável: com equipe definida, "tem
 * dono" não basta — o dono precisa ser de quem responde ali. Sem isso, uma
 * demanda de revisão chegaria carimbada com o nome de quem a desenhou, e o
 * seletor recusaria a mesma pessoa que o card mostra como dona.
 */
export function stageAccepts(column: StageOwnership, person: string | null | undefined): boolean {
  const dono = normalizePerson(person);
  if (!dono) return false;

  const equipe = parseAssignees(column.assignees);
  return equipe.length === 0 || equipe.includes(dono);
}

/** As pessoas que esta etapa aceita — vazio é "qualquer uma do quadro". */
export function stageCandidates<T extends { email: string }>(
  column: StageOwnership | null | undefined,
  everyone: T[]
): T[] {
  const equipe = column ? parseAssignees(column.assignees) : [];
  if (!equipe.length) return everyone;

  const daEtapa = everyone.filter((p) => equipe.includes(p.email.toLowerCase()));
  /*
   * Equipe cujas siglas não casam com ninguém do cadastro devolve o quadro
   * inteiro. A pessoa pode ter saído da empresa depois de a etapa ser
   * configurada, e uma lista vazia deixaria a etapa impossível de atribuir —
   * um quadro travado por uma configuração velha.
   */
  return daEtapa.length ? daEtapa : everyone;
}

/** Uma etapa e a fase dela, na ordem em que o quadro deve gravá-las. */
export interface ColumnPlacement {
  id: string;
  groupId: string | null;
}

/**
 * Onde a etapa arrastada fica, e em que fase ela passa a estar.
 *
 * A etapa é retirada da fila e reinserida no índice que a etapa-alvo ocupava —
 * o que faz o alvo ceder o lugar e andar para a direita. Funciona igual nos
 * dois sentidos, sem precisar saber se o arrasto foi para frente ou para trás.
 *
 * **A fase vem junto.** Soltar uma etapa no meio da faixa "Produção" só pode
 * significar que ela é de produção; mantê-la na fase antiga faria
 * `groupColumns` puxá-la de volta para perto das irmãs, e o arrasto pareceria
 * não ter funcionado. Por isso ela adota a fase do alvo — inclusive quando o
 * alvo é uma etapa solta, e aí ela também fica solta.
 *
 * Devolve a lista inteira, e não só o que mudou: posição é ordem relativa, e
 * gravar uma etapa por vez deixa o quadro com duas na mesma posição no
 * intervalo entre as chamadas.
 */
export function reorderColumns<T extends { id: string; position: number; groupId?: string | null }>(
  columns: T[],
  dragId: string,
  targetId: string
): ColumnPlacement[] {
  const ordenadas = [...columns].sort((a, b) => a.position - b.position);

  const arrastada = ordenadas.find((c) => c.id === dragId);
  const alvo = ordenadas.find((c) => c.id === targetId);
  if (!arrastada || !alvo || dragId === targetId) {
    return ordenadas.map((c) => ({ id: c.id, groupId: c.groupId ?? null }));
  }

  const restantes = ordenadas.filter((c) => c.id !== dragId);
  const destino = restantes.findIndex((c) => c.id === targetId);

  const fila: ColumnPlacement[] = restantes.map((c) => ({ id: c.id, groupId: c.groupId ?? null }));
  fila.splice(destino, 0, { id: dragId, groupId: alvo.groupId ?? null });

  return fila;
}

/**
 * Quem fica com o card depois de alguém arrastá-lo para outra etapa.
 *
 * Mover deixou de ser só transporte: passou a ser um jeito de assumir. Quem
 * puxa a demanda para a sua etapa está dizendo que vai tocá-la, e obrigar essa
 * pessoa a abrir o card e se escolher num seletor era pedir que ela repetisse,
 * num formulário, o que o gesto já disse.
 *
 * A ordem de precedência:
 *
 * 1. **A escolha explícita.** É a resposta ao "quem assume?" que a tela faz ao
 *    soltar o card numa etapa que exige dono. Alguém respondeu a pergunta; a
 *    resposta vale mais que qualquer dedução.
 * 2. **Quem moveu**, se a etapa o aceitar. É a regra nova.
 * 3. **A regra da etapa**, quando quem moveu não responde por ali — o dono
 *    atual fica, ou entra o padrão da etapa. Ver `resolveStageAssignee`.
 *
 * O passo 3 é o que impede o gesto de atropelar o desenho do fluxo: quem
 * escreve a copy não passa a aprovar a arte só por ter arrastado o card até
 * lá. A equipe da etapa continua sendo quem decide quem pode assumir; mover
 * apenas escolhe **entre** os que podem.
 *
 * Atenção ao caso da etapa sem equipe: `stageAccepts` aceita qualquer um, então
 * ali quem move sempre assume. É deliberado — é o quadro que ninguém
 * configurou, e nele o gesto é a única informação disponível.
 */
export function resolveMoveAssignee(
  column: StageOwnership & { requiresAssignee?: boolean },
  current: string | null | undefined,
  mover: string | null | undefined,
  explicit?: string | null
): string | null {
  const escolhido = normalizePerson(explicit);
  if (escolhido) return resolveStageAssignee(column, escolhido);

  const quemMoveu = normalizePerson(mover);
  if (quemMoveu && stageAccepts(column, quemMoveu)) return quemMoveu;

  return resolveStageAssignee(column, current);
}

/**
 * Quem responde pela demanda depois de alguém movê-la.
 *
 * Duas situações bem diferentes, e a distinção é o coração desta regra:
 *
 * - **Chegar numa fase** — a demanda passa a ser do TIME inteiro. Ninguém foi
 *   eleito ainda; o que aconteceu é que há trabalho novo na fila daquele time,
 *   e todos precisam vê-lo. É o estado de uma demanda no backlog.
 *
 * - **Agir dentro da fase** — quem move o card para produção está dizendo "eu
 *   pego". Aí a demanda vira de uma pessoa só, e os outros saem: um card em
 *   produção sob o nome de seis pessoas não diz quem está fazendo, e é
 *   exatamente na produção que essa pergunta importa.
 *
 * Fase sem equipe mantém o comportamento antigo — quem move assume —, que é o
 * padrão de quem nunca desenhou o processo.
 *
 * A atribuição manual sobrevive a tudo isto: ela acontece pelo painel do card,
 * por outro caminho, e não passa por aqui.
 */
export function resolveMoveAssignees(
  destino: StageOwnership,
  mudouDeFase: boolean,
  atuais: string[],
  mover: string | null | undefined
): string[] {
  const equipe = parseAssignees(destino.assignees);
  const quemMoveu = normalizePerson(mover);

  if (!equipe.length) return quemMoveu ? [quemMoveu] : atuais;
  if (mudouDeFase) return equipe;
  if (quemMoveu && equipe.includes(quemMoveu)) return [quemMoveu];

  return atuais;
}

/**
 * O briefing reduzido a uma linha de texto simples.
 *
 * O briefing é markdown — o gerador o monta com **negritos** e uma linha por
 * assunto. Jogado cru num card, ele aparece com os asteriscos à mostra e ocupa
 * a altura de um parágrafo. Aqui a marcação sai, as quebras viram separadores
 * e o que sobra é uma linha que o card corta onde couber.
 */
export function plainSummary(markdown: string | null | undefined): string {
  if (!markdown) return "";

  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // Link vira o texto dele: a URL não cabe, e o rótulo é o que informa.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Sem acento e sem caixa: "Vídeo" e "video" são a mesma palavra para quem lê. */
function foldTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * A opção do campo que corresponde a um valor vindo de fora.
 *
 * O gerador de copy e o formulário de demanda têm listas próprias para as
 * mesmas coisas — "Meta" de um lado, "Meta Ads" do outro. Para o card vindo do
 * gerador responder às mesmas configurações de exibição que os demais, o valor
 * precisa chegar ao campo escrito como o campo o escreve.
 *
 * Só devolve o que reconhece SEM ambiguidade: igual, ou uma única opção que
 * contenha o valor (ou seja contida por ele). Duas candidatas devolvem nulo, e
 * o campo fica vazio — um palpite gravaria no card uma resposta que a pessoa
 * não deu, e que ninguém saberia de onde veio.
 */
export function matchOption(value: string | null | undefined, options: string[]): string | null {
  const alvo = foldTerm(String(value ?? ""));
  if (!alvo) return null;

  const exata = options.find((o) => foldTerm(o) === alvo);
  if (exata) return exata;

  const parecidas = options.filter((o) => {
    const op = foldTerm(o);
    return op.includes(alvo) || alvo.includes(op);
  });

  return parecidas.length === 1 ? parecidas[0] : null;
}

/**
 * Quanto texto cabe na frente de um card.
 *
 * O card não é lugar de ler o briefing — é lugar de reconhecer a demanda. Duas
 * ou três frases dizem se é aquela que se procura; o resto está a um clique.
 * Sem um teto, um briefing bem escrito empurra os cards seguintes para fora da
 * tela, e a coluna deixa de ser legível de uma olhada.
 */
export const CARD_TEXT_LIMIT = 250;

/**
 * Corta o texto no limite, preferindo a última palavra inteira.
 *
 * Cortar no caractere exato parte palavra ao meio — "iPhone 17 Pro Ma…" — e a
 * reticência passa a parecer erro em vez de continuação. Recuar até o espaço
 * anterior só vale enquanto sobrar texto suficiente; num texto sem espaços, o
 * corte seco é o único possível.
 */
export function clampText(text: string, limit = CARD_TEXT_LIMIT): string {
  const limpo = text.trim();
  if (limpo.length <= limit) return limpo;

  const corte = limpo.slice(0, limit);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > limit * 0.6 ? corte.slice(0, ultimoEspaco) : corte;

  return `${base.trimEnd()}…`;
}

/**
 * O prefixo do número da demanda. "MKT-42".
 *
 * Constante, e não coluna do quadro, porque hoje há um time. Quando houver
 * dois, o prefixo passa a ser do `Board` e a sequência passa a ser por quadro —
 * as duas mudanças andam juntas, porque prefixo por time com sequência global
 * produziria "MKT-1" e "DEV-2", que parece falta de número e não organização.
 */
export const CARD_CODE_PREFIX = "MKT";

/** O número como a equipe o escreve. Nulo só nas demandas anteriores à coluna. */
export function formatCardCode(code: number | null | undefined): string | null {
  return typeof code === "number" ? `${CARD_CODE_PREFIX}-${code}` : null;
}

/**
 * Cria um card já com o próximo número da sequência.
 *
 * O número sai de `MAX(code) + 1`, e duas aberturas simultâneas podem ler o
 * mesmo máximo. Em vez de serializar toda criação de demanda com um bloqueio —
 * caro e permanente por um caso que acontece quando duas pessoas clicam no
 * mesmo segundo —, deixamos a restrição `@unique` do banco ser o árbitro e
 * tentamos de novo: quem perder a corrida relê o máximo, que agora já inclui o
 * vencedor. É a mesma escolha do portão do cron, pelo mesmo motivo.
 *
 * Três tentativas cobrem folgadamente a concorrência real de um quadro; falhar
 * depois disso é sintoma de outra coisa, e vale subir em vez de mascarar.
 */
export async function criarCardComCodigo<T>(
  /*
   * O cliente entra por parâmetro, e descrito pelo que se usa dele.
   *
   * Este módulo é importado por componentes de cliente — puxar o Prisma aqui
   * arrastaria o motor de consulta para dentro do pacote do navegador. O tipo
   * estrutural diz exatamente a chamada que esta função faz, e nada além.
   */
  prisma: {
    boardCard: {
      aggregate: (args: { _max: { code: true } }) => Promise<{ _max: { code: number | null } }>;
    };
  },
  criar: (code: number) => Promise<T>
): Promise<T> {
  let ultimoErro: unknown;

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const maior = await prisma.boardCard.aggregate({ _max: { code: true } });
    const code = (maior?._max?.code ?? 0) + 1;

    try {
      return await criar(code);
    } catch (error: unknown) {
      // P2002 = violação de unicidade. Só o campo `code` é retentável aqui:
      // qualquer outro conflito é um problema de verdade e sobe na hora.
      const falha = error as { code?: string; meta?: { target?: unknown } };
      const alvo = falha?.meta?.target;
      const conflitoDeCodigo =
        falha?.code === "P2002" &&
        (alvo === "BoardCard_code_key" || (Array.isArray(alvo) && alvo.includes("code")));

      if (!conflitoDeCodigo) throw error;
      ultimoErro = error;
    }
  }

  throw ultimoErro;
}

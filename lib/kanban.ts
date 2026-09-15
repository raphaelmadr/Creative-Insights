/**
 * As regras do Kanban — tipos de campo, prioridades e o quadro inicial.
 *
 * Moram aqui, e não dentro das rotas nem da tela, porque três lugares precisam
 * concordar sobre a mesma coisa: o formulário que desenha o campo, a rota que
 * valida a resposta e o card que a exibe de volta. Com a lista de tipos escrita
 * em cada um deles, basta alguém acrescentar um tipo em um para os outros dois
 * passarem a recusá-lo — ou, pior, aceitarem sem validar.
 */

export const FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "SELECT",
  "MULTISELECT",
  "NUMBER",
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
  DATE: "Data",
  URL: "Link",
  CHECKBOX: "Sim / Não",
};

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

export const CARD_ORIGINS = ["FORM", "COPY"] as const;
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
        const options = parseOptions(field.options);
        const chosen = (Array.isArray(raw) ? raw : [raw]).map(String);
        const invalid = chosen.find((c) => !options.includes(c));
        if (invalid) {
          return { ok: false, error: `"${invalid}" não é uma opção de "${field.label}".`, values: {} };
        }
        values[field.key] = chosen;
        break;
      }

      case "SELECT": {
        const options = parseOptions(field.options);
        const chosen = String(raw);
        if (!options.includes(chosen)) {
          return { ok: false, error: `"${chosen}" não é uma opção de "${field.label}".`, values: {} };
        }
        values[field.key] = chosen;
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
    {
      label: "Formato",
      type: "MULTISELECT" as FieldType,
      required: true,
      options: ["Estático 1:1", "Estático 9:16", "Vídeo 9:16", "Vídeo 1:1", "Carrossel", "GIF"],
      showOnCard: true,
    },
    {
      label: "Canal",
      type: "SELECT" as FieldType,
      required: false,
      options: ["Meta Ads", "TikTok Ads", "Google Ads", "Orgânico", "CRM"],
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
 * Os campos definíveis já têm o seu `showOnCard` — isto é o equivalente para os
 * quatro atributos que todo card tem de nascença e que nenhum formulário
 * pergunta: prazo, dono, etapa e urgência. Sem essa configuração eles eram uma
 * decisão tomada dentro do componente do quadro, igual para todo time: quem
 * trabalha com prazo curto precisa da data em destaque, quem divide a fila por
 * pessoa precisa do responsável, e quem só olha uma etapa por vez não precisa
 * de nenhum dos dois.
 */
export const CARD_BADGES = [
  {
    key: "priority",
    label: "Urgência",
    hint: "A prioridade da demanda, na cor dela.",
  },
  {
    key: "dueDate",
    label: "Data",
    hint: "O prazo de entrega — em vermelho quando vencido.",
  },
  {
    key: "assignee",
    label: "Responsável",
    hint: "Quem assumiu o card, pelo avatar e pela sigla.",
  },
  {
    key: "stage",
    label: "Etapa",
    hint: "A coluna em que o card está. Útil fora do quadro, na busca e no filtro.",
  },
] as const;

export type CardBadgeKey = (typeof CARD_BADGES)[number]["key"];

/** O que o quadro mostra enquanto ninguém escolheu — o card de sempre. */
export const DEFAULT_CARD_BADGES: CardBadgeKey[] = ["priority", "dueDate", "assignee"];

export function isCardBadge(value: unknown): value is CardBadgeKey {
  return typeof value === "string" && CARD_BADGES.some((b) => b.key === value);
}

/** Na ordem do catálogo, sem repetição — a ordem de leitura não é opinião de quem clicou primeiro. */
function canonicalOrder(keys: Iterable<string>): CardBadgeKey[] {
  const chosen = new Set(Array.from(keys).filter(isCardBadge));
  return CARD_BADGES.filter((b) => chosen.has(b.key)).map((b) => b.key);
}

/**
 * A configuração gravada, de volta como lista.
 *
 * Nulo e lista vazia são coisas diferentes, e é por isso que a coluna aceita
 * nulo: nulo é "nunca foi configurado", e vale o padrão; `[]` é uma escolha de
 * alguém que quer o card limpo, só com o título. Tratar os dois como iguais
 * faria os badges voltarem sozinhos no primeiro recarregamento.
 */
export function parseCardBadges(raw: string | null | undefined): CardBadgeKey[] {
  if (raw === null || raw === undefined) return [...DEFAULT_CARD_BADGES];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_CARD_BADGES];
    return canonicalOrder(parsed.map(String));
  } catch {
    return [...DEFAULT_CARD_BADGES];
  }
}

/** A lista vinda da tela, pronta para gravar. Sempre texto: `[]` precisa caber. */
export function serializeCardBadges(value: unknown): string {
  const list = Array.isArray(value) ? value.map(String) : [];
  return JSON.stringify(canonicalOrder(list));
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

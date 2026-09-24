/**
 * As preferências de cada pessoa: tema e filtros do painel.
 *
 * Guardadas como um JSON só, em `User.preferences`, porque o conjunto de
 * filtros acompanha a interface — cada filtro novo viraria uma coluna nova e
 * uma migração. O preço de JSON é não haver esquema no banco, então o esquema
 * vive aqui: tudo que entra e tudo que sai passa por `parsePreferences`, e
 * nenhum campo desconhecido ou de tipo errado chega à interface.
 */

export type ThemePreference = "light" | "dark";

export interface DashboardFilters {
  /** Datas no formato YYYY-MM-DD, como os inputs do painel as usam. */
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  channel: string;
  /** Sigla do criador, ou `null` para "todos". */
  designer: string | null;
  hideOldAds: boolean;
}

export interface UserPreferences {
  theme: ThemePreference;
  filters: DashboardFilters;

  /**
   * O instante em que esta pessoa limpou TODAS as notificações, em ISO.
   *
   * As notificações não são linhas guardadas, e sim uma leitura do histórico do
   * quadro — limpar não apaga nada, marca até onde ela já leu. Nulo é quem
   * nunca limpou: vê tudo o que lhe diz respeito.
   */
  notificationsReadAt: string | null;

  /**
   * O mesmo carimbo, por demanda: `{ [cardId]: instante ISO }`.
   *
   * Existe desde que a aba passou a ter um "x" em cada aviso. É por DEMANDA, e
   * não por evento, porque cada demanda aparece uma vez só na lista, com o
   * evento mais recente: carimbar o evento faria o anterior da mesma demanda
   * tomar o lugar dele — dispensar um aviso traria outro no lugar, que é o
   * contrário do que o "x" promete.
   *
   * E é um instante, e não um "sim": o que acontecer DEPOIS na mesma demanda
   * volta a avisar. Dispensar é "já vi isto", não "não me fale mais dela".
   *
   * Some inteiro quando a pessoa limpa tudo — daí em diante o carimbo geral já
   * cobre o que estes cobriam, e mantê-los só faria o campo crescer para sempre.
   */
  notificationsDismissed: Record<string, string>;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  dateFrom: null,
  dateTo: null,
  status: "ALL",
  channel: "ALL",
  designer: null,
  hideOldAds: true,
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  filters: DEFAULT_FILTERS,
  notificationsReadAt: null,
  notificationsDismissed: {},
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const asTheme = (value: unknown): ThemePreference | null =>
  value === "light" || value === "dark" ? value : null;

const asDate = (value: unknown): string | null =>
  typeof value === "string" && DATE_PATTERN.test(value) ? value : null;

/**
 * Um rótulo curto de filtro: as opções do painel são siglas e constantes como
 * `ALL`, `META`, `ACTIVE`. O limite existe para que um corpo de requisição
 * adulterado não grave um texto enorme no campo.
 */
const asToken = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 && value.length <= 64 ? value : fallback;

const asNullableToken = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

/**
 * Um instante em ISO, validado de verdade.
 *
 * `new Date("qualquer coisa")` devolve `Invalid Date` em silêncio, e um carimbo
 * inválido gravado aqui faria toda comparação de "já vi" ser falsa — a aba
 * voltaria a mostrar tudo, para sempre, sem erro nenhum aparecendo.
 */
const asInstant = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * O mapa de demandas dispensadas, limpo de tudo que não presta.
 *
 * Teto de entradas porque isto mora dentro de um JSON de preferências que é
 * lido em toda visita: sem limite, quem nunca clica em "limpar todas" levaria o
 * campo a crescer sem fim. As mais recentes ficam — as antigas já saíram da
 * janela da aba de qualquer forma.
 */
const TETO_DISPENSADAS = 100;

function parseDismissed(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};

  const pares: [string, string][] = [];
  for (const [id, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || id.length > 64) continue;
    const instante = asInstant(valor);
    if (instante) pares.push([id, instante]);
  }

  pares.sort((a, b) => b[1].localeCompare(a[1]));
  return Object.fromEntries(pares.slice(0, TETO_DISPENSADAS));
}

function parseFilters(raw: unknown): DashboardFilters {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FILTERS };
  const source = raw as Record<string, unknown>;

  return {
    dateFrom: asDate(source.dateFrom),
    dateTo: asDate(source.dateTo),
    status: asToken(source.status, DEFAULT_FILTERS.status),
    channel: asToken(source.channel, DEFAULT_FILTERS.channel),
    designer: asNullableToken(source.designer),
    hideOldAds: asBoolean(source.hideOldAds, DEFAULT_FILTERS.hideOldAds),
  };
}

/**
 * Lê o campo do banco. Conteúdo ilegível vira o padrão em vez de exceção: uma
 * preferência corrompida não pode impedir alguém de abrir o painel.
 */
export function parsePreferences(stored: string | null | undefined): UserPreferences {
  if (!stored) return { ...DEFAULT_PREFERENCES, filters: { ...DEFAULT_FILTERS } };

  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return { ...DEFAULT_PREFERENCES, filters: { ...DEFAULT_FILTERS } };
  }

  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  return {
    theme: asTheme(source.theme) || DEFAULT_PREFERENCES.theme,
    filters: parseFilters(source.filters),
    notificationsReadAt: asInstant(source.notificationsReadAt),
    notificationsDismissed: parseDismissed(source.notificationsDismissed),
  };
}

/**
 * Aplica uma alteração parcial sobre as preferências atuais.
 *
 * Parcial de propósito: a interface salva o tema quando alguém troca o tema e
 * os filtros quando alguém mexe nos filtros. Se cada gravação mandasse o objeto
 * inteiro, duas abas abertas se sobrescreveriam — a que salvasse por último
 * devolveria os filtros que tinha em memória desde que foi aberta.
 */
export function mergePreferences(
  current: UserPreferences,
  patch: unknown
): UserPreferences {
  if (!patch || typeof patch !== "object") return current;
  const source = patch as Record<string, unknown>;

  const theme = "theme" in source ? asTheme(source.theme) || current.theme : current.theme;

  const filters =
    "filters" in source && source.filters && typeof source.filters === "object"
      ? parseFilters({ ...current.filters, ...(source.filters as Record<string, unknown>) })
      : current.filters;

  const notificationsReadAt =
    "notificationsReadAt" in source
      ? asInstant(source.notificationsReadAt)
      : current.notificationsReadAt;

  /* Substitui, não funde: quem dispensa uma demanda manda o mapa inteiro já
     montado, e é assim que "limpar todas" consegue esvaziá-lo. */
  const notificationsDismissed =
    "notificationsDismissed" in source
      ? parseDismissed(source.notificationsDismissed)
      : current.notificationsDismissed;

  return { theme, filters, notificationsReadAt, notificationsDismissed };
}

export function serializePreferences(preferences: UserPreferences): string {
  return JSON.stringify(preferences);
}

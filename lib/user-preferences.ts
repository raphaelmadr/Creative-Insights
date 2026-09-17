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
   * O instante em que esta pessoa limpou as notificações, em ISO.
   *
   * É o estado inteiro de "já vi": as notificações não são linhas guardadas, e
   * sim as demandas atribuídas a ela — limpar não apaga nada, marca até onde ela
   * já leu. Um carimbo só, e não uma marca por notificação, porque a aba tem um
   * botão só: "limpar tudo". Guardar por item seria descrever um controle que a
   * interface não oferece.
   *
   * Nulo é quem nunca limpou: vê tudo o que está atribuído a ela.
   */
  notificationsReadAt: string | null;
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

  return { theme, filters, notificationsReadAt };
}

export function serializePreferences(preferences: UserPreferences): string {
  return JSON.stringify(preferences);
}

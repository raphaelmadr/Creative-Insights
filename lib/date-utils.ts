/**
 * Utilitários de data centrados no fuso do negócio (America/Sao_Paulo).
 *
 * Motivo: os syncs comparavam "hoje" usando `new Date().toISOString()` (UTC).
 * Depois das 21h de Brasília o UTC já virou o dia seguinte, então o dia
 * corrente era tratado como dia passado e acabava pulado. Todas as chaves de
 * `AdDailyMetrics.date` são meia-noite UTC do dia civil brasileiro.
 */

export const BUSINESS_TIMEZONE = "America/Sao_Paulo";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data civil corrente no fuso do negócio, como "YYYY-MM-DD". */
export function todayInBusinessTz(): string {
  return ymdFormatter.format(new Date());
}

/** Converte um Date para a data civil no fuso do negócio ("YYYY-MM-DD"). */
export function toBusinessYmd(date: Date): string {
  return ymdFormatter.format(date);
}

/** "YYYY-MM-DD" -> Date em meia-noite UTC (a chave usada em AdDailyMetrics.date). */
export function ymdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Soma (ou subtrai) dias sobre uma string "YYYY-MM-DD", sem depender do fuso local. */
export function addDaysYmd(ymd: string, days: number): string {
  const base = ymdToUtcDate(ymd);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Lista inclusiva de dias civis entre duas datas "YYYY-MM-DD". */
export function eachDayYmd(sinceYmd: string, untilYmd: string): string[] {
  const days: string[] = [];
  let cursor = sinceYmd;
  // Guarda contra intervalo invertido ou entrada inválida.
  let guard = 0;
  while (cursor <= untilYmd && guard < 400) {
    days.push(cursor);
    cursor = addDaysYmd(cursor, 1);
    guard++;
  }
  return days;
}

/**
 * Janela de sincronização para um mês alvo.
 * Sem mês/ano explícitos, usa o mês corrente no fuso do negócio.
 * O fim nunca ultrapassa hoje — a API não tem dados do futuro.
 */
export function resolveSyncWindow(
  targetMonth?: number,
  targetYear?: number
): { sinceYmd: string; untilYmd: string; todayYmd: string } {
  const todayYmd = todayInBusinessTz();
  const [curYear, curMonth] = todayYmd.split("-").map(Number);

  const month = targetMonth ?? curMonth;
  const year = targetYear ?? curYear;

  const mm = String(month).padStart(2, "0");
  const sinceYmd = `${year}-${mm}-01`;

  // Dia 0 do mês seguinte = último dia do mês alvo.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEndYmd = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const untilYmd = monthEndYmd > todayYmd ? todayYmd : monthEndYmd;

  return { sinceYmd, untilYmd, todayYmd };
}

/**
 * Interpreta um timestamp de API que vem em UTC mas sem indicador de fuso
 * (ex.: TikTok devolve "2024-05-16 19:15:08"). `new Date(...)` nesse formato
 * assume horário local, o que desloca a data em servidores fora do UTC.
 */
export function parseApiTimestampUtc(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  // Já tem fuso explícito (ISO com Z ou ±HH:MM) — deixa o parser nativo resolver.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasZone ? trimmed : `${trimmed.replace(" ", "T")}Z`;

  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

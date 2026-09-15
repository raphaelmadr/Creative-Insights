/**
 * O calendário — a grade de dias e o vaivém entre `Date` e "AAAA-MM-DD".
 *
 * Estava dentro de `components/DateRangePicker.tsx`, onde bastava enquanto só o
 * painel tinha calendário. Saiu de lá quando o gerador de copy passou a precisar
 * de um seletor de data própria: duas grades desenhadas em dois arquivos
 * começam iguais e divergem no primeiro ajuste — a semana que começa no domingo
 * num, na segunda no outro.
 *
 * As datas são montadas em UTC de propósito. O que se escolhe aqui é um **dia
 * civil**, não um instante: `Date.UTC` mantém "30/09" sendo 30/09 em qualquer
 * fuso, e é a mesma razão de `parseDueDate` ancorar o prazo ao meio-dia quando
 * ele chega ao banco.
 */

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const WEEK_DAYS = ["do", "se", "te", "qu", "qu", "se", "sá"];

/** O valor que um campo de data usa: "AAAA-MM-DD". */
export function toDateInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateInput(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Como a data aparece para quem lê: 30/09/2026. */
export function formatDisplay(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Hoje, como dia civil no fuso do negócio. */
export function todayUtcDay(): Date {
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

/**
 * A grade do mês, em semanas de sete posições.
 *
 * As posições antes do primeiro dia e depois do último vêm nulas, e não com os
 * dias dos meses vizinhos: um dia de outro mês clicável é o erro clássico
 * destes calendários.
 */
export function generateCalendarGrid(year: number, month: number): (Date | null)[][] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay(); // 0 = domingo

  const grid: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];

  for (let i = 0; i < firstDay; i++) currentWeek.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(Date.UTC(year, month, day)));
    if (currentWeek.length === 7) {
      grid.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    grid.push(currentWeek);
  }

  return grid;
}

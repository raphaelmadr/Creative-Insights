/**
 * Se o nome do anúncio denuncia uma peça feita fora do período — para o funil
 * de novos, que só conta o que foi criado no mês vigente.
 *
 * Um anúncio lançado no mês pode ser uma peça antiga republicada, e o nome é o
 * único rastro disso. Três sinais:
 *
 * - **qualquer data** no nome (`2025-06-25`, `25/06/2025`), do mês que for;
 * - **mês em número** como tag inteira — `_08_`, `-07-`, `| 06 |` — fora do período;
 * - **mês por extenso ou abreviado** como tag inteira — `agosto`, `ago` — fora do período.
 *
 * Tag inteira quer dizer entre separadores: `v01` e `#001` não são mês.
 */

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* Separadores dos dois padrões de nomenclatura da conta (`A_B-C` e `A | B | C`).
   Hífen escapado com UMA barra: com duas, `\\-|` vira o intervalo `\`..`|`,
   que engole todas as minúsculas. */
const SEPARADOR = /[_\-|.\s–—#]+/;

const ANO_MES_DIA = /(?<!\d)(20\d{2})[-_./](\d{1,2})[-_./](\d{1,2})(?!\d)/;
const DIA_MES_ANO = /(?<!\d)(\d{1,2})[-_./](\d{1,2})[-_./](\d{2}|\d{4})(?!\d)/;

function temData(nome: string): boolean {
  const ymd = nome.match(ANO_MES_DIA);
  if (ymd && +ymd[2] >= 1 && +ymd[2] <= 12 && +ymd[3] >= 1 && +ymd[3] <= 31) return true;
  const dmy = nome.match(DIA_MES_ANO);
  return !!dmy && +dmy[1] >= 1 && +dmy[1] <= 31 && +dmy[2] >= 1 && +dmy[2] <= 12;
}

/** Os meses (1–12) que o período cobre. */
function mesesDoPeriodo(dateFrom: string, dateTo: string): Set<number> {
  const meses = new Set<number>();
  const d = new Date(`${dateFrom}T00:00:00Z`);
  const fim = new Date(`${dateTo}T00:00:00Z`);
  d.setUTCDate(1);
  while (d <= fim && meses.size < 12) {
    meses.add(d.getUTCMonth() + 1);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return meses;
}

/** `true` quando o nome indica que a peça não foi feita no período. */
export function nomeIndicaOutroMes(nome: string | null | undefined, dateFrom: string, dateTo: string): boolean {
  if (!nome) return false;
  if (temData(nome)) return true;

  const permitidos = mesesDoPeriodo(dateFrom, dateTo);
  const tokens = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(SEPARADOR);

  return tokens.some((t) => {
    let mes = 0;
    if (/^(0[1-9]|1[0-2])$/.test(t)) mes = +t;
    else if (MESES.includes(t)) mes = MESES.indexOf(t) + 1;
    else if (ABREV.includes(t)) mes = ABREV.indexOf(t) + 1;
    return mes > 0 && !permitidos.has(mes);
  });
}

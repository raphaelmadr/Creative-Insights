/**
 * O link da demanda — na prática, a pasta do Google Drive com as artes.
 *
 * É diferente de um campo de texto com uma URL dentro, e por isso não é um campo
 * definível a mais: todo card tem um, o quadro o mostra na frente e ele abre em
 * uma aba nova com um clique. Era o dado que mais circulava fora da ferramenta —
 * colado no Slack, perdido na conversa — enquanto o card que o pedia ficava sem
 * ele.
 *
 * Módulo puro: o formulário que valida no navegador e a rota que grava precisam
 * concordar sobre o que é um link aceitável. Mesma divisão de `lib/kanban.ts`.
 */

/** Um link não é um texto qualquer: cabe em um campo, não em um parágrafo. */
const MAX_LENGTH = 1000;

/**
 * O link limpo, ou `null` se não der para aceitar.
 *
 * Só `http` e `https`. Um `javascript:` gravado aqui viraria um clique armado no
 * quadro de todo mundo — e este campo existe justamente para ser clicado. Sem
 * esquema, assume `https`: quem copia da barra do navegador às vezes traz só
 * `drive.google.com/...`.
 */
export function normalizeCardLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const texto = raw.trim();
  if (!texto) return null;

  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;

  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;

  return url.toString().slice(0, MAX_LENGTH);
}

export interface CardLinkDescription {
  /** Como o link se anuncia: "Drive", "Figma", ou o domínio. */
  label: string;
  /** O que ele é, quando dá para saber: "pasta", "arquivo", "planilha". */
  detail: string | null;
  isDrive: boolean;
}

const DRIVE_HOSTS = ["drive.google.com", "docs.google.com", "drive.usercontent.google.com"];

/**
 * O que o link é, lido do próprio endereço.
 *
 * Distinguir pasta de arquivo importa na leitura do card: "a pasta das artes" e
 * "um arquivo solto" são pedidos diferentes, e a URL já diz qual é sem custar
 * uma chamada ao Google. Nada é buscado — o nome da pasta exigiria credencial do
 * Drive, que a plataforma não tem e não precisa ter para o link funcionar.
 */
export function describeCardLink(url: string | null | undefined): CardLinkDescription | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  if (DRIVE_HOSTS.includes(host)) {
    const caminho = parsed.pathname;

    const detail = /\/drive\/(u\/\d+\/)?folders\//.test(caminho)
      ? "pasta"
      : /\/file\/d\//.test(caminho)
        ? "arquivo"
        : /\/spreadsheets\//.test(caminho)
          ? "planilha"
          : /\/document\//.test(caminho)
            ? "documento"
            : /\/presentation\//.test(caminho)
              ? "apresentação"
              : null;

    return { label: "Google Drive", detail, isDrive: true };
  }

  return { label: host, detail: null, isDrive: false };
}

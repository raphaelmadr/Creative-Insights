/**
 * A imagem de capa de um artigo de insight.
 *
 * A extração vivia duplicada nas duas rotas de notícias — a manual e a do cron
 * — com o mesmo código e o mesmo limite de 5 segundos. Medido sobre os artigos
 * já salvos, 5 de 14 ficaram sem capa, e os motivos são de naturezas
 * diferentes: um site respondeu devagar e estourou o tempo, outro saiu do ar, e
 * três recusam robôs com 403/400. Só o primeiro caso é recuperável buscando
 * melhor; os demais não têm imagem para buscar, e é por isso que existe uma
 * capa desenhada no lugar — ver `components/ArticleCover.tsx`.
 */

import * as cheerio from "cheerio";

/**
 * 12 segundos, e não 5.
 *
 * Blogs em plataformas como Webflow e WordPress compartilhado respondem em 6 a
 * 9 segundos com frequência. O limite anterior transformava lentidão em
 * "artigo sem imagem", que é indistinguível de um site que realmente não tem.
 */
const FETCH_TIMEOUT_MS = 12000;

/**
 * Cabeçalhos de navegador de verdade.
 *
 * Só o `User-Agent` não basta: parte dos CDNs classifica como robô qualquer
 * requisição sem `Accept` e `Accept-Language` plausíveis. Não contorna bloqueio
 * de quem realmente recusa robôs — nada aqui contorna —, mas evita o falso
 * positivo de quem só checa cabeçalho.
 */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

/**
 * Onde a capa costuma estar, em ordem de confiabilidade.
 *
 * `og:image` é a declaração explícita do autor sobre como o artigo deve
 * aparecer quando compartilhado. Os seguintes são variações do mesmo acordo. A
 * primeira imagem do corpo entra por último e só dentro de `article`/`main`,
 * porque fora desses containers ela costuma ser logo, avatar ou ícone de rede
 * social — imagem que existe, mas não representa o artigo.
 */
const IMAGE_SELECTORS: { selector: string; attr: string }[] = [
  { selector: 'meta[property="og:image:secure_url"]', attr: "content" },
  { selector: 'meta[property="og:image"]', attr: "content" },
  { selector: 'meta[name="twitter:image"]', attr: "content" },
  { selector: 'meta[name="twitter:image:src"]', attr: "content" },
  { selector: 'meta[itemprop="image"]', attr: "content" },
  { selector: 'link[rel="image_src"]', attr: "href" },
  { selector: "article img[src]", attr: "src" },
  { selector: "main img[src]", attr: "src" },
];

/** Imagens que existem mas não representam artigo nenhum. */
const NOISE_PATTERN = /(sprite|icon|logo|avatar|placeholder|pixel|spacer|1x1|blank)\b/i;

function absolutize(candidate: string, pageUrl: string): string | null {
  const value = candidate.trim();
  if (!value || value.startsWith("data:")) return null;

  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return null;
  }
}

export interface ArticleImageResult {
  url: string | null;
  /** Por que falhou, quando falhou — o log precisa distinguir bloqueio de ausência. */
  reason: "ok" | "bloqueado" | "inacessivel" | "sem-imagem";
}

/**
 * A URL da imagem de capa de um artigo, ou o motivo de não haver uma.
 *
 * O motivo importa: "o site recusou o acesso" e "o site não declara imagem" não
 * se resolvem do mesmo jeito, e tratar os dois como `null` foi o que deixou a
 * falha invisível.
 */
export async function extractArticleImage(url: string): Promise<ArticleImageResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return { url: null, reason: "inacessivel" };
  }

  if (!response.ok) {
    // 401/403/429 são recusa deliberada a robôs; o resto é indisponibilidade.
    const blocked = [401, 403, 405, 429].includes(response.status);
    return { url: null, reason: blocked ? "bloqueado" : "inacessivel" };
  }

  let html: string;
  try {
    html = await response.text();
  } catch {
    return { url: null, reason: "inacessivel" };
  }

  const $ = cheerio.load(html);
  const finalUrl = response.url || url;

  for (const { selector, attr } of IMAGE_SELECTORS) {
    const raw = $(selector).first().attr(attr);
    if (!raw) continue;

    const absolute = absolutize(raw, finalUrl);
    if (!absolute) continue;
    if (NOISE_PATTERN.test(absolute)) continue;

    return { url: absolute, reason: "ok" };
  }

  return { url: null, reason: "sem-imagem" };
}

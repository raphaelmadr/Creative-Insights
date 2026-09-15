/**
 * O catálogo da Allu — os produtos que estão de fato disponíveis no site.
 *
 * Vem da API pública do gateway (`/api/public/v1/products/available-catalog`),
 * que é a rota que já responde ao próprio site: nome, categoria, prazo de
 * entrega e o preço de cada plano. Sem autenticação — é o mesmo dado que
 * qualquer visitante vê.
 */

import { logExternalFailure } from "./external-log";

/**
 * Produção, não `dev.`.
 *
 * O ambiente de desenvolvimento devolve 24 produtos, alguns com preço `null`, e
 * não corresponde à loja. Copy é escrita para ir ao ar: preço que não é o do
 * site é preço errado no anúncio.
 */
const GATEWAY = "https://api-gateway.digital.allugator.com";

const CATALOG_URL = `${GATEWAY}/api/public/v1/products/available-catalog`;

/**
 * O catálogo muda em ritmo de dia, não de minuto, e a lista alimenta uma caixa
 * suspensa — bater no gateway a cada abertura da tela é gasto sem ganho. Cache
 * em memória do processo, no mesmo espírito do `modelCache` de `lib/ai.ts`;
 * em serverless ele morre junto com a instância, o que aqui é aceitável: o pior
 * caso é buscar de novo.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { at: number; items: AlluProduct[] } | null = null;

/** O produto como a interface do gerador de copy o consome. */
export interface AlluProduct {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  /** Preço em destaque no site — normalmente o do plano mais longo. */
  price: number | null;
  /** Preço por plano. Nulo quando aquele plano não é oferecido para a peça. */
  price12: number | null;
  price24: number | null;
  price36: number | null;
  /** "Disponível para 12", "Disponível para 12 e 24"… como o site diz. */
  availabilityLabel: string | null;
  deliveryDays: number | null;
  url: string | null;
}

interface RawCatalogItem {
  id?: string;
  slug?: string;
  name?: string;
  category_slug?: string | null;
  available?: boolean;
  paymentlink?: string | null;
  prazo_entrega?: number | null;
  valor_apresentado?: number | null;
  valor_12_meses?: number | null;
  valor_24_meses?: number | null;
  valor_36_meses?: number | null;
  mensagem_disponibilidade?: string | null;
}

const numberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function normalize(raw: RawCatalogItem): AlluProduct | null {
  // Sem nome não há o que mostrar numa caixa suspensa, e sem id não há o que
  // selecionar: um item assim é defeito da origem, e entra na lista como ruído.
  if (!raw.id || !raw.name) return null;

  return {
    id: raw.id,
    slug: raw.slug ?? "",
    name: raw.name,
    category: raw.category_slug ?? null,
    price: numberOrNull(raw.valor_apresentado),
    price12: numberOrNull(raw.valor_12_meses),
    price24: numberOrNull(raw.valor_24_meses),
    price36: numberOrNull(raw.valor_36_meses),
    availabilityLabel: raw.mensagem_disponibilidade ?? null,
    deliveryDays: numberOrNull(raw.prazo_entrega),
    url: raw.paymentlink ?? null,
  };
}

/**
 * O catálogo, do cache ou da origem.
 *
 * `force` ignora o cache — é o botão de recarregar da tela, para quando alguém
 * acabou de publicar um produto e quer vê-lo na lista sem esperar dez minutos.
 */
export async function fetchAlluCatalog(force = false): Promise<AlluProduct[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.items;
  }

  const res = await fetch(CATALOG_URL, {
    headers: { Accept: "application/json" },
    // O gateway é rápido, mas é uma dependência externa numa rota que trava a
    // tela: sem teto, uma origem lenta vira uma tela pendurada.
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });

  if (!res.ok) {
    await logExternalFailure({
      service: "Catálogo Allu",
      operation: "listar produtos disponíveis",
      error: new Error(`HTTP ${res.status}`),
      endpoint: CATALOG_URL,
    });
    throw new Error(`O catálogo da Allu respondeu ${res.status}.`);
  }

  const json = (await res.json()) as { data?: RawCatalogItem[] };
  const items = (json.data ?? [])
    .filter((item) => item.available !== false)
    .map(normalize)
    .filter((p): p is AlluProduct => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  cache = { at: Date.now(), items };
  return items;
}

/** Um produto pelo id, sem uma segunda chamada quando o catálogo está em cache. */
export async function findAlluProduct(id: string): Promise<AlluProduct | null> {
  const items = await fetchAlluCatalog();
  return items.find((p) => p.id === id) ?? null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Os preços do produto em uma linha legível.
 *
 * Vai para o briefing e para o prompt. Todos os planos, e não só o preço em
 * destaque: o plano é uma das alavancas da copy ("a partir de X por mês em 36
 * meses"), e com um número só o modelo não tem como usá-la — ou inventa.
 */
export function describePricing(product: AlluProduct): string {
  const planos = [
    product.price12 !== null ? `12 meses: ${brl(product.price12)}/mês` : null,
    product.price24 !== null ? `24 meses: ${brl(product.price24)}/mês` : null,
    product.price36 !== null ? `36 meses: ${brl(product.price36)}/mês` : null,
  ].filter(Boolean);

  if (!planos.length) {
    return product.price !== null ? `${brl(product.price)}/mês` : "preço não informado";
  }

  return planos.join(" · ");
}

/**
 * Os públicos personalizados da conta de anúncios.
 *
 * Não existem no banco, e é de propósito: a sincronização guarda o que tem
 * histórico diário e custa caro para reler — anúncio, criativo, métrica. Um
 * público é um cadastro pequeno que muda quando alguém cria um, e lê-lo na hora
 * evita uma tabela, uma passada no cron e a chance de mostrar uma lista de
 * ontem para quem criou o público hoje de manhã.
 *
 * O que justifica o cache é a caixa suspensa: a tela do gerador de copy abre
 * várias vezes por sessão e a lista é a mesma.
 */

import prisma from "./prisma";
import { logExternalFailure, redactUrl } from "./external-log";

const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Páginas de 500, com teto de 4 — folga para 2.000 públicos.
 *
 * A conta tem 738 hoje, em duas páginas de 500 e ~2,5s. Com páginas de 100 e
 * teto de 5, a lista parava em 500 e deixava 238 de fora — e o corte seguia a
 * ordem que a Meta devolve, não o tamanho, então um público grande podia
 * simplesmente não aparecer na caixa. O teto continua existindo para uma conta
 * gigante não girar até a cota acabar.
 */
const PAGE_SIZE = 500;
const MAX_PAGES = 4;

let cache: { at: number; items: MetaAudience[] } | null = null;

export interface MetaAudience {
  id: string;
  name: string;
  /** WEBSITE, LOOKALIKE, CUSTOM, ENGAGEMENT, MULTI_DATA, IG_BUSINESS… */
  subtype: string | null;
  description: string | null;
  /** Tamanho aproximado informado pela Meta. Nulo enquanto ela ainda calcula. */
  size: number | null;
}

/** O rótulo em português de cada subtipo, para a tela não mostrar o vocabulário cru. */
export const AUDIENCE_SUBTYPE_LABEL: Record<string, string> = {
  WEBSITE: "Site",
  CUSTOM: "Lista",
  LOOKALIKE: "Semelhante",
  ENGAGEMENT: "Engajamento",
  MULTI_DATA: "Site",
  IG_BUSINESS: "Instagram",
  APP: "Aplicativo",
  OFFLINE_CONVERSION: "Offline",
  VIDEO: "Vídeo",
  CLAIM: "Cadastro",
};

export function audienceSubtypeLabel(subtype: string | null | undefined): string {
  if (!subtype) return "Público";
  return AUDIENCE_SUBTYPE_LABEL[subtype] ?? "Público";
}

interface RawAudience {
  id?: string;
  name?: string;
  subtype?: string;
  description?: string;
  approximate_count_lower_bound?: number;
  operation_status?: { code?: number; description?: string };
}

export async function fetchMetaAudiences(force = false): Promise<MetaAudience[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.items;
  }

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const token = settings?.metaAccessToken;
  const account = settings?.metaAdAccountId;

  if (!token || !account) {
    throw new Error("Credenciais do Meta não configuradas.");
  }

  // A conta é gravada ora com o prefixo, ora sem — o resto do projeto trata
  // isso no ponto de uso, e aqui não seria diferente.
  const accountId = account.startsWith("act_") ? account : `act_${account}`;

  const items: MetaAudience[] = [];
  let url: string | null =
    `https://graph.facebook.com/v19.0/${accountId}/customaudiences` +
    `?fields=id,name,subtype,description,approximate_count_lower_bound,operation_status` +
    `&limit=${PAGE_SIZE}&access_token=${token}`;

  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res: Response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const json: { data?: RawAudience[]; paging?: { next?: string }; error?: { message?: string; code?: number } } =
      await res.json();

    if (json.error) {
      await logExternalFailure({
        service: "Meta Ads",
        operation: "listar públicos personalizados",
        error: new Error(json.error.message || "erro sem mensagem"),
        endpoint: redactUrl(url),
      });
      throw new Error(json.error.message || "A Meta recusou a consulta de públicos.");
    }

    for (const raw of json.data ?? []) {
      if (!raw.id || !raw.name) continue;
      items.push({
        id: raw.id,
        name: raw.name,
        subtype: raw.subtype ?? null,
        description: raw.description ?? null,
        size:
          typeof raw.approximate_count_lower_bound === "number" &&
          raw.approximate_count_lower_bound >= 0
            ? raw.approximate_count_lower_bound
            : null,
      });
    }

    url = json.paging?.next ?? null;
    pages += 1;
  }

  /*
   * Ordenado pelo tamanho, do maior para o menor.
   *
   * Por nome, a lista abre em colchete — a convenção da conta prefixa tudo com
   * `[SITE]`, `[CRM]`, `[26]` — e as primeiras vinte entradas são variações de
   * janela do mesmo público. Por tamanho, o que aparece primeiro é o que de
   * fato tem alcance para uma campanha.
   */
  items.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));

  cache = { at: Date.now(), items };
  return items;
}

/** Um público pelo id, aproveitando o cache. */
export async function findMetaAudience(id: string): Promise<MetaAudience | null> {
  const items = await fetchMetaAudiences();
  return items.find((a) => a.id === id) ?? null;
}

/**
 * O público em uma linha, para o briefing e para o prompt.
 *
 * O nome do público é a descrição real da segmentação nesta conta — `[SITE]
 * [VIEW CONTENT - IPHONE 17] [30D]` diz quem é a pessoa e há quanto tempo ela
 * demonstrou interesse. É mais específico do que qualquer descrição que alguém
 * fosse digitar na pressa.
 */
export function describeAudience(audience: MetaAudience): string {
  const partes = [audience.name];

  const tipo = audienceSubtypeLabel(audience.subtype);
  if (tipo !== "Público") partes.push(`tipo: ${tipo}`);

  if (audience.size !== null) {
    partes.push(`alcance aproximado: ${audience.size.toLocaleString("pt-BR")} pessoas`);
  }
  if (audience.description) partes.push(audience.description);

  return partes.join(" · ");
}

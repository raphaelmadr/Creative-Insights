/**
 * Vinculação de criativos a criadores a partir da sigla no nome do anúncio.
 *
 * Fonte única da verdade — antes essa regra estava duplicada (com variações
 * sutis e incompatíveis) em meta-sync, tiktok-sync, meta-sync-sql e
 * app/api/meta-ads/route.ts.
 */

import prisma from "./prisma";

/**
 * Siglas que existem apenas como rótulo de "sem atribuição" e nunca devem ser
 * casadas contra o nome de um anúncio.
 */
const RESERVED_ACRONYMS = new Set(["UNKNOWN"]);

export interface AcronymAlias {
  /** Sigla como aparece (ou pode aparecer) no nome do anúncio. */
  alias: string;
  /** Sigla canônica do criador — é isto que é gravado em AdCreative.designer. */
  canonical: string;
  /**
   * 0 = criador real; 1 = balde de fallback (o criador que também responde por
   * "UNKNOWN"). Um criador real sempre vence o balde, independente da posição.
   *
   * Sem isso, peças como "VD_allu_ads_influenciadores_Nando Viana-ez" seriam
   * atribuídas a INFLUENCIADORES só porque a palavra aparece antes no nome,
   * quando a assinatura do designer ("ez") está no fim — que é a convenção
   * de nomenclatura usada pelo time.
   */
  priority: 0 | 1;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Monta o índice de siglas a partir dos criadores cadastrados.
 *
 * - `acronym` aceita múltiplas siglas separadas por vírgula ("RM, RAPHAELMADUREIRA").
 * - A canônica é a primeira sigla NÃO reservada; todas as outras apontam para ela,
 *   de modo que um nome contendo "raphaelmadureira" ainda grave "RM".
 * - Um criador cujas siglas sejam todas reservadas não entra no índice.
 * - Ordenado por comprimento decrescente para que o match seja determinístico e
 *   prefira sempre a sigla mais específica.
 */
export function buildAliasIndex(creators: { acronym: string }[]): AcronymAlias[] {
  const aliases: AcronymAlias[] = [];
  const seen = new Set<string>();

  for (const creator of creators) {
    const tokens = (creator.acronym || "")
      .split(",")
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean);

    const canonical = tokens.find((token) => !RESERVED_ACRONYMS.has(token));
    if (!canonical) continue;

    // Um criador que declara UNKNOWN entre suas siglas é o balde de fallback.
    const priority: 0 | 1 = tokens.some((token) => RESERVED_ACRONYMS.has(token)) ? 1 : 0;

    for (const token of tokens) {
      if (RESERVED_ACRONYMS.has(token)) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      aliases.push({ alias: token, canonical, priority });
    }
  }

  aliases.sort(
    (a, b) =>
      a.priority - b.priority ||
      b.alias.length - a.alias.length ||
      a.alias.localeCompare(b.alias)
  );

  return aliases;
}

/**
 * Regra de fronteira da sigla.
 *
 * Antes: `(^|[-_ .])SIGLA(?:[-._ ]|\b|$)`. Dois problemas —
 *  1. `\b` não cria fronteira entre letra e dígito, então "ads-rm2-v1" não casava;
 *  2. a versão do TikTok não aceitava "." como separador à esquerda.
 *
 * Agora: qualquer caractere não alfanumérico (ou início da string) antes, e
 * nenhuma letra depois. Dígitos à direita são permitidos ("rm2" é RM), mas
 * letras não — o que mantém "crm", "whatsapp", "performance" e "jumpphone"
 * corretamente fora do match.
 */
function aliasPattern(alias: string): RegExp {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(alias.toLowerCase())}(?![a-z])`, "i");
}

/**
 * Resolve a sigla canônica do criador para um nome de anúncio.
 *
 * Critérios de desempate, nesta ordem:
 *  1. criador real vence o balde de fallback;
 *  2. entre criadores reais, vence a sigla que aparece primeiro no nome;
 *  3. na mesma posição, vence a sigla mais longa.
 *
 * Assim o resultado não depende da ordem em que os criadores voltam do banco.
 */
export function resolveDesigner(
  adName: string | null | undefined,
  aliases: AcronymAlias[]
): string | null {
  if (!adName) return null;

  const haystack = adName.toLowerCase();

  let best: { canonical: string; index: number; length: number; priority: number } | null = null;

  for (const { alias, canonical, priority } of aliases) {
    const match = aliasPattern(alias).exec(haystack);
    if (!match) continue;

    // match.index aponta para o separador; a sigla começa logo depois (exceto no início da string).
    const index = match.index + (match[0].length - alias.length);

    const wins =
      !best ||
      priority < best.priority ||
      (priority === best.priority &&
        (index < best.index || (index === best.index && alias.length > best.length)));

    if (wins) best = { canonical, index, length: alias.length, priority };
  }

  return best ? best.canonical : null;
}

/** Carrega os criadores do banco e devolve o índice de siglas pronto para uso. */
export async function loadAliasIndex(): Promise<AcronymAlias[]> {
  const creators = await prisma.creator.findMany({ select: { acronym: true } });
  return buildAliasIndex(creators);
}

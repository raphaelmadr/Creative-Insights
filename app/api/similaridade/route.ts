import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hasDistributionToExplain } from "@/lib/similarity";
import { buildFinding } from "@/lib/similarity-findings";
import { matchCategory, resolveCategories } from "@/lib/creative-categories";
import { EMPTY_TOTALS, type CreativeTotals } from "@/lib/creative-metrics";

/**
 * As tags de um nome de anúncio, sem repetição.
 *
 * O `Set` é o ponto: sem ele, `..._interno_..._interno_...` rendia a mesma tag
 * duas vezes, e o limite de "3 tags em comum" podia ser satisfeito por UM token
 * repetido. Grupos de 12 peças se formavam sobre `interno, interno` — o limite
 * não media o que dizia medir.
 */
function extractTags(name: string): string[] {
  if (!name) return [];
  // Divide por _, -, |, . ou múltiplos espaços, e limpa
  // Espaço e travessão entram nos separadores: sem eles, `arquivo.png — Cópia`
  // virava o token `png — cópia`, que nenhuma lista de formato reconhece.
  const tokens = name
    .split(/[_\\-|\\.\\s\u2013\u2014]+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 2);
  return Array.from(new Set(tokens));
}

/**
 * Tokens de formato, mídia, praça e versão — nunca descrevem o CONCEITO da peça.
 *
 * Ficam numa lista fixa, e não no corte por frequência, porque num período
 * curto a piscina é pequena e um `mp4` pode aparecer em poucas peças — aí ele
 * passaria o corte e voltaria a colar criativos que só têm a extensão em comum.
 */
const FORMAT_TOKENS = new Set([
  "img", "vid", "video", "vídeo", "crs", "car", "carrossel",
  "mp4", "mov", "png", "jpg", "jpeg", "gif", "webp", "psd",
  "feed", "stories", "story", "reels", "reel",
  "copy", "copia", "cópia", "final", "novo", "nova", "teste", "test",
  "peca", "peça", "pecas", "peças",
]);

/** Versão, sequência, data: `v01`, `#001`, `h1`, `ad1`, `2025`, `1peça`. */
const SEQUENCE_TOKEN = /^(?:#?\d+|v\d+|h\d+|ad\d+|20\d{2}|\d+pe[çc]as?)$/i;

/** Abaixo disso a frequência não é evidência de nada — a piscina é pequena. */
const MIN_POOL_FOR_FREQUENCY_CUT = 30;

/** Um token presente em mais peças que isto não distingue peça alguma. */
const GENERIC_TOKEN_SHARE = 0.2;

/**
 * Os tokens que não servem para agrupar, derivados da própria piscina.
 *
 * O agrupamento por taxonomia juntava 130 peças e R$ 257 mil porque bastavam 3
 * tags iguais quaisquer — e `allu` (74% das peças), `ads` (75%), `perene` (44%)
 * e `v01` (40%) são convenção de nomenclatura do time, presentes em quase todo
 * nome. Um grupo formado por elas não é concorrência, é coincidência.
 *
 * Derivar da piscina em vez de fixar a lista mantém a regra viva: quando o time
 * mudar a convenção, o corte acompanha sem ninguém editar código.
 */
function buildStopTokens(pool: { tags: string[] }[]): Set<string> {
  const stop = new Set<string>();

  if (pool.length < MIN_POOL_FOR_FREQUENCY_CUT) return stop;

  const documentFrequency = new Map<string, number>();
  for (const item of pool) {
    for (const tag of new Set(item.tags)) {
      documentFrequency.set(tag, (documentFrequency.get(tag) || 0) + 1);
    }
  }

  for (const [tag, count] of documentFrequency) {
    if (count / pool.length > GENERIC_TOKEN_SHARE) stop.add(tag);
  }

  return stop;
}

/** As tags que de fato descrevem a peça: sem formato, versão nem genéricos. */
function meaningfulTags(tags: string[], stopTokens: Set<string>): string[] {
  return tags.filter(
    tag => !FORMAT_TOKENS.has(tag) && !SEQUENCE_TOKEN.test(tag) && !stopTokens.has(tag)
  );
}

// Verifica se há intersecção significativa de tags (ex: compartilham a mesma estrutura principal)
function getSharedTags(tags1: string[], tags2: string[]): string[] {
  return tags1.filter(t => tags2.includes(t));
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");

    const dateFrom = dateFromParam ? new Date(dateFromParam) : (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 7);
      return d;
    })();
    
    const dateTo = dateToParam ? new Date(dateToParam) : new Date();

    // Ensure the date filter is inclusive for the full day
    dateTo.setUTCHours(23, 59, 59, 999);
    dateFrom.setUTCHours(0, 0, 0, 0);

    // Buscar criativos com suas métricas do período selecionado
    const ads = await prisma.adCreative.findMany({
      where: {
        status: "ACTIVE"
      },
      include: {
        metrics: {
          where: { 
            date: { 
              gte: dateFrom,
              lte: dateTo
            } 
          }
        }
      }
    });

    /*
     * Categoria da peça (Winners, Testando...): decidida pelos ACUMULADOS de
     * veiculação, sem recorte de data, exatamente como a home decide. Usar os
     * números do período faria a mesma peça trocar de categoria entre as duas
     * telas só porque aqui existe um filtro de datas.
     */
    const settingsForCategories = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { creativeCategories: true },
    });
    const categories = resolveCategories(settingsForCategories?.creativeCategories);

    const lifetime = await prisma.adDailyMetrics.groupBy({
      by: ["adCreativeId"],
      where: {
        adCreativeId: { in: ads.map(a => a.id) },
        OR: [{ impressions: { gt: 0 } }, { spend: { gt: 0 } }],
      },
      _sum: {
        spend: true, impressions: true, clicks: true,
        riskApprovedValue: true, grossValue: true, purchases: true, netOrders: true,
      },
    });

    const lifetimeByAd = new Map<string, CreativeTotals>();
    for (const row of lifetime) {
      lifetimeByAd.set(row.adCreativeId, {
        spend: row._sum.spend ?? 0,
        impressions: row._sum.impressions ?? 0,
        clicks: row._sum.clicks ?? 0,
        riskApprovedValue: row._sum.riskApprovedValue ?? 0,
        grossValue: row._sum.grossValue ?? 0,
        purchases: row._sum.purchases ?? 0,
        netOrders: row._sum.netOrders ?? 0,
      });
    }

    // Calcular as métricas agregadas de cada anúncio (Agrupando por nome para evitar triplicações do exato mesmo criativo em campanhas diferentes)
    const uniqueAdsMap = new Map<string, any>();
    
    for (const ad of ads) {
      const spend = ad.metrics.reduce((acc, curr) => acc + curr.spend, 0);
      const grossValue = ad.metrics.reduce((acc, curr) => acc + curr.grossValue, 0);
      const impressions = ad.metrics.reduce((acc, curr) => acc + curr.impressions, 0);
      const clicks = ad.metrics.reduce((acc, curr) => acc + curr.clicks, 0);
      const purchases = ad.metrics.reduce((acc, curr) => acc + curr.purchases, 0);
      const reach = ad.metrics.reduce((acc, curr) => acc + (curr.reach || 0), 0);
      const frequency = reach > 0 ? impressions / reach : 0;
      
      
      if (spend < 200) continue;
      
      const groupKey = ad.id;
      
      if (uniqueAdsMap.has(groupKey)) {
        // Soma as métricas do mesmo criativo rodando em múltiplos lugares
        const existing = uniqueAdsMap.get(groupKey);
        existing.spend += spend;
        existing.grossValue += grossValue;
        existing.impressions += impressions;
        existing.clicks += clicks;
        existing.purchases += purchases;
        existing.reach += reach;
        existing.frequency = existing.reach > 0 ? existing.impressions / existing.reach : 0;
        existing.roas = existing.spend > 0 ? existing.grossValue / existing.spend : 0;
        existing.ctr = existing.impressions > 0 ? (existing.clicks / existing.impressions) * 100 : 0;
        existing.cpm = existing.impressions > 0 ? (existing.spend / existing.impressions) * 1000 : 0;
        existing.campaignName = "Várias campanhas (Multi-AdSet)";
      } else {
        const category = matchCategory(
          lifetimeByAd.get(ad.id) ?? EMPTY_TOTALS,
          ad.platform,
          categories
        );

        uniqueAdsMap.set(groupKey, {
          id: ad.id,
          adName: ad.adName,
          campaignName: ad.campaignName,
          designer: ad.designer,
          platform: (ad.platform || "META").toUpperCase(),
          mediaType: ad.mediaType,
          videoUrl: ad.videoUrl,
          categoryName: category?.name ?? null,
          categoryColor: category?.color ?? null,
          categoryIndex: category?.index ?? null,
          imageUrl: ad.imageUrl || ad.thumbnailUrl,
          tags: extractTags(ad.adName),
          spend,
          grossValue,
          impressions,
          clicks,
          purchases,
          reach,
          frequency,
          roas: spend > 0 ? grossValue / spend : 0,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0
        });
      }
    }
    
    const aggregatedAds = Array.from(uniqueAdsMap.values());

    /*
     * As tags de cada peça, reduzidas ao que descreve o conceito.
     *
     * `tags` continua sendo o que o passe de taxonomia compara; o cru fica em
     * `rawTags` para quem precisar depurar por que duas peças caíram juntas.
     */
    const stopTokens = buildStopTokens(aggregatedAds);
    for (const ad of aggregatedAds) {
      ad.rawTags = ad.tags;
      ad.tags = meaningfulTags(ad.tags, stopTokens);
    }

    const groups: Array<{ 
      reason: string, 
      sharedTags: string[], 
      platform: string,
      totalSpend: number,
      cannibalizationRate: number,
      isCannibalized: boolean,
      creatives: typeof aggregatedAds 
    }> = [];
    
    const groupedIds = new Set<string>();

    /*
     * Pass 1: Agrupar por Mesma Imagem — dentro da plataforma.
     *
     * Um anúncio do Meta e um do TikTok não disputam a mesma verba, e cada
     * plataforma decide a entrega com um algoritmo próprio. Agrupá-los junto
     * produzia "concorrência" entre peças que nunca concorreram, e uma análise
     * que não sabe de qual algoritmo está falando. A chave leva a plataforma.
     */
    const imageGroups = new Map<string, typeof aggregatedAds>();
    for (const ad of aggregatedAds) {
      if (!ad.imageUrl || ad.imageUrl.trim() === "") continue;
      const key = `${ad.platform}::${ad.imageUrl}`;
      if (!imageGroups.has(key)) {
        imageGroups.set(key, []);
      }
      imageGroups.get(key)!.push(ad);
    }

    for (const [, adsList] of Array.from(imageGroups.entries())) {
      if (adsList.length > 1) {
        adsList.forEach(a => groupedIds.add(a.id));
        
        const totalSpend = adsList.reduce((acc, curr) => acc + curr.spend, 0);
        const maxSpend = Math.max(...adsList.map(a => a.spend));
        const cannibalizationRate = totalSpend > 0 ? (maxSpend / totalSpend) : 0;
        
        groups.push({
          reason: "Imagens Idênticas",
          sharedTags: [],
          platform: adsList[0].platform,
          totalSpend,
          cannibalizationRate,
          isCannibalized: cannibalizationRate > 0.75, // 75% da verba em 1 só
          creatives: adsList.sort((a, b) => b.spend - a.spend) // Vencedor primeiro
        });
      }
    }

    // Pass 2: Agrupar por Taxonomia (Tags Nomenclatura)
    const remainingAds = aggregatedAds.filter(a => !groupedIds.has(a.id));
    for (let i = 0; i < remainingAds.length; i++) {
      if (groupedIds.has(remainingAds[i].id)) continue;
      
      const currentGroup = [remainingAds[i]];
      let currentSharedTags = remainingAds[i].tags;

      for (let j = i + 1; j < remainingAds.length; j++) {
        if (groupedIds.has(remainingAds[j].id)) continue;
        
        // Mesma razão do passe 1: taxonomia parecida entre canais diferentes não
        // é concorrência, é coincidência de nomenclatura.
        if (remainingAds[j].platform !== remainingAds[i].platform) continue;

        const intersection = getSharedTags(remainingAds[i].tags, remainingAds[j].tags);
        
        // Se compartilham pelo menos 2 a 3 tags importantes (conceito/ângulo), são parecidos
        if (intersection.length >= 3) {
          currentGroup.push(remainingAds[j]);
          groupedIds.add(remainingAds[j].id);
          currentSharedTags = getSharedTags(currentSharedTags, intersection);
        }
      }

      if (currentGroup.length > 1) {
        currentGroup.forEach(a => groupedIds.add(a.id));
        const totalSpend = currentGroup.reduce((acc, curr) => acc + curr.spend, 0);
        const maxSpend = Math.max(...currentGroup.map(a => a.spend));
        const cannibalizationRate = totalSpend > 0 ? (maxSpend / totalSpend) : 0;
        
        groups.push({
          reason: "Conceitos Semelhantes",
          sharedTags: currentSharedTags,
          platform: currentGroup[0].platform,
          totalSpend,
          cannibalizationRate,
          isCannibalized: cannibalizationRate > 0.75,
          creatives: currentGroup.sort((a, b) => b.spend - a.spend) // Vencedor primeiro
        });
      }
    }

    /*
     * Grupo sem disputa a explicar não é exibido.
     *
     * A análise olha as peças que concentraram a verba; quando o grupo tem
     * menos de duas dessas, não houve distribuição entre concorrentes — é uma
     * peça sozinha com uma cauda que o algoritmo não entregou, ou um grupo que
     * a taxonomia juntou por coincidência de nomenclatura. Sem nada a analisar,
     * exibir só ocupa a leitura da equipe.
     */
    const analyzableGroups = groups.filter(group => hasDistributionToExplain(group.creatives));

    /*
     * O achado de cada grupo: o diagnóstico, o porquê e a ação, calculados dos
     * números. É o que a página passou a exibir — antes ela listava grupos
     * rotulados pelo sintoma ("Concorrência Alta") e deixava a equipe inferir
     * o que estava acontecendo e o que fazer.
     */
    const withFindings = analyzableGroups.map(group => ({
      ...group,
      finding: buildFinding(group),
    }));

    /*
     * Ordem por dinheiro em jogo, não por gasto total do grupo.
     *
     * Ordenar por `isCannibalized` primeiro empurrava para o topo os sete
     * grupos de imagem idêntica — todos do TikTok, todos com 80% a 89% de
     * concentração — e os grupos do Meta caíam abaixo da primeira tela, dando a
     * impressão de que a página só puxava um canal. O que decide a ordem agora
     * é a verba fragmentada: quanto está espalhado entre peças concorrentes.
     */
    withFindings.sort((a, b) => {
      const urgencyA = a.finding?.urgent ? 1 : 0;
      const urgencyB = b.finding?.urgent ? 1 : 0;
      if (urgencyA !== urgencyB) return urgencyB - urgencyA;
      return (b.finding?.fragmentedSpend ?? 0) - (a.finding?.fragmentedSpend ?? 0);
    });

    // AI Insight is no longer fetched automatically
    withFindings.forEach((group: any) => {
      group.aiInsight = ""; // Will be fetched on demand
    });

    return NextResponse.json({ success: true, groups: withFindings });
  } catch (error: any) {
    console.error("Erro em Similaridade API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

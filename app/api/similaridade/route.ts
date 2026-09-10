import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hasDistributionToExplain } from "@/lib/similarity";
import { matchCategory, resolveCategories } from "@/lib/creative-categories";
import { EMPTY_TOTALS, type CreativeTotals } from "@/lib/creative-metrics";

// Quebra o nome em tags usando delimitadores comuns
function extractTags(name: string): string[] {
  if (!name) return [];
  // Divide por _, -, |, . ou múltiplos espaços, e limpa
  return name.split(/[_\\-|\\.]+/).map(t => t.trim().toLowerCase()).filter(t => t.length > 2);
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

    // Ordenar os grupos pelo gasto total do grupo e por quem tem canibalização ativa
    analyzableGroups.sort((a, b) => {
      if (a.isCannibalized && !b.isCannibalized) return -1;
      if (!a.isCannibalized && b.isCannibalized) return 1;
      return b.totalSpend - a.totalSpend;
    });

    // AI Insight is no longer fetched automatically
    analyzableGroups.forEach((group: any) => {
      group.aiInsight = ""; // Will be fetched on demand
    });

    return NextResponse.json({ success: true, groups: analyzableGroups });
  } catch (error: any) {
    console.error("Erro em Similaridade API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

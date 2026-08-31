import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
      
      if (uniqueAdsMap.has(ad.adName)) {
        // Soma as métricas do mesmo criativo rodando em múltiplos lugares
        const existing = uniqueAdsMap.get(ad.adName);
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
        uniqueAdsMap.set(ad.adName, {
          id: ad.id,
          adName: ad.adName,
          campaignName: ad.campaignName,
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
      totalSpend: number,
      cannibalizationRate: number,
      isCannibalized: boolean,
      creatives: typeof aggregatedAds 
    }> = [];
    
    const groupedIds = new Set<string>();

    // Pass 1: Agrupar por Mesma Imagem
    const imageGroups = new Map<string, typeof aggregatedAds>();
    for (const ad of aggregatedAds) {
      if (!ad.imageUrl || ad.imageUrl.trim() === "") continue;
      if (!imageGroups.has(ad.imageUrl)) {
        imageGroups.set(ad.imageUrl, []);
      }
      imageGroups.get(ad.imageUrl)!.push(ad);
    }

    for (const [img, adsList] of Array.from(imageGroups.entries())) {
      if (adsList.length > 1) {
        adsList.forEach(a => groupedIds.add(a.id));
        
        const totalSpend = adsList.reduce((acc, curr) => acc + curr.spend, 0);
        const maxSpend = Math.max(...adsList.map(a => a.spend));
        const cannibalizationRate = totalSpend > 0 ? (maxSpend / totalSpend) : 0;
        
        groups.push({
          reason: "Imagens Idênticas",
          sharedTags: [],
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
          totalSpend,
          cannibalizationRate,
          isCannibalized: cannibalizationRate > 0.75,
          creatives: currentGroup.sort((a, b) => b.spend - a.spend) // Vencedor primeiro
        });
      }
    }

    // Ordenar os grupos pelo gasto total do grupo e por quem tem canibalização ativa
    groups.sort((a, b) => {
      if (a.isCannibalized && !b.isCannibalized) return -1;
      if (!a.isCannibalized && b.isCannibalized) return 1;
      return b.totalSpend - a.totalSpend;
    });

    // AI Insight is no longer fetched automatically
    groups.forEach((group: any) => {
      group.aiInsight = ""; // Will be fetched on demand
    });

    return NextResponse.json({ success: true, groups });
  } catch (error: any) {
    console.error("Erro em Similaridade API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

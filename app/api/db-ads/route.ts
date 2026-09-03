import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const DEFAULT_CATEGORIES = [
  {
    id: "cat_super_winners",
    name: "Super Winners",
    color: "var(--success)",
    rules: {
      META: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
      TIKTOK: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
      GOOGLE: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
    }
  },
  {
    id: "cat_winners",
    name: "Winners",
    color: "var(--primary)",
    rules: {
      META: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
      TIKTOK: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
      GOOGLE: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
    }
  }
];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const statusParam = url.searchParams.get("status") || "ACTIVE";

    if (!fromParam || !toParam) {
      return NextResponse.json({ success: false, error: "Parâmetros 'from' e 'to' (YYYY-MM-DD) são obrigatórios" }, { status: 400 });
    }

    const startDate = new Date(`${fromParam}T00:00:00Z`);
    const endDate = new Date(`${toParam}T23:59:59.999Z`);

    // Define the status filter dynamically based on the toggle
    const statusFilter = statusParam === "ALL"
      ? undefined
      : statusParam === "INACTIVE"
        ? { notIn: ["ACTIVE", "ENABLE"] }
        : { in: ["ACTIVE", "ENABLE"] };

    const ads = await prisma.adCreative.findMany({
      where: {
        ...(statusFilter !== undefined && { status: statusFilter }),
        metrics: { some: { date: { gte: startDate, lte: endDate } } }
      },
      include: {
        metrics: {
          where: { date: { gte: startDate, lte: endDate } }
        }
      }
    });

    let settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    
    let categories: any[] = [];
    if (settings?.creativeCategories) {
      try {
        categories = JSON.parse(settings.creativeCategories);
      } catch (e) {
        categories = DEFAULT_CATEGORIES;
      }
    } else {
      categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      if (settings) {
        categories[0].rules.META.minSpend = settings.superWinnerSpend ?? 1000;
        categories[0].rules.META.minReturn = settings.superWinnerReturn ?? 5000;
        categories[0].rules.META.maxCpa = settings.superWinnerCpa ?? 50;
        categories[1].rules.META.minSpend = settings.winnerSpend ?? 500;
        categories[1].rules.META.minReturn = settings.winnerReturn ?? 2000;
        categories[1].rules.META.maxCpa = settings.winnerCpa ?? 60;
      }
    }

    const categorizedAds = categories.map(cat => ({ ...cat, ads: [] as any[] }));
    const testes: Record<string, any[]> = {};
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalRiskApprovedValue = 0;
    let totalGrossValue = 0;

    const aggregatedAds = new Map<string, any>();
    const originalAdsByCreative = new Map<string, any[]>();

    for (const ad of ads) {
      if (ad.metrics.length === 0) continue;

      let spend = 0;
      let impressions = 0;
      let clicks = 0;
      let riskApprovedValue = 0;
      let grossValue = 0;
      let purchases = 0;
      let netOrders = 0;

      for (const m of ad.metrics) {
        spend += m.spend;
        impressions += m.impressions || 0;
        clicks += m.clicks || 0;
        riskApprovedValue += m.riskApprovedValue || 0;
        grossValue += m.grossValue || 0;
        purchases += m.purchases || 0;
        netOrders += m.netOrders || 0;
      }

      if (spend === 0 && grossValue === 0 && riskApprovedValue === 0) continue;

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalRiskApprovedValue += riskApprovedValue;
      totalGrossValue += grossValue;

      const groupKey = ad.id;

      if (!aggregatedAds.has(groupKey)) {
        aggregatedAds.set(groupKey, {
          id: ad.id,
          ad_name: ad.adName,
          designer: ad.designer,
          image_url: ad.imageUrl,
          thumbnail_url: ad.thumbnailUrl,
          videoUrl: ad.videoUrl,
          mediaType: ad.mediaType,
          publisherPlatforms: ad.publisherPlatforms,
          platform: ad.platform,
          createdTime: ad.createdTime,
          spend, impressions, clicks, riskApprovedValue, grossValue, netOrders, purchases
        });
        originalAdsByCreative.set(groupKey, []);
      } else {
        const agg = aggregatedAds.get(groupKey);
        agg.spend += spend;
        agg.impressions += impressions;
        agg.clicks += clicks;
        agg.riskApprovedValue += riskApprovedValue;
        agg.grossValue += grossValue;
        agg.netOrders += netOrders;
        agg.purchases += purchases;
      }

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpa = netOrders > 0 ? (spend / netOrders) : spend;

      originalAdsByCreative.get(groupKey)!.push({
        adsetName: ad.adsetName,
        individualData: {
          id: ad.id,
          ad_name: ad.adName,
          designer: ad.designer,
          image_url: ad.imageUrl,
          thumbnail_url: ad.thumbnailUrl,
          videoUrl: ad.videoUrl,
          mediaType: ad.mediaType,
          publisherPlatforms: ad.publisherPlatforms,
          platform: ad.platform,
          createdTime: ad.createdTime,
          spend: spend.toFixed(2),
          ctr: ctr.toFixed(2),
          riskApprovedValue: riskApprovedValue.toFixed(2),
          grossValue: grossValue.toFixed(2),
          cpa: cpa.toFixed(2),
          netOrders,
          impressions,
          clicks,
        }
      });
    }

    for (const [groupKey, agg] of aggregatedAds.entries()) {
      const cpa = agg.netOrders > 0 ? (agg.spend / agg.netOrders) : agg.spend;
      const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
      
      const creativePlatform = (agg.platform || "META").toUpperCase();

      let matchedCategoryIndex = -1;

      for (let i = 0; i < categories.length; i++) {
        const catRules = categories[i].rules[creativePlatform] || categories[i].rules["META"]; // fallback
        
        const MIN_SPEND = catRules.minSpend || 0;
        const MIN_RETURN = catRules.minReturn || 0;
        const MAX_CPA = catRules.maxCpa || 0;

        const isMatch = 
          (MIN_SPEND === 0 || agg.spend >= MIN_SPEND) &&
          (MIN_RETURN === 0 || agg.riskApprovedValue >= MIN_RETURN) &&
          (MAX_CPA === 0 || cpa <= MAX_CPA);

        if (isMatch) {
          matchedCategoryIndex = i;
          break; // Stop at first match (priority)
        }
      }

      if (matchedCategoryIndex !== -1) {
        const creativeData = {
          ...agg,
          spend: agg.spend.toFixed(2),
          ctr: ctr.toFixed(2),
          riskApprovedValue: agg.riskApprovedValue.toFixed(2),
          grossValue: agg.grossValue.toFixed(2),
          cpa: cpa.toFixed(2)
        };
        categorizedAds[matchedCategoryIndex].ads.push(creativeData);
      } else {
        const individuals = originalAdsByCreative.get(groupKey)!;
        for (const ind of individuals) {
          const set = ind.adsetName || "Outros";
          if (!testes[set]) testes[set] = [];
          testes[set].push(ind.individualData);
        }
      }
    }

    // Sort: do maior para o menor valor aprovado (resultado real), com gasto como desempate
    const byResultDesc = (a: any, b: any) =>
      parseFloat(b.riskApprovedValue) - parseFloat(a.riskApprovedValue) || parseFloat(b.spend) - parseFloat(a.spend);
    
    categorizedAds.forEach(cat => cat.ads.sort(byResultDesc));
    Object.keys(testes).forEach(k => testes[k].sort(byResultDesc));

    const globalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        categorizedAds,
        testes,
        metrics: {
          totalSpend: totalSpend.toFixed(2),
          avgCtr: globalCtr.toFixed(2),
          totalRiskApprovedValue: totalRiskApprovedValue.toFixed(2),
          totalGrossValue: totalGrossValue.toFixed(2),
        }
      }
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

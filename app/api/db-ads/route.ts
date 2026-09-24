import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ACTIVE_AD_STATUSES } from "@/lib/ad-status";
import { activeConversionDescriptor } from "@/lib/meta-conversions";
import {
  calculateCpa,
  calculateCtr,
  EMPTY_TOTALS,
  type CreativeTotals,
} from "@/lib/creative-metrics";
import { loadCategories, matchCategoryIndex } from "@/lib/creative-categories";

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
        ? { notIn: ACTIVE_AD_STATUSES }
        : { in: ACTIVE_AD_STATUSES };

    /**
     * O período seleciona QUAIS criativos entram na lista — os que tiveram
     * veiculação nele. Os valores exibidos, porém, são o acumulado de todo o
     * período em que o anúncio esteve no ar, conforme a regra do negócio.
     */
    const ads = await prisma.adCreative.findMany({
      where: {
        ...(statusFilter !== undefined && { status: statusFilter }),
        metrics: { some: { date: { gte: startDate, lte: endDate } } }
      },
      select: {
        id: true, adName: true, adsetName: true, campaignName: true, designer: true,
        imageUrl: true, thumbnailUrl: true, videoUrl: true, mediaType: true,
        publisherPlatforms: true, platform: true, createdTime: true, status: true,
        // Só a data: o texto da análise é grande e o cartão só precisa saber
        // que existe uma salva — ele a busca em `/api/hypothesis` ao abrir.
        aiAnalyzedAt: true,
      },
    });

    /**
     * Totais de veiculação, sem recorte de data.
     *
     * Só entram dias em que o anúncio de fato rodou (teve impressão ou gasto);
     * linhas zeradas não deslocam a data de estreia.
     */
    /*
     * Os dois recortes e a configuração saem JUNTOS.
     *
     * Nenhum depende do resultado do outro — os dois agrupam a mesma lista de
     * anúncios, e a configuração não depende de nada. Em fila eram três esperas
     * somadas na rota mais pesada do painel; lado a lado, é a maior delas.
     */
    const ids = ads.map(ad => ad.id);
    const [lifetime, period, settingsRow] = await Promise.all([
      prisma.adDailyMetrics.groupBy({
      by: ["adCreativeId"],
      where: {
        adCreativeId: { in: ids },
        OR: [{ impressions: { gt: 0 } }, { spend: { gt: 0 } }],
      },
      _sum: {
        spend: true, impressions: true, clicks: true,
        riskApprovedValue: true, grossValue: true, purchases: true, netOrders: true,
      },
      _min: { date: true },
      _max: { date: true },
      }),

      /*
       * Segundo recorte: apenas o período selecionado.
       *
       * Os KPIs do topo comparam contra a META DO MÊS, então precisam do valor
       * do período — não do acumulado de veiculação, que é o que vai nos cards.
       */
      prisma.adDailyMetrics.groupBy({
        by: ["adCreativeId"],
        where: {
          adCreativeId: { in: ids },
          date: { gte: startDate, lte: endDate },
        },
        _sum: {
          spend: true, impressions: true, clicks: true,
          riskApprovedValue: true, grossValue: true, purchases: true, netOrders: true,
        },
      }),

      prisma.systemSettings.findUnique({ where: { id: 1 } }),
    ]);

    const periodByAd = new Map<string, CreativeTotals>();
    for (const row of period) {
      periodByAd.set(row.adCreativeId, {
        spend: row._sum.spend ?? 0,
        impressions: row._sum.impressions ?? 0,
        clicks: row._sum.clicks ?? 0,
        riskApprovedValue: row._sum.riskApprovedValue ?? 0,
        grossValue: row._sum.grossValue ?? 0,
        purchases: row._sum.purchases ?? 0,
        netOrders: row._sum.netOrders ?? 0,
      });
    }

    const totalsByAd = new Map<string, CreativeTotals & { firstDeliveryAt: Date | null; lastDeliveryAt: Date | null }>();
    for (const row of lifetime) {
      totalsByAd.set(row.adCreativeId, {
        spend: row._sum.spend ?? 0,
        impressions: row._sum.impressions ?? 0,
        clicks: row._sum.clicks ?? 0,
        riskApprovedValue: row._sum.riskApprovedValue ?? 0,
        grossValue: row._sum.grossValue ?? 0,
        purchases: row._sum.purchases ?? 0,
        netOrders: row._sum.netOrders ?? 0,
        firstDeliveryAt: row._min.date,
        lastDeliveryAt: row._max.date,
      });
    }

    let settings = settingsRow;
    
    // A regra de categoria é a de `lib/creative-categories.ts`, a mesma que o
    // gerador de copy usa para decidir quais peças viram referência.
    const categories = loadCategories(settings);

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
      const totals = totalsByAd.get(ad.id);
      // Sem nenhum dia de veiculação registrado não há o que exibir.
      if (!totals) continue;

      // Cada métrica é somada de forma independente ao longo de todos os dias
      // em que o anúncio rodou.
      const { spend, impressions, clicks, riskApprovedValue, grossValue, purchases, netOrders } = totals;

      if (spend === 0 && grossValue === 0 && riskApprovedValue === 0) continue;

      // Valores do período, para os indicadores globais do topo.
      const inPeriod = periodByAd.get(ad.id) ?? EMPTY_TOTALS;

      // Os totais devolvidos pela API são do PERÍODO — é o que as metas mensais comparam.
      totalSpend += inPeriod.spend;
      totalImpressions += inPeriod.impressions;
      totalClicks += inPeriod.clicks;
      totalRiskApprovedValue += inPeriod.riskApprovedValue;
      totalGrossValue += inPeriod.grossValue;

      const groupKey = ad.id;
      const cpa = calculateCpa(totals);
      const ctr = calculateCtr(totals);

      const identity = {
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
        status: ad.status,
        aiAnalyzedAt: ad.aiAnalyzedAt,
        firstDeliveryAt: totals.firstDeliveryAt,
        lastDeliveryAt: totals.lastDeliveryAt,
        // Prefixo `period` = recorte de datas. Sem prefixo = acumulado de veiculação.
        periodSpend: inPeriod.spend,
        periodGrossValue: inPeriod.grossValue,
        periodRiskApprovedValue: inPeriod.riskApprovedValue,
        periodNetOrders: inPeriod.netOrders,
        periodPurchases: inPeriod.purchases,
        periodImpressions: inPeriod.impressions,
        periodClicks: inPeriod.clicks,
      };

      aggregatedAds.set(groupKey, {
        ...identity,
        spend, impressions, clicks, riskApprovedValue, grossValue, netOrders, purchases,
      });

      originalAdsByCreative.set(groupKey, [{
        adsetName: ad.adsetName,
        individualData: {
          ...identity,
          spend: spend.toFixed(2),
          ctr: ctr.toFixed(2),
          riskApprovedValue: riskApprovedValue.toFixed(2),
          grossValue: grossValue.toFixed(2),
          cpa: cpa.toFixed(2),
          netOrders,
          purchases,
          impressions,
          clicks,
        },
      }]);
    }

    for (const [groupKey, agg] of aggregatedAds.entries()) {
      const cpa = calculateCpa(agg);
      const ctr = calculateCtr(agg);
      
      // As regras usam exatamente os mesmos números exibidos no card.
      const matchedCategoryIndex = matchCategoryIndex(agg, agg.platform, categories);

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
        // Declara qual evento de conversão está por trás do CPA e da receita,
        // para a interface nunca reportar "o CPA" sem qualificar a origem.
        conversions: activeConversionDescriptor(settings),
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

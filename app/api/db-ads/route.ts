import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
        ? { not: "ACTIVE" }
        : "ACTIVE";

    const ads = await prisma.adCreative.findMany({
      where: {
        ...(statusFilter !== undefined && { status: statusFilter })
      },
      include: {
        metrics: {
          where: { date: { gte: startDate, lte: endDate } }
        }
      }
    });

    let settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = {
        id: 1,
        superWinnerSpend: 1000,
        superWinnerReturn: 5000,
        superWinnerCpa: 50,
        winnerSpend: 1000,
        winnerReturn: 1000,
        winnerCpa: 60,
        updatedAt: new Date()
      } as any;
    }

    const SUPER_WINNER_SPEND_THRESHOLD = settings!.superWinnerSpend;
    const SUPER_WINNER_VALUE_THRESHOLD = settings!.superWinnerReturn;
    const SUPER_WINNER_MAX_CPA = settings!.superWinnerCpa || 50;


    const WINNER_SPEND_THRESHOLD = settings!.winnerSpend;
    const WINNER_VALUE_THRESHOLD = settings!.winnerReturn;
    const WINNER_MAX_CPA = settings!.winnerCpa || 60;

    const superWinners: any[] = [];
    const winners: any[] = [];
    const testes: Record<string, any[]> = {};
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalRiskApprovedValue = 0;
    let totalGrossValue = 0;

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

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      const creativeData = {
        id: ad.id,
        ad_name: ad.adName,
        designer: ad.designer,
        image_url: ad.imageUrl,
        thumbnail_url: ad.thumbnailUrl,
        videoUrl: ad.videoUrl,
        mediaType: ad.mediaType,
        publisherPlatforms: ad.publisherPlatforms,
        createdTime: ad.createdTime,
        spend: spend.toFixed(2),
        ctr: ctr.toFixed(2),
        riskApprovedValue: riskApprovedValue.toFixed(2),
        grossValue: grossValue.toFixed(2),
        cpa: (netOrders > 0 ? (spend / netOrders) : spend).toFixed(2),
        netOrders,
        impressions,
        clicks,
      };

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalRiskApprovedValue += riskApprovedValue;
      totalGrossValue += grossValue;

      const cpa = netOrders > 0 ? (spend / netOrders) : spend; // se não tem aprovação, o custo é o spend inteiro

      const isSuperWinner =
        spend >= SUPER_WINNER_SPEND_THRESHOLD &&
        riskApprovedValue >= SUPER_WINNER_VALUE_THRESHOLD &&
        cpa <= SUPER_WINNER_MAX_CPA;

      const isWinner =
        spend >= WINNER_SPEND_THRESHOLD &&
        riskApprovedValue >= WINNER_VALUE_THRESHOLD &&
        cpa <= WINNER_MAX_CPA;

      if (isSuperWinner) {
        superWinners.push(creativeData);
      } else if (isWinner) {
        winners.push(creativeData);
      } else {
        const set = ad.adsetName || "Outros";
        if (!testes[set]) testes[set] = [];
        testes[set].push(creativeData);
      }
    }

    // Sort: do maior para o menor valor aprovado (resultado real), com gasto como desempate
    const byResultDesc = (a: any, b: any) =>
      parseFloat(b.riskApprovedValue) - parseFloat(a.riskApprovedValue) || parseFloat(b.spend) - parseFloat(a.spend);
    superWinners.sort(byResultDesc);
    winners.sort(byResultDesc);
    Object.keys(testes).forEach(k => testes[k].sort(byResultDesc));

    const globalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        superWinners,
        winners,
        testes,
        metrics: {
          totalSpend: totalSpend.toFixed(2),
          avgCtr: globalCtr.toFixed(2),
          totalRiskApprovedValue: totalRiskApprovedValue.toFixed(2),
          totalGrossValue: totalGrossValue.toFixed(2),
        },
        settings: {
          superWinnerSpend: SUPER_WINNER_SPEND_THRESHOLD,
          superWinnerReturn: SUPER_WINNER_VALUE_THRESHOLD,
          superWinnerCpa: SUPER_WINNER_MAX_CPA,
          winnerSpend: WINNER_SPEND_THRESHOLD,
          winnerReturn: WINNER_VALUE_THRESHOLD,
          winnerCpa: WINNER_MAX_CPA,
        }
      }
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

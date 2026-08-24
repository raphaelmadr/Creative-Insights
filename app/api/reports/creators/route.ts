import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get("dateRange");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    let targetMonth = monthParam ? parseInt(monthParam) : currentMonth;
    let targetYear = yearParam ? parseInt(yearParam) : currentYear;

    const isCurrentMonth = targetMonth === currentMonth && targetYear === currentYear;

    // Check if we have a saved report for past months
    if (!isCurrentMonth && !dateRange) {
      const savedReports = await prisma.creatorMonthlyReport.findMany({
        where: { month: targetMonth, year: targetYear },
        include: { creator: true }
      });

      if (savedReports.length > 0) {
        const formattedSaved = savedReports.map((rep: any) => ({
          name: rep.creator.name,
          acronym: rep.creator.acronym,
          spend: rep.spend,
          purchases: rep.purchases,
          grossValue: rep.grossValue,
          riskApprovedValue: rep.riskApprovedValue,
          activeAdsCount: rep.activeAdsCount,
          cpa: rep.netOrders > 0 ? rep.spend / rep.netOrders : 0,
          roas: rep.roas,
          monthlyGoal: rep.creator.monthlyGoal || 50000,
          monthlyVolumeGoal: rep.creator.monthlyVolumeGoal || 30,
          isSaved: true
        })).sort((a: any, b: any) => b.riskApprovedValue - a.riskApprovedValue);
        
        return NextResponse.json({ success: true, data: formattedSaved });
      }
    }

    // Determine date filter for live calculation
    let startDate = new Date();
    let endDate = new Date();
    
    if (dateRange) {
      // Compatibility with old dateRange filter
      startDate.setDate(today.getDate() - parseInt(dateRange));
    } else {
      // Month-based filtering strictly in UTC to prevent timezone offsets missing the 1st day
      startDate = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0, 0));
      // End date is the last millisecond of the last day of the target month in UTC
      endDate = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
    }

    const metrics = await prisma.adDailyMetrics.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        creative: true
      }
    });

    const creators = await prisma.creator.findMany({
      where: { active: true }
    });
    
    // Mapear métricas por criador
    const creatorStats: Record<string, any> = {};
    
    let unknownCreator = await prisma.creator.findFirst({ where: { acronym: { contains: "UNKNOWN" } } });
    if (!unknownCreator) {
      unknownCreator = await prisma.creator.create({
        data: {
          name: "Parcerias, influenciadores ou sem atribuição",
          acronym: "UNKNOWN",
          active: true,
          monthlyGoal: 0
        }
      });
    }

    creators.forEach(creator => {
      creatorStats[creator.id] = {
        creatorId: creator.id,
        name: creator.name,
        acronym: creator.acronym,
        monthlyGoal: creator.monthlyGoal || 50000,
        monthlyVolumeGoal: creator.monthlyVolumeGoal || 30,
        spend: 0,
        purchases: 0,
        grossValue: 0,
        riskApprovedValue: 0,
        clicks: 0,
        impressions: 0,
        netOrders: 0,
        activeAds: new Set()
      };
    });
    
    metrics.forEach(metric => {
      const metricAcronym = metric.creative?.designer?.toUpperCase() || "";
      let targetCreatorId = unknownCreator.id;

      if (metricAcronym) {
        // Procurar o criador que possua essa sigla cadastrada (aceita múltiplas separadas por vírgula)
        const matchedCreator = creators.find(c => {
          const possibleAcronyms = c.acronym.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(s => s.toUpperCase());
          return possibleAcronyms.includes(metricAcronym);
        });
        if (matchedCreator) {
          targetCreatorId = matchedCreator.id;
        }
      }

      const creative = metric.creative;
      let isCreatedInMonth = false;
      
      if (creative && creative.createdTime) {
        const createdDate = new Date(creative.createdTime);
        const toleranceStart = new Date(startDate);
        toleranceStart.setDate(toleranceStart.getDate() - 5); // 5 dias de tolerância
        isCreatedInMonth = createdDate >= toleranceStart && createdDate <= endDate;
      }

      // Contabilizar APENAS os anúncios que foram criados a partir do dia 01 do mês alvo
      if (isCreatedInMonth) {
        const stats = creatorStats[targetCreatorId];
        stats.spend += metric.spend;
        stats.purchases += metric.purchases;
        stats.grossValue += metric.grossValue;
        stats.riskApprovedValue += metric.riskApprovedValue;
        stats.clicks += metric.clicks;
        stats.impressions += metric.impressions;
        stats.netOrders += metric.netOrders;
        
        if (creative && metric.adCreativeId) {
          const isStatusActive = creative.status === "ACTIVE";
          if (isStatusActive) {
            stats.activeAds.add(metric.adCreativeId);
          }
        }
      }
    });

    const formattedStats = Object.values(creatorStats).map((stats: any) => {
      const cpa = stats.netOrders > 0 ? stats.spend / stats.netOrders : 0;
      const roas = stats.spend > 0 ? stats.grossValue / stats.spend : 0;
      
      return {
        creatorId: stats.creatorId,
        name: stats.name,
        acronym: stats.acronym,
        monthlyGoal: stats.monthlyGoal,
        monthlyVolumeGoal: stats.monthlyVolumeGoal,
        spend: stats.spend,
        purchases: stats.purchases,
        netOrders: stats.netOrders,
        grossValue: stats.grossValue,
        riskApprovedValue: stats.riskApprovedValue,
        activeAdsCount: stats.activeAds.size,
        cpa,
        roas
      };
    }).sort((a, b) => b.riskApprovedValue - a.riskApprovedValue);

    // Se é um mês passado E não pedimos um dateRange fixo, vamos SALVAR isso no banco
    if (!isCurrentMonth && !dateRange) {
      for (const stat of formattedStats) {
        if (!stat.creatorId) continue;
        await prisma.creatorMonthlyReport.upsert({
          where: {
            creatorId_month_year: {
              creatorId: stat.creatorId,
              month: targetMonth,
              year: targetYear
            }
          },
          update: {
            grossValue: stat.grossValue,
            riskApprovedValue: stat.riskApprovedValue,
            spend: stat.spend,
            purchases: stat.purchases,
            netOrders: stat.netOrders,
            roas: stat.roas,
            activeAdsCount: stat.activeAdsCount
          },
          create: {
            creatorId: stat.creatorId,
            month: targetMonth,
            year: targetYear,
            grossValue: stat.grossValue,
            riskApprovedValue: stat.riskApprovedValue,
            spend: stat.spend,
            purchases: stat.purchases,
            netOrders: stat.netOrders,
            roas: stat.roas,
            activeAdsCount: stat.activeAdsCount
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: formattedStats
    });
  } catch (err: any) {
    console.error("Erro ao gerar relatório de criadores:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

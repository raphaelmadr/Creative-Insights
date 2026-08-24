import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    
    const today = new Date();
    const targetMonth = monthParam ? parseInt(monthParam) : today.getMonth() + 1;
    const targetYear = yearParam ? parseInt(yearParam) : today.getFullYear();

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const teamCreativeGoal = settings?.teamCreativeGoal || 300;

    // Início e fim do mês
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // Buscar TODOS os criadores
    const allCreators = await prisma.creator.findMany({
      orderBy: { name: 'asc' }
    });

    const deliveries = await prisma.delivery.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        }
      },
      include: {
        creator: true
      },
      orderBy: {
        date: 'desc'
      }
    });

    // Construir mapa com TODOS os criadores zerados inicialmente
    const rankingMap: Record<string, any> = {};
    allCreators.forEach(c => {
      rankingMap[c.id] = {
        creatorId: c.id,
        name: c.name,
        acronym: c.acronym,
        totalPieces: 0
      };
    });
    
    // Somar as entregas reais
    deliveries.forEach((d: any) => {
      if (rankingMap[d.creatorId]) {
        rankingMap[d.creatorId].totalPieces += d.pieces;
      }
    });

    const ranking = Object.values(rankingMap).sort((a: any, b: any) => {
      if (a.name === "Parcerias" && b.name !== "Parcerias") return 1;
      if (b.name === "Parcerias" && a.name !== "Parcerias") return -1;
      return b.totalPieces - a.totalPieces;
    });

    return NextResponse.json({ success: true, deliveries, ranking, teamCreativeGoal });
  } catch (error: any) {
    console.error("Error fetching deliveries:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

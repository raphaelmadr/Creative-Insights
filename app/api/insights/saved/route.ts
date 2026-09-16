import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const skip = parseInt(searchParams.get("skip") || "0");
    const take = parseInt(searchParams.get("take") || "10");

    // Exclui registros legados de análise de campanha (agora vivem em CampaignAnalysis) —
    // esta aba deve mostrar apenas atualizações do algoritmo.
    const where = {
      OR: [
        { sourceUrl: null },
        { sourceUrl: { not: "https://business.facebook.com" } }
      ]
    };

    const totalCount = await prisma.algorithmUpdate.count({ where });
    const dbUpdates = await prisma.algorithmUpdate.findMany({
      where,
      skip,
      take,
      orderBy: { timestamp: 'desc' }
    });
    
    return NextResponse.json({ updates: dbUpdates, totalCount, hasMore: (skip + take) < totalCount });
  } catch (error: any) {
    console.error("Error fetching saved insights:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

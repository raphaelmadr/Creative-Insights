import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monthStr = searchParams.get("month");
  const yearStr = searchParams.get("year");

  if (!monthStr || !yearStr) {
    // Retorna todos os objetivos se não for especificado
    const allGoals = await prisma.monthlyGoal.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    return NextResponse.json({ success: true, data: allGoals });
  }

  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);

  const goal = await prisma.monthlyGoal.findUnique({
    where: {
      month_year: { month, year },
    },
  });

  return NextResponse.json({ success: true, data: goal });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { month, year, spendGoal, revenueGoal, cpaGoal } = body;

    if (month === undefined || year === undefined) {
      return NextResponse.json({ success: false, error: "Month and Year are required" }, { status: 400 });
    }

    const goal = await prisma.monthlyGoal.upsert({
      where: {
        month_year: { month, year },
      },
      update: {
        spendGoal,
        revenueGoal,
        cpaGoal,
      },
      create: {
        month,
        year,
        spendGoal: spendGoal || 0,
        revenueGoal: revenueGoal || 0,
        cpaGoal: cpaGoal || 0,
      },
    });

    return NextResponse.json({ success: true, data: goal });
  } catch (error: any) {
    console.error("Error saving goal:", error);
    return NextResponse.json({ success: false, error: "Failed to save goal", details: error?.message || String(error) }, { status: 500 });
  }
}

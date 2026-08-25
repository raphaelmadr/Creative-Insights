import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const creators = await prisma.creator.findMany({
      where: {
        NOT: {
          acronym: {
            contains: "UNKNOWN"
          }
        }
      },
      orderBy: { name: "asc" }
    });
    return NextResponse.json({ data: creators });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, acronym, active, monthlyGoal, monthlyVolumeGoal } = body;

    if (!name || !acronym) {
      return NextResponse.json({ error: "Nome e sigla são obrigatórios" }, { status: 400 });
    }

    const parsedMonthlyGoal = (monthlyGoal === "" || monthlyGoal === undefined || monthlyGoal === null) ? 0 : parseFloat(monthlyGoal);
    const parsedVolumeGoal = (monthlyVolumeGoal === "" || monthlyVolumeGoal === undefined || monthlyVolumeGoal === null) ? 0 : parseInt(monthlyVolumeGoal, 10);

    const creator = await prisma.creator.create({
      data: {
        name,
        acronym: acronym.toUpperCase(),
        active: active !== undefined ? active : true,
        monthlyGoal: isNaN(parsedMonthlyGoal) ? 0 : parsedMonthlyGoal,
        monthlyVolumeGoal: isNaN(parsedVolumeGoal) ? 0 : parsedVolumeGoal
      }
    });

    return NextResponse.json({ data: creator });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Já existe um criador com essa sigla" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, acronym, active, monthlyGoal, monthlyVolumeGoal } = body;

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.creator.findUnique({ where: { id } });
    
    const updateData: any = {};
    if (name) updateData.name = name;
    
    if (acronym) {
      if (existing?.acronym.includes("UNKNOWN") && !acronym.toUpperCase().includes("UNKNOWN")) {
        return NextResponse.json({ error: "O Time Interno deve sempre conter a sigla UNKNOWN na lista (ex: UNKNOWN, PARC)" }, { status: 400 });
      }
      updateData.acronym = acronym.toUpperCase();
    }
    
    if (active !== undefined) updateData.active = active;
    
    if (monthlyGoal !== undefined) {
      const parsed = parseFloat(monthlyGoal);
      updateData.monthlyGoal = isNaN(parsed) ? 0 : parsed;
    }
    
    if (monthlyVolumeGoal !== undefined) {
      const parsed = parseInt(monthlyVolumeGoal, 10);
      updateData.monthlyVolumeGoal = isNaN(parsed) ? 0 : parsed;
    }

    const creator = await prisma.creator.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ data: creator });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Já existe um criador com essa sigla" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.creator.findUnique({ where: { id } });
    if (existing?.acronym.includes("UNKNOWN")) {
      return NextResponse.json({ error: "Não é possível remover a entidade base" }, { status: 400 });
    }

    await prisma.creator.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

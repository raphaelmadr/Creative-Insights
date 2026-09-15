/**
 * As colunas de um quadro — as etapas do fluxo.
 *
 * A edição mora na própria tela do Kanban, e não no painel de configurações:
 * quem reorganiza as etapas é quem trabalha no quadro, e mandá-lo a outra tela
 * para renomear "Em revisão" é atrito num ajuste de dez segundos.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { intakeColumnId } from "@/lib/kanban-store";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { boardId, name, color } = await request.json();
    if (!boardId || !name?.trim()) {
      return NextResponse.json({ error: "Quadro e nome são obrigatórios." }, { status: 400 });
    }

    const last = await prisma.boardColumn.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const column = await prisma.boardColumn.create({
      data: {
        boardId,
        name: name.trim(),
        color: color || null,
        position: (last?.position ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, column });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const body = await request.json();

    /*
     * Reordenar é uma lista inteira, numa transação.
     *
     * Uma coluna por requisição deixaria o quadro com duas etapas na mesma
     * posição entre uma chamada e a outra — e é exatamente nesse intervalo que
     * outra pessoa carrega a página e vê a ordem errada.
     */
    if (Array.isArray(body.order)) {
      await prisma.$transaction(
        body.order.map((id: string, index: number) =>
          prisma.boardColumn.update({ where: { id }, data: { position: index } })
        )
      );
      return NextResponse.json({ success: true });
    }

    const { id, name, color, isIntake, isDone, wipLimit } = body;
    if (!id) return NextResponse.json({ error: "ID da coluna é obrigatório." }, { status: 400 });

    const current = await prisma.boardColumn.findUnique({ where: { id }, select: { boardId: true } });
    if (!current) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

    // Uma entrada por quadro: com duas, a demanda nova cairia na que a
    // ordenação devolvesse primeiro, que não é uma escolha de ninguém.
    if (isIntake === true) {
      await prisma.boardColumn.updateMany({
        where: { boardId: current.boardId, isIntake: true, NOT: { id } },
        data: { isIntake: false },
      });
    }

    const column = await prisma.boardColumn.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(color !== undefined ? { color: color || null } : {}),
        ...(isIntake !== undefined ? { isIntake: !!isIntake } : {}),
        ...(isDone !== undefined ? { isDone: !!isDone } : {}),
        ...(wipLimit !== undefined
          ? { wipLimit: wipLimit === null || wipLimit === "" ? null : Number(wipLimit) }
          : {}),
      },
    });

    return NextResponse.json({ success: true, column });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID da coluna é obrigatório." }, { status: 400 });

    const column = await prisma.boardColumn.findUnique({
      where: { id },
      select: { boardId: true, _count: { select: { cards: true } } },
    });
    if (!column) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

    const siblings = await prisma.boardColumn.count({ where: { boardId: column.boardId } });
    if (siblings <= 1) {
      return NextResponse.json({ error: "O quadro precisa de pelo menos uma coluna." }, { status: 400 });
    }

    /*
     * Os cards mudam de coluna antes; a exclusão em cascata os levaria junto.
     *
     * Apagar uma etapa é dizer "esta fase não existe mais", não "o trabalho que
     * estava nela não aconteceu" — e o cascade do banco não sabe a diferença.
     */
    if (column._count.cards > 0) {
      const fallback = await prisma.boardColumn.findFirst({
        where: { boardId: column.boardId, NOT: { id } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      if (fallback) {
        await prisma.boardCard.updateMany({ where: { columnId: id }, data: { columnId: fallback.id } });
      }
    }

    await prisma.boardColumn.delete({ where: { id } });

    // A coluna apagada podia ser a entrada; sem outra marcada, a demanda nova
    // passa a depender do recuo de "a primeira da ordem".
    const stillHasIntake = await prisma.boardColumn.count({
      where: { boardId: column.boardId, isIntake: true },
    });
    if (stillHasIntake === 0) {
      const first = await intakeColumnId(column.boardId);
      if (first) await prisma.boardColumn.update({ where: { id: first }, data: { isIntake: true } });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

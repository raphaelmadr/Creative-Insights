/**
 * As demandas.
 *
 * Toda entrada passa por `validateValues` antes de virar linha: os campos são
 * definidos pelo próprio time na tela do Kanban, então o que chega aqui é um
 * JSON cuja forma o servidor não conhece de antemão — e conferir contra os
 * campos do quadro é a única garantia de que a resposta corresponde à pergunta.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isPriority, parseValues, validateValues, parseDueDate, PRIORITY_LABEL, type Priority } from "@/lib/kanban";
import { intakeColumnId, topPosition, logActivity } from "@/lib/kanban-store";

/** O histórico de um card, para o painel de acompanhamento. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const cardId = new URL(request.url).searchParams.get("cardId");
    if (!cardId) return NextResponse.json({ error: "cardId é obrigatório." }, { status: 400 });

    const activities = await prisma.cardActivity.findMany({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, activities });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const body = await request.json();
    const { boardId, title, description, priority, dueDate, assigneeAcronym } = body;

    if (!boardId || !title?.trim()) {
      return NextResponse.json({ error: "Quadro e título são obrigatórios." }, { status: 400 });
    }

    const fields = await prisma.boardField.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
    });

    const checked = validateValues(fields, body.values ?? {});
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

    const columnId = body.columnId || (await intakeColumnId(boardId));
    if (!columnId) {
      return NextResponse.json({ error: "Este quadro ainda não tem colunas." }, { status: 400 });
    }

    const card = await prisma.boardCard.create({
      data: {
        boardId,
        columnId,
        title: title.trim(),
        description: description?.trim() || null,
        priority: isPriority(priority) ? priority : "MEDIA",
        dueDate: parseDueDate(dueDate),
        assigneeAcronym: assigneeAcronym?.trim()?.toUpperCase() || null,
        // Quem abriu vem da sessão, nunca do corpo da requisição: um campo de
        // "solicitante" enviado pelo cliente é um campo que dá para forjar.
        requesterEmail: user.email,
        requesterName: user.name,
        values: Object.keys(checked.values).length ? JSON.stringify(checked.values) : null,
        origin: "FORM",
        position: await topPosition(columnId),
      },
    });

    await logActivity(card.id, "CREATED", "abriu a demanda", user);

    return NextResponse.json({ success: true, card });
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
     * O arrasto: a coluna inteira renumerada de uma vez, numa transação.
     *
     * Só a posição do card movido não basta — as posições nascem esparsas (ver
     * `topPosition`) e empatam com o tempo. Renumerando a coluna de destino a
     * cada solta, a ordem que a próxima pessoa a carregar a página vê é a mesma
     * que se está vendo agora.
     */
    if (body.move) {
      const { cardId, columnId, order } = body.move;
      if (!cardId || !columnId || !Array.isArray(order)) {
        return NextResponse.json({ error: "Movimento inválido." }, { status: 400 });
      }

      const card = await prisma.boardCard.findUnique({
        where: { id: cardId },
        select: { columnId: true, title: true },
      });
      if (!card) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

      const target = await prisma.boardColumn.findUnique({
        where: { id: columnId },
        select: { name: true, isDone: true },
      });
      if (!target) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

      await prisma.$transaction([
        prisma.boardCard.update({
          where: { id: cardId },
          data: {
            columnId,
            /*
             * A data de conclusão é carimbada ao entrar na coluna de entrega e
             * apagada ao sair dela. Sem apagar, um card que volta para revisão
             * continuaria contando como entregue no relatório.
             */
            completedAt: target.isDone ? new Date() : null,
          },
        }),
        ...order.map((id: string, index: number) =>
          prisma.boardCard.update({ where: { id }, data: { position: index } })
        ),
      ]);

      if (card.columnId !== columnId) {
        await logActivity(cardId, "MOVED", `moveu para "${target.name}"`, user);
      }

      return NextResponse.json({ success: true });
    }

    /* Um comentário no acompanhamento. */
    if (body.comment) {
      const { cardId, text } = body.comment;
      if (!cardId || !text?.trim()) {
        return NextResponse.json({ error: "O comentário está vazio." }, { status: 400 });
      }
      await logActivity(cardId, "COMMENT", text.trim().slice(0, 2000), user);
      return NextResponse.json({ success: true });
    }

    const { id, title, description, priority, dueDate, assigneeAcronym, columnId } = body;
    if (!id) return NextResponse.json({ error: "ID da demanda é obrigatório." }, { status: 400 });

    const current = await prisma.boardCard.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

    let values = current.values;
    if (body.values !== undefined) {
      const fields = await prisma.boardField.findMany({ where: { boardId: current.boardId } });

      /*
       * A edição preserva o que não foi enviado.
       *
       * O painel do card mostra os campos do quadro de hoje; respostas de um
       * campo removido no passado não aparecem lá, e substituir o JSON inteiro
       * pelo que o formulário devolveu as apagaria sem que ninguém pedisse.
       */
      const merged = { ...parseValues(current.values), ...(body.values as object) };
      const checked = validateValues(fields, merged);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      values = Object.keys(checked.values).length ? JSON.stringify(checked.values) : null;
    }

    const card = await prisma.boardCard.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() || null } : {}),
        ...(priority !== undefined && isPriority(priority) ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: parseDueDate(dueDate) } : {}),
        ...(assigneeAcronym !== undefined
          ? { assigneeAcronym: assigneeAcronym ? String(assigneeAcronym).toUpperCase() : null }
          : {}),
        ...(columnId !== undefined ? { columnId } : {}),
        values,
      },
    });

    /*
     * O histórico registra as mudanças que alguém vai querer explicar depois —
     * quem assumiu e o quanto a prioridade subiu. Um evento "atualizou o card"
     * a cada tecla não informa nada e enterra os que informam.
     */
    if (assigneeAcronym !== undefined && assigneeAcronym !== current.assigneeAcronym) {
      await logActivity(
        id,
        "ASSIGNED",
        assigneeAcronym ? `atribuiu para ${String(assigneeAcronym).toUpperCase()}` : "removeu o responsável",
        user
      );
    }
    if (priority !== undefined && priority !== current.priority && isPriority(priority)) {
      await logActivity(
        id,
        "UPDATED",
        `mudou a prioridade para ${PRIORITY_LABEL[priority as Priority]}`,
        user
      );
    }

    return NextResponse.json({ success: true, card });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID da demanda é obrigatório." }, { status: 400 });

    // Arquiva em vez de apagar: o card carrega o briefing e o histórico, e a
    // exclusão em cascata levaria o histórico junto, sem volta.
    await prisma.boardCard.update({ where: { id }, data: { archived: true } });
    await logActivity(id, "UPDATED", "arquivou a demanda", user);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

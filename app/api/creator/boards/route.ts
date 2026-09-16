/**
 * Os quadros do Kanban.
 *
 * A leitura devolve o quadro inteiro — colunas, campos e cards — numa consulta
 * só. Em três chamadas separadas a tela pisca montada pela metade, com as
 * colunas já desenhadas e os cards chegando depois.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultBoard, archiveDeliveredBeforeThisMonth, boardPulse, BOARD_INCLUDE } from "@/lib/kanban-store";
import { serializeCardBadges, serializeCardLabels } from "@/lib/kanban";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    await ensureDefaultBoard();

    const url = new URL(request.url);
    const boardId = url.searchParams.get("boardId");

    const boards = await prisma.board.findMany({
      where: { archived: false },
      orderBy: { position: "asc" },
      select: { id: true, name: true, description: true, receivesCopy: true, position: true },
    });

    // Sem quadro pedido, abre o primeiro: é o que a pessoa via da última vez em
    // 99% das visitas, e escolher um quadro antes de ver qualquer coisa é uma
    // pergunta a mais para quem só quer olhar o andamento.
    const activeId = boardId && boards.some((b) => b.id === boardId) ? boardId : boards[0]?.id;

    const board = activeId
      ? await prisma.board.findUnique({ where: { id: activeId }, include: BOARD_INCLUDE })
      : null;

    /*
     * As entregas de meses anteriores saem do quadro antes de ele ser lido.
     *
     * Antes da consulta, e não depois: lendo primeiro, a tela receberia nesta
     * visita os cards que acabaram de ser arquivados, e eles só desapareceriam
     * no recarregamento seguinte.
     */
    if (activeId) await archiveDeliveredBeforeThisMonth(activeId);

    const cards = activeId
      ? await prisma.boardCard.findMany({
          where: { boardId: activeId, archived: false },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        })
      : [];

    /*
     * Quantos cards estão no arquivo — o card fixo do quadro mostra esse número
     * sem precisar abrir a lista. Uma contagem é mais barata que trazer as
     * linhas, e é tudo o que a frente do quadro precisa saber.
     */
    const archivedCount = activeId
      ? await prisma.boardCard.count({ where: { boardId: activeId, archived: true } })
      : 0;

    /*
     * O pulso sai junto com os dados, e não numa chamada à parte, porque a tela
     * precisa dos dois casados: guardando um pulso lido depois, ela recarregaria
     * o quadro por causa da própria leitura, em laço.
     */
    const pulse = activeId ? await boardPulse(activeId) : null;

    return NextResponse.json({ success: true, boards, board, cards, archivedCount, pulse });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { name, description } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "O quadro precisa de um nome." }, { status: 400 });
    }

    const last = await prisma.board.findFirst({ orderBy: { position: "desc" }, select: { position: true } });

    /*
     * Um quadro novo nasce com as quatro etapas do fluxo padrão, e não vazio.
     * Um Kanban sem colunas não aceita nem o primeiro card — a pessoa teria de
     * descobrir sozinha que precisa criar colunas antes de poder usá-lo.
     */
    const board = await prisma.board.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        position: (last?.position ?? -1) + 1,
        columns: {
          create: [
            { name: "Backlog", color: "var(--muted)", isIntake: true, position: 0 },
            { name: "Em produção", color: "var(--info)", position: 1 },
            { name: "Em revisão", color: "var(--warning)", position: 2 },
            { name: "Entregue", color: "var(--success)", isDone: true, position: 3 },
          ],
        },
      },
      include: BOARD_INCLUDE,
    });

    return NextResponse.json({ success: true, board });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id, name, description, receivesCopy, cardBadges, cardLabels } = await request.json();
    if (!id) return NextResponse.json({ error: "ID do quadro é obrigatório." }, { status: 400 });

    /*
     * Só um quadro recebe as copys. Desmarcar os outros antes de marcar este é
     * o que garante isso: sem essa passada, dois quadros marcados fariam a
     * geração escolher pelo acaso da ordenação, e a copy cairia ora num, ora
     * noutro.
     */
    if (receivesCopy === true) {
      await prisma.board.updateMany({
        where: { receivesCopy: true, NOT: { id } },
        data: { receivesCopy: false },
      });
    }

    const board = await prisma.board.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() || null } : {}),
        ...(receivesCopy !== undefined ? { receivesCopy: !!receivesCopy } : {}),
        /*
         * A lista chega da tela e é normalizada aqui — chaves desconhecidas
         * caem fora e a ordem vira a do catálogo. `serializeCardBadges` sempre
         * devolve texto, inclusive `[]`: gravar nulo para "nenhum badge" faria
         * o quadro entender que ninguém configurou nada e trazer o padrão de
         * volta na próxima leitura.
         */
        ...(cardBadges !== undefined ? { cardBadges: serializeCardBadges(cardBadges) } : {}),
        /*
         * Mesma regra das etiquetas: `serializeCardLabels` sempre devolve texto,
         * e `[]` é uma escolha legítima — quem não quer etiqueta nenhuma não
         * pode receber as padrão de volta na próxima leitura.
         */
        ...(cardLabels !== undefined ? { cardLabels: serializeCardLabels(cardLabels) } : {}),
      },
      include: BOARD_INCLUDE,
    });

    return NextResponse.json({ success: true, board });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID do quadro é obrigatório." }, { status: 400 });

    const remaining = await prisma.board.count({ where: { archived: false, NOT: { id } } });
    if (remaining === 0) {
      return NextResponse.json(
        { error: "Este é o único quadro. Crie outro antes de arquivar este." },
        { status: 400 }
      );
    }

    /*
     * Arquiva, não apaga. Um quadro carrega o histórico de demandas de meses —
     * apagá-lo por engano num clique levaria junto tudo que foi produzido, sem
     * volta, por causa do cascade.
     */
    await prisma.board.update({ where: { id }, data: { archived: true, receivesCopy: false } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

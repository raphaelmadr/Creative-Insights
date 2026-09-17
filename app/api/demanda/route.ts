/**
 * A abertura de demandas de dentro da plataforma.
 *
 * Fora de `/api/creator` de propósito. Tudo que mora lá é o modo Creator — o
 * board e o gerador de copy —, e aquilo é de quem produz. **Pedir** uma peça é
 * de qualquer pessoa autenticada da empresa: quem precisa de um banner quase
 * nunca é quem vai desenhá-lo. Deixar esta rota lá dentro faria dela a exceção
 * de uma pasta cuja regra é "só criadores", e exceção em pasta é o que se
 * esquece de conferir.
 *
 * Por isso ela devolve SÓ o formulário: o nome do quadro, os times e as
 * perguntas. Nem cards, nem histórico, nem configuração — quem só abre demanda
 * não recebe uma janela para dentro do quadro. É a mesma decisão da rota
 * pública, pelo mesmo motivo.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultBoard } from "@/lib/kanban-store";
import { abrirDemanda } from "@/lib/demanda-intake";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    await ensureDefaultBoard();

    const boardId = new URL(request.url).searchParams.get("boardId");

    const boards = await prisma.board.findMany({
      where: { archived: false },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    });

    // Sem quadro pedido, o primeiro — a mesma regra do Kanban, para que abrir a
    // demanda pela barra do topo caia onde ela cairia pelo board.
    const activeId = boardId && boards.some((b) => b.id === boardId) ? boardId : boards[0]?.id;

    const board = activeId
      ? await prisma.board.findUnique({
          where: { id: activeId },
          select: {
            id: true,
            name: true,
            description: true,
            groups: { orderBy: { position: "asc" } },
            fields: { orderBy: { position: "asc" } },
          },
        })
      : null;

    return NextResponse.json({ success: true, boards, board });
  } catch (error: unknown) {
    console.error("[Demanda] Falha ao carregar o formulário:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o formulário de demanda." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const body = await request.json();

    if (!body?.boardId) {
      return NextResponse.json({ error: "Quadro é obrigatório." }, { status: 400 });
    }

    const resultado = await abrirDemanda({
      boardId: String(body.boardId),
      title: body.title,
      description: body.description,
      priority: body.priority,
      dueDate: body.dueDate,
      groupId: body.groupId || null,
      linkUrl: body.linkUrl,
      values: body.values,
      /*
       * Nem `columnId` nem `assigneeEmail` são repassados, embora a abertura
       * saiba recebê-los. Quem pede uma peça escolhe o TIME; em que etapa ela
       * entra e quem exatamente a assume são decisões do quadro, e o quadro as
       * toma sozinho a partir do grupo. Aceitá-los aqui deixaria qualquer
       * pessoa autenticada pôr uma demanda direto em "Entregue".
       */
      requester: { email: user.email, name: user.name },
      origin: "FORM",
    });

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({ success: true, card: resultado.card });
  } catch (error: unknown) {
    console.error("[Demanda] Falha ao abrir:", error);
    return NextResponse.json(
      { error: "Não foi possível abrir a demanda. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

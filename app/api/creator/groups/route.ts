/**
 * As fases de um quadro — os grupos de etapas.
 *
 * Uma fase agrupa **colunas**, não cards: "Briefing", "Produção" e "Entrega"
 * são o macro-fluxo, e as etapas dentro delas são o detalhe. Oito colunas
 * lado a lado são uma fileira sem forma; as mesmas oito sob três faixas se
 * leem de longe.
 *
 * A edição mora na tela do Kanban, como as etapas e os campos, pelo mesmo
 * motivo: quem organiza o fluxo é quem trabalha nele.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGroupColor, DEFAULT_GROUP_COLOR } from "@/lib/kanban";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { boardId, name, color } = await request.json();
    if (!boardId || !name?.trim()) {
      return NextResponse.json({ error: "Quadro e nome são obrigatórios." }, { status: 400 });
    }

    const last = await prisma.boardGroup.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const group = await prisma.boardGroup.create({
      data: {
        boardId,
        name: name.trim().slice(0, 60),
        // Cor fora da paleta vira a padrão: o valor vai direto para o `style` de
        // um elemento, e aceitar texto livre aqui é aceitar CSS de terceiros.
        color: isGroupColor(color) ? color : DEFAULT_GROUP_COLOR,
        position: (last?.position ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, group });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id, name, color } = await request.json();
    if (!id) return NextResponse.json({ error: "ID da fase é obrigatório." }, { status: 400 });

    const group = await prisma.boardGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim().slice(0, 60) } : {}),
        ...(color !== undefined && isGroupColor(color) ? { color } : {}),
      },
    });

    return NextResponse.json({ success: true, group });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID da fase é obrigatório." }, { status: 400 });

    /*
     * As etapas da fase não vão junto: `groupId` vira nulo pelo `SetNull` do
     * schema. Desfazer uma fase é dizer "este agrupamento não existe mais",
     * não "as etapas dele acabaram" — e com elas iriam os cards.
     */
    await prisma.boardGroup.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

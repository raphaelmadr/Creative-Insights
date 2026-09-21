/**
 * Fecha a entrega: grava o link da pasta do Drive no card, sozinho.
 *
 * É o que substitui colar o link à mão: a rota monta o endereço da pasta a
 * partir do resultado do upload, em vez de esperar alguém copiar e colar.
 *
 * Grava em `deliveryUrl`, e não em `linkUrl` como antes. Os dois têm o mesmo
 * formato e significados opostos — `linkUrl` é o material de apoio que veio
 * junto com o pedido, este é o resultado do trabalho. Enquanto foram a mesma
 * coluna, concluir uma entrega APAGAVA a referência que originou a demanda, e
 * o quadro mostrava os dois como o mesmo selo azul.
 *
 * Não dispara o aviso do Slack. Isso só acontece quando o card é movido pra
 * coluna de conclusão — ver o gatilho em `app/api/creator/cards/route.ts`.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { normalizeCardLink } from "@/lib/card-link";
import { logActivity } from "@/lib/kanban-store";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { cardId, folderId, totalArquivos } = await request.json();
    if (!cardId || !folderId) {
      return NextResponse.json({ error: "Faltam campos (cardId/folderId)." }, { status: 400 });
    }

    const deliveryUrl = normalizeCardLink(`https://drive.google.com/drive/folders/${folderId}`);
    if (!deliveryUrl) {
      return NextResponse.json({ error: "Não foi possível montar o link da pasta." }, { status: 400 });
    }

    const card = await prisma.boardCard.update({
      where: { id: cardId },
      data: { deliveryUrl },
      select: { id: true, deliveryUrl: true },
    });

    const n = Number(totalArquivos);
    await logActivity(
      cardId,
      "UPDATED",
      `subiu a entrega${n > 0 ? ` (${n} arquivo${n === 1 ? "" : "s"})` : ""}, link gravado automaticamente`,
      user
    );

    return NextResponse.json({ ok: true, deliveryUrl: card.deliveryUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao concluir a entrega." },
      { status: 500 }
    );
  }
}

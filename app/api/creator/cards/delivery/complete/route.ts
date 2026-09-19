/**
 * Fecha a entrega: grava o link da pasta do Drive no card, sozinho.
 *
 * É o que substitui colar o link à mão — `BoardCard.linkUrl` já é o campo que
 * todo card mostra na frente e abre com um clique (`lib/card-link.ts`); esta
 * rota só o preenche a partir do resultado do upload, em vez de esperar
 * alguém copiar e colar.
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

    const linkUrl = normalizeCardLink(`https://drive.google.com/drive/folders/${folderId}`);
    if (!linkUrl) {
      return NextResponse.json({ error: "Não foi possível montar o link da pasta." }, { status: 400 });
    }

    const card = await prisma.boardCard.update({
      where: { id: cardId },
      data: { linkUrl },
      select: { id: true, linkUrl: true },
    });

    const n = Number(totalArquivos);
    await logActivity(
      cardId,
      "UPDATED",
      `subiu a entrega${n > 0 ? ` (${n} arquivo${n === 1 ? "" : "s"})` : ""}, link gravado automaticamente`,
      user
    );

    return NextResponse.json({ ok: true, linkUrl: card.linkUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao concluir a entrega." },
      { status: 500 }
    );
  }
}

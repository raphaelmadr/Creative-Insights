/**
 * Resolve (ou cria) a pasta de destino da entrega deste card no Drive.
 *
 * O formato é escolha de quem está subindo, não algo que dá pra inferir do
 * card: vídeo e animação usam a mesma extensão (.mp4), e nenhum campo hoje
 * distingue os três formatos de antemão — o painel de upload pergunta, como o
 * ad-naming-tool do Pedro também pergunta.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { formatCardCode } from "@/lib/kanban";
import { criarDriveFolders } from "@/lib/drive-delivery";
import type { DeliveryFormat } from "@/lib/delivery-naming";

const FORMATOS: DeliveryFormat[] = ["estatico", "video", "animacao", "unboxing"];

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { cardId, formato } = await request.json();
    if (!cardId) return NextResponse.json({ error: "Falta o cardId." }, { status: 400 });
    if (!FORMATOS.includes(formato)) {
      return NextResponse.json({ error: `Formato inválido: "${formato}".` }, { status: 400 });
    }

    const card = await prisma.boardCard.findUnique({ where: { id: cardId }, select: { code: true } });
    if (!card) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

    const idCard = formatCardCode(card.code);
    if (!idCard) {
      return NextResponse.json(
        { error: "Este card não tem um código (MKT-XXXX) — não é possível nomear a entrega dele." },
        { status: 400 }
      );
    }

    const drive = await criarDriveFolders();
    const pasta = await drive.garantirPastaEntrega(formato as DeliveryFormat, idCard);

    return NextResponse.json({ ...pasta, idCard });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao resolver a pasta de entrega." },
      { status: 500 }
    );
  }
}

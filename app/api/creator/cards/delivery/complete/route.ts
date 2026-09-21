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
 * Dois caminhos chegam aqui, e os dois terminam na mesma coluna:
 *
 * - `folderId` — a entrega subiu para o Drive pela automação, e a rota monta
 *   o endereço da pasta.
 * - `url` — não há arquivo para subir. É a entrega que já vive em outro
 *   lugar: uma landing page, um material hospedado fora, um link que o time
 *   recebeu pronto. Forçar esse caso a virar upload criaria uma pasta vazia
 *   no Drive só para ter onde apontar.
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
import { creditarEntregaDoModulo } from "@/lib/kanban-deliveries";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { cardId, folderId, url, totalArquivos, pecas } = await request.json();
    if (!cardId || (!folderId && !url)) {
      return NextResponse.json(
        { error: "Faltam campos (cardId e folderId ou url)." },
        { status: 400 }
      );
    }

    /* O mesmo saneamento do link colado à mão: só `http`/`https`, e sem
       esquema assume `https`. Um `javascript:` gravado aqui viraria um clique
       armado no quadro de todo mundo — ver `normalizeCardLink`. */
    const deliveryUrl = normalizeCardLink(
      folderId ? `https://drive.google.com/drive/folders/${folderId}` : url
    );
    if (!deliveryUrl) {
      return NextResponse.json(
        { error: folderId ? "Não foi possível montar o link da pasta." : "Endereço inválido." },
        { status: 400 }
      );
    }

    const card = await prisma.boardCard.update({
      where: { id: cardId },
      data: { deliveryUrl },
      select: { id: true, deliveryUrl: true, title: true },
    });

    const n = Number(totalArquivos);
    await logActivity(
      cardId,
      "UPDATED",
      folderId
        ? `subiu a entrega${n > 0 ? ` (${n} arquivo${n === 1 ? "" : "s"})` : ""}, link gravado automaticamente`
        : "registrou a entrega por link, sem arquivo no Drive",
      user
    );

    /*
     * A volumetria é creditada AQUI, e só aqui.
     *
     * Quem registra a entrega é quem a produziu — creditar no movimento do
     * card premiava quem arrastou, que pode ser do time seguinte. Conta uma
     * vez por card e para sempre: `sourceKey` é único, então reenviar, mover,
     * devolver ou arquivar não somam nem tiram. Ver `creditarEntregaDoModulo`.
     *
     * Falha alta não derruba a entrega: o link já está gravado, e uma
     * contagem que falhou vira aviso em Logs, não um envio perdido.
     */
    try {
      await creditarEntregaDoModulo({
        cardId,
        title: card.title,
        // Um link é uma entrega: vale 1 quando o cliente não disser outra coisa.
        pieces: Number(pecas) > 0 ? Number(pecas) : 1,
        email: user.email,
      });
    } catch (erro) {
      console.error("[Entregas] Falha ao creditar a volumetria:", erro);
    }

    return NextResponse.json({ ok: true, deliveryUrl: card.deliveryUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao concluir a entrega." },
      { status: 500 }
    );
  }
}

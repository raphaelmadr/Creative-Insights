/**
 * Registra no card um vídeo bruto que acabou de subir para o Drive.
 *
 * Grava em `rawVideos`, acrescentando à lista — nunca substituindo: dois
 * envios em dias diferentes são dois vídeos, e o segundo não apaga o primeiro.
 *
 * O `fileId` vem do resultado do upload, que é a resposta do PRÓPRIO Drive ao
 * último pedaço. Ainda assim passa por `sanitizeRawVideos` antes de virar
 * linha, porque nada impede alguém de chamar esta rota à mão com um id
 * qualquer — e o id gravado é exatamente o que a rota de download busca com a
 * credencial da service account, que enxerga o drive inteiro. Ver a nota em
 * `lib/raw-videos.ts`.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { logActivity } from "@/lib/kanban-store";
import { parseValues } from "@/lib/kanban";
import {
  parseRawVideos,
  sanitizeRawVideos,
  serializeRawVideos,
  MAX_RAW_VIDEOS,
} from "@/lib/raw-videos";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { cardId, videos, fieldKey } = await request.json();
    if (!cardId || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json({ error: "Faltam campos (cardId e videos)." }, { status: 400 });
    }

    const card = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: { id: true, rawVideos: true, values: true },
    });
    if (!card) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

    const anteriores = parseRawVideos(card.rawVideos);
    const novos = sanitizeRawVideos(
      videos.map((v: Record<string, unknown>) => ({
        ...v,
        // Quem subiu é quem está logado, não o que o corpo disser: este nome
        // aparece no card como autoria, e autoria não se declara.
        uploadedBy: user.email,
        uploadedAt: new Date().toISOString(),
      }))
    );

    if (!novos.length) {
      return NextResponse.json({ error: "Nenhum vídeo válido na lista." }, { status: 400 });
    }

    /* Mesmo arquivo mandado duas vezes — um clique repetido, uma aba
       reenviando — não vira duas linhas: o id do Drive é único por arquivo. */
    const porId = new Map([...anteriores, ...novos].map((v) => [v.fileId, v]));
    const lista = [...porId.values()].slice(0, MAX_RAW_VIDEOS);

    /*
     * O campo responde a si mesmo: quem subiu o vídeo respondeu "Arquivos
     * Brutos", e o campo passa a valer o link da PASTA em que eles caíram.
     *
     * Sem isto, o que chegava na produção era uma pergunta em branco com um
     * botão ao lado — a pessoa que abriu a demanda já tinha feito o trabalho,
     * e quem produz não via nada. Pior: parecia que nada havia sido enviado,
     * o que convida a subir de novo.
     *
     * Só preenche o que está VAZIO. Um link colado à mão é uma resposta que
     * alguém deu de propósito, e substituí-la seria apagar informação — o
     * outro material de apoio pode estar justamente lá. Nesse caso os vídeos
     * seguem listados à parte, que é onde eles sempre estiveram.
     */
    const respostas = parseValues(card.values);
    const jaRespondido = typeof respostas[fieldKey] === "string" && respostas[fieldKey];
    const pastaDosVideos = novos[0]?.folderId;

    if (!jaRespondido && pastaDosVideos && typeof fieldKey === "string") {
      respostas[fieldKey] = `https://drive.google.com/drive/folders/${pastaDosVideos}`;
    }

    await prisma.boardCard.update({
      where: { id: cardId },
      data: {
        rawVideos: serializeRawVideos(lista),
        ...(jaRespondido || !pastaDosVideos ? {} : { values: JSON.stringify(respostas) }),
      },
    });

    await logActivity(
      cardId,
      "UPDATED",
      novos.length === 1
        ? `subiu o vídeo bruto "${novos[0].name}"`
        : `subiu ${novos.length} vídeos brutos`,
      user
    );

    return NextResponse.json({ success: true, rawVideos: lista });
  } catch (err) {
    console.error("[Bruto] Falha ao registrar o vídeo:", err);
    return NextResponse.json(
      { error: "Não foi possível registrar o vídeo no card. O arquivo já está no Drive." },
      { status: 500 }
    );
  }
}

/**
 * Tira um vídeo da demanda — sem apagá-lo do Drive.
 *
 * A remoção é da LISTA do card, e a mensagem de confirmação na tela diz isso
 * com essas palavras. Apagar o arquivo seria destrutivo e irreversível a partir
 * de um clique num card, e o bruto de um influenciador costuma ser o único
 * material que existe daquela gravação. Quem precisa apagar de verdade apaga no
 * Drive, onde há lixeira e histórico.
 */
export async function PUT(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { cardId, remover } = await request.json();
    if (!cardId || typeof remover !== "string" || !remover) {
      return NextResponse.json({ error: "Faltam campos (cardId e remover)." }, { status: 400 });
    }

    const card = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: { rawVideos: true },
    });
    if (!card) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

    const anteriores = parseRawVideos(card.rawVideos);
    const lista = anteriores.filter((v) => v.fileId !== remover);

    // Nada a fazer é sucesso: o pedido era que o vídeo não estivesse mais na
    // lista, e ele não está. Mesmo critério da remoção de campo.
    if (lista.length !== anteriores.length) {
      const saiu = anteriores.find((v) => v.fileId === remover);
      await prisma.boardCard.update({
        where: { id: cardId },
        data: { rawVideos: serializeRawVideos(lista) },
      });
      await logActivity(cardId, "UPDATED", `tirou o vídeo bruto "${saiu?.name ?? remover}" da demanda`, user);
    }

    return NextResponse.json({ success: true, rawVideos: lista });
  } catch (err) {
    console.error("[Bruto] Falha ao remover:", err);
    return NextResponse.json(
      { error: "Não foi possível tirar o vídeo da demanda. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

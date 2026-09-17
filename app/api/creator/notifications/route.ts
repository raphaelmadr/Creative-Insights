/**
 * As notificações de uma pessoa: as demandas atribuídas a ela.
 *
 * Não há tabela de notificações, e é de propósito. A notificação aqui não é um
 * evento que aconteceu e precisa ser guardado — é uma LEITURA do quadro: "estas
 * são as demandas que estão com você". Guardar linhas exigiria escrever uma a
 * cada atribuição, em todo ponto do código que atribui alguém, e um ponto
 * esquecido viraria uma notificação que nunca chega. Derivando, não há ponto a
 * esquecer: quem está no card aparece.
 *
 * O preço é não existir "lida" por item, só "limpei tudo" — um carimbo em
 * `User.preferences`. É exatamente o controle que a aba oferece, então o preço
 * não se paga.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatCardCode, parseAssignees } from "@/lib/kanban";
import {
  mergePreferences,
  parsePreferences,
  serializePreferences,
} from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** Teto de itens na aba. Acima disso a lista deixa de ser lida e vira ruído. */
const LIMITE = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.email) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    const record = await prisma.user.findUnique({
      where: { email: user.email },
      select: { preferences: true },
    });

    const { notificationsReadAt } = parsePreferences(record?.preferences);
    const limpoEm = notificationsReadAt ? new Date(notificationsReadAt) : null;

    /*
     * O `contains` é uma peneira grossa, não a regra.
     *
     * `assignees` é JSON num campo de texto, então o banco só sabe procurar a
     * sequência de caracteres. Isso casa "ana@x.com" dentro de "mariana@x.com",
     * e por isso a lista volta a passar por `parseAssignees` abaixo — lá o
     * e-mail é comparado inteiro. A peneira existe só para não trazer o quadro
     * inteiro do banco para filtrar na memória.
     */
    const candidatos = await prisma.boardCard.findMany({
      where: {
        archived: false,
        assignees: { contains: user.email },
        ...(limpoEm ? { updatedAt: { gt: limpoEm } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: LIMITE * 3,
      select: {
        id: true,
        code: true,
        title: true,
        boardId: true,
        assignees: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const meu = user.email.trim().toLowerCase();

    const notifications = candidatos
      .filter((card) => parseAssignees(card.assignees).some((e) => e.toLowerCase() === meu))
      .slice(0, LIMITE)
      .map((card) => ({
        id: card.id,
        cardId: card.id,
        boardId: card.boardId,
        code: formatCardCode(card.code),
        title: card.title,
        // O texto exato que a aba mostra é montado aqui, e não na tela: é o
        // mesmo servidor que sabe o número da demanda.
        message: formatCardCode(card.code)
          ? `Você foi atribuído à tarefa ${formatCardCode(card.code)}`
          : "Você foi atribuído a uma tarefa",
        at: card.updatedAt.toISOString(),
      }));

    return NextResponse.json({
      success: true,
      notifications,
      clearedAt: notificationsReadAt,
    });
  } catch (error: any) {
    console.error("[Notificações] Falha ao listar:", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível carregar as notificações." },
      { status: 500 }
    );
  }
}

/**
 * Limpar tudo.
 *
 * Grava o instante, e não apaga nada: a demanda continua atribuída a ela, o que
 * some é o aviso. Uma demanda que mudar depois disso volta a aparecer — é uma
 * tarefa dela que mudou, e é justamente o que a aba existe para dizer.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.email) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    const record = await prisma.user.findUnique({
      where: { email: user.email },
      select: { preferences: true },
    });

    const agora = new Date().toISOString();
    const atualizado = mergePreferences(parsePreferences(record?.preferences), {
      notificationsReadAt: agora,
    });

    await prisma.user.update({
      where: { email: user.email },
      data: { preferences: serializePreferences(atualizado) },
    });

    return NextResponse.json({ success: true, clearedAt: agora });
  } catch (error: any) {
    console.error("[Notificações] Falha ao limpar:", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível limpar as notificações." },
      { status: 500 }
    );
  }
}

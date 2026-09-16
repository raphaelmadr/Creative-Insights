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
import {
  isPriority,
  parseValues,
  validateValues,
  parseDueDate,
  startOfCurrentMonth,
  resolveStageAssignee,
  stageAccepts,
  PRIORITY_LABEL,
  type Priority,
} from "@/lib/kanban";
import { intakeColumnId, topPosition, logActivity } from "@/lib/kanban-store";
import { normalizeCardLink } from "@/lib/card-link";

/**
 * O histórico de um card — e o arquivo do quadro.
 *
 * As duas leituras moram na mesma rota porque as duas respondem à mesma
 * pergunta feita em escalas diferentes: "o que aconteceu com isto?". Com
 * `cardId`, a linha do tempo de um card; com `boardId`, tudo que já saiu do
 * quadro — arquivado à mão ou pela regra de fim de mês.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const params = new URL(request.url).searchParams;
    const boardId = params.get("boardId");

    if (boardId) {
      /*
       * Ordenado pela última alteração, que para um card arquivado é o momento
       * em que ele saiu do quadro — o que se procura no arquivo quase sempre é
       * o que saiu por último.
       *
       * O teto de 200 existe porque esta lista só cresce; quando ele começar a
       * ser atingido, o caminho é filtro por período, não um número maior.
       */
      const arquivados = await prisma.boardCard.findMany({
        where: { boardId, archived: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });

      return NextResponse.json({ success: true, cards: arquivados });
    }

    const cardId = params.get("cardId");
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

    /*
     * A exigência de dono vale também na abertura.
     *
     * A regra é da etapa, não do arrasto: se a coluna de entrada exige
     * responsável, uma demanda nascer nela sem dono abriria um buraco por onde
     * passaria justamente o que a regra existe para impedir.
     */
    const entrada = await prisma.boardColumn.findUnique({
      where: { id: columnId },
      select: { name: true, requiresAssignee: true, assignees: true, defaultAssignee: true },
    });

    // O dono padrão da etapa vale já na abertura: uma demanda que nasce na
    // entrada de uma equipe nasce dela, e não à espera de alguém repassar.
    const donoDaEntrada = entrada
      ? resolveStageAssignee(entrada, assigneeAcronym)
      : assigneeAcronym?.trim()?.toUpperCase() || null;

    if (entrada?.requiresAssignee && !stageAccepts(entrada, donoDaEntrada)) {
      return NextResponse.json(
        { error: `"${entrada.name}" exige um responsável da sua equipe. Escolha quem assume esta demanda.`, needsAssignee: true },
        { status: 400 }
      );
    }

    const card = await prisma.boardCard.create({
      data: {
        boardId,
        columnId,
        title: title.trim(),
        description: description?.trim() || null,
        priority: isPriority(priority) ? priority : "MEDIA",
        dueDate: parseDueDate(dueDate),
        assigneeAcronym: donoDaEntrada,
        // Um link inválido entra como nulo em vez de derrubar a abertura da
        // demanda: perder o briefing inteiro por causa de uma URL mal colada
        // seria desproporcional. A tela recusa antes, com a mensagem certa.
        linkUrl: normalizeCardLink(body.linkUrl),
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
        select: { columnId: true, title: true, assigneeAcronym: true },
      });
      if (!card) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

      const target = await prisma.boardColumn.findUnique({
        where: { id: columnId },
        select: {
          name: true,
          isDone: true,
          requiresAssignee: true,
          assignees: true,
          defaultAssignee: true,
        },
      });
      if (!target) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

      /*
       * Quem fica com o card depende da etapa de destino.
       *
       * A sigla pode vir junto com o movimento — é o que a tela manda quando
       * pergunta "quem assume?" na hora de soltar o card. Sobre ela, ou sobre o
       * dono que o card já tinha, a etapa aplica a sua regra: fora da equipe
       * dela, entra o padrão da etapa. É a passagem de bastão acontecendo no
       * gesto que a representa, em vez de depender de alguém lembrar.
       *
       * Ainda assim pode faltar dono — etapa que exige, sem padrão definido. Aí
       * o movimento é recusado com o nome da etapa na mensagem: "não pode" sem
       * dizer o que falta é o que faz a pessoa arrastar de novo achando que o
       * quadro travou.
       */
      const donoNoMovimento =
        typeof body.move.assigneeAcronym === "string" && body.move.assigneeAcronym.trim()
          ? body.move.assigneeAcronym.trim().toUpperCase()
          : null;

      const dono = resolveStageAssignee(target, donoNoMovimento ?? card.assigneeAcronym);

      if (target.requiresAssignee && !stageAccepts(target, dono)) {
        return NextResponse.json(
          {
            error: dono
              ? `"${target.name}" só aceita quem responde por ela. Escolha quem assume antes de mover.`
              : `"${target.name}" exige um responsável. Escolha quem assume antes de mover.`,
            needsAssignee: true,
          },
          { status: 400 }
        );
      }

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
            ...(dono !== card.assigneeAcronym ? { assigneeAcronym: dono } : {}),
          },
        }),
        ...order.map((id: string, index: number) =>
          prisma.boardCard.update({ where: { id }, data: { position: index } })
        ),
      ]);

      if (dono && dono !== card.assigneeAcronym) {
        /*
         * A passagem de bastão automática fica no histórico dizendo que foi
         * automática. Sem a distinção, quem lê o card semanas depois procuraria
         * a pessoa que atribuiu — e não houve nenhuma.
         */
        const comoFoi = donoNoMovimento ? `atribuiu para ${dono}` : `${dono} assumiu por ser o padrão de "${target.name}"`;
        await logActivity(cardId, "ASSIGNED", comoFoi, user);
      }

      if (card.columnId !== columnId) {
        await logActivity(cardId, "MOVED", `moveu para "${target.name}"`, user);
      }

      return NextResponse.json({ success: true });
    }

    /*
     * Tirar do arquivo.
     *
     * Uma entrega de mês passado não volta para a coluna de entrega: a regra de
     * fim de mês a arquivaria de novo no próximo carregamento, e o botão
     * pareceria quebrado. Ela volta **reaberta** — na coluna de entrada, sem
     * data de conclusão —, que é o que alguém quer dizer ao trazer de volta uma
     * peça já entregue: há trabalho a fazer nela outra vez.
     */
    if (body.restore) {
      const { cardId } = body.restore;
      if (!cardId) return NextResponse.json({ error: "cardId é obrigatório." }, { status: 400 });

      const card = await prisma.boardCard.findUnique({ where: { id: cardId } });
      if (!card) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

      const entregaVelha = !!card.completedAt && card.completedAt < startOfCurrentMonth();
      const destino = entregaVelha ? await intakeColumnId(card.boardId) : card.columnId;

      const restaurado = await prisma.boardCard.update({
        where: { id: cardId },
        data: {
          archived: false,
          ...(entregaVelha
            ? { columnId: destino ?? card.columnId, completedAt: null, position: await topPosition(destino ?? card.columnId) }
            : {}),
        },
      });

      await logActivity(
        cardId,
        "UPDATED",
        entregaVelha ? "tirou do arquivo e reabriu a demanda" : "tirou do arquivo",
        user
      );

      return NextResponse.json({ success: true, card: restaurado, reopened: entregaVelha });
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

    const { id, title, description, priority, dueDate, assigneeAcronym, columnId, linkUrl } = body;
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

    /*
     * Trocar a etapa pelo painel do card passa pelas mesmas regras do arrasto.
     * A tela é outra; a etapa é a mesma, e o dia em que as duas divergirem é o
     * dia em que a regra vira folclore.
     */
    let donoPelaEtapa: string | null | undefined;

    if (columnId !== undefined && columnId !== current.columnId) {
      const destino = await prisma.boardColumn.findUnique({
        where: { id: columnId },
        select: { name: true, requiresAssignee: true, assignees: true, defaultAssignee: true },
      });

      const donoPedido =
        assigneeAcronym !== undefined
          ? assigneeAcronym
            ? String(assigneeAcronym).trim().toUpperCase()
            : null
          : current.assigneeAcronym;

      const donoFinal = destino ? resolveStageAssignee(destino, donoPedido) : donoPedido;

      if (destino?.requiresAssignee && !stageAccepts(destino, donoFinal)) {
        return NextResponse.json(
          {
            error: donoFinal
              ? `"${destino.name}" só aceita quem responde por ela. Defina quem assume antes de mudar a etapa.`
              : `"${destino.name}" exige um responsável. Defina quem assume antes de mudar a etapa.`,
            needsAssignee: true,
          },
          { status: 400 }
        );
      }

      if (donoFinal !== current.assigneeAcronym) donoPelaEtapa = donoFinal;
    }

    const card = await prisma.boardCard.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() || null } : {}),
        ...(priority !== undefined && isPriority(priority) ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: parseDueDate(dueDate) } : {}),
        // A etapa de destino tem a última palavra sobre o dono: foi ela quem
        // resolveu a equipe e o padrão logo acima.
        ...(donoPelaEtapa !== undefined
          ? { assigneeAcronym: donoPelaEtapa }
          : assigneeAcronym !== undefined
            ? { assigneeAcronym: assigneeAcronym ? String(assigneeAcronym).toUpperCase() : null }
            : {}),
        ...(columnId !== undefined ? { columnId } : {}),
        // `null` explícito remove o link; ausente não mexe nele.
        ...(linkUrl !== undefined ? { linkUrl: normalizeCardLink(linkUrl) } : {}),
        values,
      },
    });

    /*
     * O histórico registra as mudanças que alguém vai querer explicar depois —
     * quem assumiu e o quanto a prioridade subiu. Um evento "atualizou o card"
     * a cada tecla não informa nada e enterra os que informam.
     */
    const donoRegistrado =
      donoPelaEtapa !== undefined
        ? donoPelaEtapa
        : assigneeAcronym !== undefined
          ? assigneeAcronym
            ? String(assigneeAcronym).toUpperCase()
            : null
          : current.assigneeAcronym;

    if (donoRegistrado !== current.assigneeAcronym) {
      await logActivity(
        id,
        "ASSIGNED",
        donoRegistrado ? `atribuiu para ${donoRegistrado}` : "removeu o responsável",
        user
      );
    }
    /*
     * O link entra no histórico porque ele é o endereço das artes: "onde estão
     * os arquivos?" é a pergunta que alguém faz semanas depois, e saber quem o
     * trocou e quando responde antes de ter de perguntar.
     */
    if (linkUrl !== undefined) {
      const novo = normalizeCardLink(linkUrl);
      if (novo !== current.linkUrl) {
        await logActivity(
          id,
          "UPDATED",
          novo ? (current.linkUrl ? "trocou o link das artes" : "anexou o link das artes") : "removeu o link das artes",
          user
        );
      }
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

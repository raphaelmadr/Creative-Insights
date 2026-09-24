/**
 * Os quadros do Kanban.
 *
 * A leitura devolve o quadro inteiro — colunas, campos e cards — numa consulta
 * só. Em três chamadas separadas a tela pisca montada pela metade, com as
 * colunas já desenhadas e os cards chegando depois.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import {
  ensureDefaultBoard,
  archiveDeliveredBeforeThisMonth,
  boardPulse,
  comCamposDeFabrica,
  BOARD_INCLUDE,
} from "@/lib/kanban-store";
import {
  serializeCardBadges,
  serializeCardPanel,
  serializeFormBuiltins,
} from "@/lib/kanban";

export async function GET(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    await ensureDefaultBoard();

    const url = new URL(request.url);
    const boardId = url.searchParams.get("boardId");

    /*
     * A lista de quadros e o quadro pedido saem JUNTOS.
     *
     * A lista só existe para o seletor do topo; quem decide o que carregar é o
     * `boardId` que a tela manda — e ela manda em toda visita depois da
     * primeira. Esperar a lista para só então começar a ler o quadro era uma
     * ida ao banco de espera pura, com a resposta da outra já disponível.
     *
     * O pedido é conferido pelo próprio registro (`archived`), e não pela
     * lista: assim as duas leituras não dependem uma da outra.
     */
    const [boards, pedido] = await Promise.all([
      prisma.board.findMany({
        where: { archived: false },
        orderBy: { position: "asc" },
        select: { id: true, name: true, description: true, receivesCopy: true, position: true },
      }),
      boardId
        ? prisma.board.findUnique({ where: { id: boardId }, include: BOARD_INCLUDE })
        : Promise.resolve(null),
    ]);

    // Sem quadro pedido, abre o primeiro: é o que a pessoa via da última vez em
    // 99% das visitas, e escolher um quadro antes de ver qualquer coisa é uma
    // pergunta a mais para quem só quer olhar o andamento.
    const valido = pedido && !pedido.archived ? pedido : null;
    const activeId = valido?.id ?? boards[0]?.id;

    /* Só relê quando o palpite não serviu — quadro arquivado, id inventado, ou
       nenhum id pedido. */
    const bruto =
      valido ??
      (activeId ? await prisma.board.findUnique({ where: { id: activeId }, include: BOARD_INCLUDE }) : null);

    const board = activeId ? comCamposDeFabrica(bruto) : null;

    /*
     * As entregas de meses anteriores saem do quadro antes de ele ser lido.
     *
     * Antes da consulta, e não depois: lendo primeiro, a tela receberia nesta
     * visita os cards que acabaram de ser arquivados, e eles só desapareceriam
     * no recarregamento seguinte.
     */
    /* As etapas vão junto: o quadro acabou de ser lido, e relê-las só para
       saber quais são de entrega seria uma ida ao banco por visita. */
    if (activeId) await archiveDeliveredBeforeThisMonth(activeId, board?.columns ?? []);

    /*
     * Cards, contagem do arquivo e pulso: três perguntas independentes, feitas
     * de uma vez. Em fila, cada uma esperava a anterior por nada — nenhuma
     * depende do resultado da outra.
     *
     * A contagem do arquivo alimenta o card fixo do quadro; é mais barata que
     * trazer as linhas, e é tudo o que a frente precisa saber.
     *
     * O pulso sai junto com os dados, e não numa chamada à parte, porque a tela
     * precisa dos dois casados: guardando um pulso lido depois, ela recarregaria
     * o quadro por causa da própria leitura, em laço.
     */
    const [cards, archivedCount, pulse] = activeId
      ? await Promise.all([
          prisma.boardCard.findMany({
            where: { boardId: activeId, archived: false },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          }),
          prisma.boardCard.count({ where: { boardId: activeId, archived: true } }),
          boardPulse(activeId),
        ])
      : [[], 0, null];

    return NextResponse.json({ success: true, boards, board, cards, archivedCount, pulse });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

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

    return NextResponse.json({ success: true, board: comCamposDeFabrica(board) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const {
      id,
      name,
      description,
      receivesCopy,
      cardBadges,
      cardPanel,
      formBuiltins,
      publicLink,
    } = await request.json();
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
         * As perguntas fixas, pelo mesmo caminho e pelo mesmo motivo: a lista
         * vem da tela, o catálogo manda na ordem, e `[]` — nenhuma pergunta
         * fixa — precisa virar texto, senão a próxima leitura entenderia que
         * ninguém configurou e traria todas de volta.
         */
        ...(formBuiltins !== undefined
          ? { formBuiltins: serializeFormBuiltins(formBuiltins) }
          : {}),
        ...(cardPanel !== undefined ? { cardPanel: serializeCardPanel(cardPanel) } : {}),
        /*
         * O link público, ligado ou desligado — e o código vem do servidor,
         * nunca do corpo da requisição.
         *
         * Se a tela pudesse escolher o valor, quem manda a requisição escolhe
         * o dele: bastaria pedir `publicLink: "aaa"` para ter uma porta com
         * senha conhecida. "rotate" também é o desfazer de um vazamento —
         * gerar outro invalida o anterior na mesma escrita.
         */
        ...(publicLink === "rotate" ? { publicToken: randomBytes(16).toString("hex") } : {}),
        ...(publicLink === "revoke" ? { publicToken: null } : {}),
      },
      include: BOARD_INCLUDE,
    });

    return NextResponse.json({ success: true, board: comCamposDeFabrica(board) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

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

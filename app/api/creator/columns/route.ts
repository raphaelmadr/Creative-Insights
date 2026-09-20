/**
 * As colunas de um quadro — as etapas do fluxo.
 *
 * A edição mora na própria tela do Kanban, e não no painel de configurações:
 * quem reorganiza as etapas é quem trabalha no quadro, e mandá-lo a outra tela
 * para renomear "Em revisão" é atrito num ajuste de dez segundos.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { boardId, name, color } = await request.json();
    if (!boardId || !name?.trim()) {
      return NextResponse.json({ error: "Quadro e nome são obrigatórios." }, { status: 400 });
    }

    const last = await prisma.boardColumn.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const column = await prisma.boardColumn.create({
      data: {
        boardId,
        name: name.trim(),
        color: color || null,
        position: (last?.position ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, column });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const body = await request.json();

    /*
     * Reordenar é uma lista inteira, numa transação.
     *
     * Uma coluna por requisição deixaria o quadro com duas etapas na mesma
     * posição entre uma chamada e a outra — e é exatamente nesse intervalo que
     * outra pessoa carrega a página e vê a ordem errada.
     */
    if (Array.isArray(body.order)) {
      /*
       * Cada item é um id, ou `{ id, groupId }` quando o arrasto também mudou a
       * fase da etapa.
       *
       * As duas coisas viajam juntas de propósito: arrastar uma etapa para
       * dentro de outra faixa é um gesto só, e gravá-lo em duas chamadas deixa
       * um intervalo em que a etapa está na posição nova com a fase velha —
       * exatamente a combinação que `groupColumns` desfaz, puxando-a de volta
       * para perto das irmãs. Quem recarregasse a página nesse instante veria o
       * arrasto ter sido ignorado.
       */
      const itens: { id: string; groupId?: string | null }[] = body.order.map(
        (item: unknown) => (typeof item === "string" ? { id: item } : item)
      );

      if (itens.some((i) => !i?.id)) {
        return NextResponse.json(
          { error: "Cada item da ordem precisa de um id." },
          { status: 400 }
        );
      }

      await prisma.$transaction(
        itens.map((item, index) =>
          prisma.boardColumn.update({
            where: { id: item.id },
            data: {
              position: index,
              ...(item.groupId !== undefined ? { groupId: item.groupId || null } : {}),
            },
          })
        )
      );
      return NextResponse.json({ success: true });
    }

    const {
      id,
      name,
      color,
      description,
      requiresAssignee,
      groupId,
      isIntake,
      isDone,
      isProduction,
      wipLimit,
    } = body;
    if (!id) return NextResponse.json({ error: "ID da coluna é obrigatório." }, { status: 400 });

    const current = await prisma.boardColumn.findUnique({
      where: { id },
      select: { boardId: true, groupId: true },
    });
    if (!current) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

    /*
     * O padrão precisa ser da equipe da etapa.
     *
     * Um padrão de fora seria atribuído a cada card que chegasse, e o mesmo
     * seletor que se recusa a oferecer aquela pessoa a mostraria como dona —
     * a regra se contradizendo dentro da mesma coluna. Quando a equipe muda na
     * mesma requisição, vale a equipe nova; quando não, a que já estava.
     */

    /*
     * Equipe e responsável padrão NÃO se configuram aqui.
     *
     * Eles moram na fase (`BoardGroup`), porque a fase é o time: "Produção"
     * nomeia um conjunto de pessoas tanto quanto um trecho do fluxo. Repetir a
     * mesma equipe em cada etapa dela era descrever três vezes o mesmo fato — e
     * garantir que um dia as três divergissem. Ver `ownershipOf`.
     *
     * A etapa ainda decide se EXIGE dono (`requiresAssignee`): quem pode
     * assumir é da fase, se aqui pode entrar sem ninguém é do ponto do fluxo.
     */

    /*
     * Uma entrada por GRUPO, não por quadro: com duas no mesmo grupo, a
     * demanda cairia na que a ordenação devolvesse primeiro, que não é uma
     * escolha de ninguém. Grupos diferentes têm cada um a sua — é o que deixa
     * o grupo mais cedo do quadro recebendo demanda nova (ver
     * `intakeColumnId`) e, ao mesmo tempo, qualquer outro grupo marcando onde
     * uma passagem de bastão pousa (ver o gatilho do aviso no Slack).
     *
     * `groupId` pode estar mudando NESTA mesma gravação — usa o valor novo
     * quando veio, senão o que a etapa já tinha.
     */
    if (isIntake === true) {
      const grupoAlvo = groupId !== undefined ? groupId || null : current.groupId;
      await prisma.boardColumn.updateMany({
        where: { boardId: current.boardId, groupId: grupoAlvo, isIntake: true, NOT: { id } },
        data: { isIntake: false },
      });
    }

    const column = await prisma.boardColumn.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(color !== undefined ? { color: color || null } : {}),
        ...(description !== undefined
          ? { description: String(description).trim().slice(0, 500) || null }
          : {}),
        ...(requiresAssignee !== undefined ? { requiresAssignee: !!requiresAssignee } : {}),
        ...(groupId !== undefined ? { groupId: groupId || null } : {}),
        ...(isIntake !== undefined ? { isIntake: !!isIntake } : {}),
        ...(isDone !== undefined ? { isDone: !!isDone } : {}),
        ...(isProduction !== undefined ? { isProduction: !!isProduction } : {}),
        ...(wipLimit !== undefined
          ? { wipLimit: wipLimit === null || wipLimit === "" ? null : Number(wipLimit) }
          : {}),
      },
    });

    return NextResponse.json({ success: true, column });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID da coluna é obrigatório." }, { status: 400 });

    const column = await prisma.boardColumn.findUnique({
      where: { id },
      select: { boardId: true, groupId: true, isIntake: true, _count: { select: { cards: true } } },
    });
    if (!column) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

    const siblings = await prisma.boardColumn.count({ where: { boardId: column.boardId } });
    if (siblings <= 1) {
      return NextResponse.json({ error: "O quadro precisa de pelo menos uma coluna." }, { status: 400 });
    }

    /*
     * Os cards mudam de coluna antes; a exclusão em cascata os levaria junto.
     *
     * Apagar uma etapa é dizer "esta fase não existe mais", não "o trabalho que
     * estava nela não aconteceu" — e o cascade do banco não sabe a diferença.
     */
    if (column._count.cards > 0) {
      const fallback = await prisma.boardColumn.findFirst({
        where: { boardId: column.boardId, NOT: { id } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      if (fallback) {
        await prisma.boardCard.updateMany({ where: { columnId: id }, data: { columnId: fallback.id } });
      }
    }

    await prisma.boardColumn.delete({ where: { id } });

    /*
     * A coluna apagada podia ser a entrada do GRUPO dela; sem outra marcada
     * ali, esse grupo fica sem destino certo pra quem chegar nele. Só importa
     * se a apagada ERA a entrada — apagar qualquer outra etapa não muda nada
     * pra esse grupo. E só faz sentido promover outra do MESMO grupo: uma
     * entrada de "Growth" não é resposta pra "Criação" ter ficado sem a sua.
     */
    if (column.isIntake) {
      const stillHasIntake = await prisma.boardColumn.count({
        where: { boardId: column.boardId, groupId: column.groupId, isIntake: true },
      });
      if (stillHasIntake === 0) {
        const first = await prisma.boardColumn.findFirst({
          where: { boardId: column.boardId, groupId: column.groupId },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        if (first) await prisma.boardColumn.update({ where: { id: first.id }, data: { isIntake: true } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

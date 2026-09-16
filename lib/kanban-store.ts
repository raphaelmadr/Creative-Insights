/**
 * O acesso ao Kanban no banco — e as invariantes que o quadro precisa manter.
 *
 * Separado de `lib/kanban.ts`, que é vocabulário puro e roda também no
 * navegador. Aqui é onde o Prisma entra, e onde vivem as três regras que
 * nenhuma tela deve ter de lembrar: todo quadro tem uma coluna de entrada, todo
 * card entra no topo dela, e toda mudança deixa rastro.
 */

import { createHash } from "node:crypto";
import prisma from "./prisma";
import { DEFAULT_BOARD, parseAssignees, startOfCurrentMonth, uniqueFieldKey } from "./kanban";

/** O quadro inteiro, do jeito que a tela consome. */
export const BOARD_INCLUDE = {
  columns: { orderBy: { position: "asc" } },
  fields: { orderBy: { position: "asc" } },
  groups: { orderBy: { position: "asc" } },
} as const;

/**
 * Cria o quadro inicial quando ainda não existe nenhum.
 *
 * Chamado na leitura, e não por um seed manual: o banco é o mesmo em
 * desenvolvimento e em produção, e um seed que precisa ser lembrado é um seed
 * que não roda no dia da estreia.
 */
export async function ensureDefaultBoard() {
  const existing = await prisma.board.count();
  if (existing > 0) return;

  const keys = new Set<string>();

  await prisma.board.create({
    data: {
      name: DEFAULT_BOARD.name,
      description: DEFAULT_BOARD.description,
      receivesCopy: DEFAULT_BOARD.receivesCopy,
      position: 0,
      columns: {
        create: DEFAULT_BOARD.columns.map((c, i) => ({
          name: c.name,
          color: c.color,
          isIntake: c.isIntake,
          isDone: c.isDone,
          position: i,
        })),
      },
      fields: {
        create: DEFAULT_BOARD.fields.map((f, i) => {
          const key = uniqueFieldKey(f.label, keys);
          keys.add(key);
          return {
            key,
            label: f.label,
            type: f.type,
            required: f.required,
            placeholder: "placeholder" in f ? f.placeholder : null,
            options: "options" in f && f.options ? JSON.stringify(f.options) : null,
            showOnCard: f.showOnCard,
            position: i,
          };
        }),
      },
    },
  });
}

/**
 * A coluna onde uma demanda nova deve cair.
 *
 * Preferência pela marcada como entrada; na falta dela, a primeira da ordem.
 * O recuo existe porque a marca pode ser removida na edição de colunas, e uma
 * demanda sem destino seria perdida em silêncio no momento em que a pessoa
 * aperta "Enviar".
 */
export async function intakeColumnId(boardId: string): Promise<string | null> {
  const intake = await prisma.boardColumn.findFirst({
    where: { boardId, isIntake: true },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (intake) return intake.id;

  const first = await prisma.boardColumn.findFirst({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

/**
 * A posição do topo de uma coluna.
 *
 * Negativa de propósito: inserir no topo sem reescrever a posição de todos os
 * cards abaixo. O arrasto normaliza a coluna inteira depois, então os buracos
 * que isso abre na numeração não duram.
 */
export async function topPosition(columnId: string): Promise<number> {
  const first = await prisma.boardCard.findFirst({
    where: { columnId, archived: false },
    orderBy: { position: "asc" },
    select: { position: true },
  });
  return (first?.position ?? 0) - 1;
}

export interface Actor {
  name?: string | null;
  email?: string | null;
}

/** Registra um evento no histórico do card. Nunca derruba a ação principal. */
export async function logActivity(
  cardId: string,
  type: string,
  message: string,
  actor?: Actor
) {
  try {
    await prisma.cardActivity.create({
      data: {
        cardId,
        type,
        message,
        authorEmail: actor?.email ?? null,
        authorName: actor?.name ?? null,
      },
    });
  } catch (error) {
    /*
     * O histórico é registro, não a operação. Um card movido cujo evento falhou
     * ao gravar continua movido — devolver erro aqui faria a tela desfazer um
     * arrasto que de fato aconteceu no banco.
     */
    console.error("Falha ao registrar atividade do card:", error);
  }
}

/** O quadro que recebe as copys geradas, com a sua coluna de entrada. */
export async function copyTargetBoard() {
  await ensureDefaultBoard();

  const board =
    (await prisma.board.findFirst({
      where: { receivesCopy: true, archived: false },
      orderBy: { position: "asc" },
    })) ??
    (await prisma.board.findFirst({
      where: { archived: false },
      orderBy: { position: "asc" },
    }));

  if (!board) return null;

  const columnId = await intakeColumnId(board.id);
  return columnId ? { board, columnId } : null;
}

/**
 * Arquiva o que foi entregue em meses anteriores.
 *
 * A regra é a do negócio: uma entrega fica no quadro pelo mês inteiro em que
 * aconteceu — é o que deixa a coluna final responder "o que a equipe produziu
 * este mês" — e sai quando o mês vira. Sem isso a coluna de entrega só cresce, e
 * em oito semanas ninguém mais rola até o fim dela.
 *
 * Roda na leitura do quadro, e não num cron, pelo mesmo motivo de
 * `ensureDefaultBoard`: uma regra que depende de um disparador externo é uma
 * regra que não valeu no dia em que o disparador falhou. Aqui ela vale sempre
 * que alguém olha — que é exatamente quando ela precisa estar valendo.
 *
 * Arquivar não apaga: o card sai do quadro com briefing, copy, anexos e
 * histórico intactos.
 */
export async function archiveDeliveredBeforeThisMonth(boardId: string): Promise<number> {
  const inicioDoMes = startOfCurrentMonth();

  const vencidos = await prisma.boardCard.findMany({
    where: {
      boardId,
      archived: false,
      // `completedAt` é carimbado ao entrar na coluna de entrega e apagado ao
      // sair dela: um card que voltou para revisão não é uma entrega antiga.
      completedAt: { lt: inicioDoMes },
    },
    select: { id: true },
  });

  if (!vencidos.length) return 0;

  const ids = vencidos.map((c) => c.id);

  await prisma.$transaction([
    prisma.boardCard.updateMany({ where: { id: { in: ids } }, data: { archived: true } }),
    /*
     * O histórico diz por que o card sumiu do quadro. Sem autor, porque não
     * houve um: um evento assinado por quem por acaso abriu a página naquele
     * segundo seria pior do que evento nenhum.
     */
    prisma.cardActivity.createMany({
      data: ids.map((cardId) => ({
        cardId,
        type: "UPDATED",
        message: "arquivada automaticamente — entrega de um mês anterior",
      })),
    }),
  ]);

  return ids.length;
}

/**
 * Uma impressão digital curta do estado do quadro no banco.
 *
 * Serve para responder "mudou alguma coisa?" sem transportar o quadro inteiro.
 * O Kanban é uma esteira usada por várias pessoas ao mesmo tempo, e quem está
 * com a tela aberta precisa ver o card chegar sem recarregar a página; manter
 * uma conexão aberta por aba não é opção nesta hospedagem, que tem 20 processos
 * de entrada para a conta toda.
 *
 * Fica aqui, e não na rota, porque quem lê o quadro também precisa devolver o
 * pulso junto com os dados. Calculado nos dois lugares, ele divergiria, e a
 * tela recarregaria em laço por causa da própria leitura.
 */
export async function boardPulse(boardId: string): Promise<string | null> {
  const [quadro, cards, grupos, etapas] = await Promise.all([
    prisma.board.findUnique({ where: { id: boardId }, select: { updatedAt: true } }),

    /*
     * `_max(updatedAt)` pega qualquer edição; `_count` pega o que a data não
     * revela, porque um card excluído não deixa carimbo para trás. Juntos,
     * cobrem criar, mover, editar, arquivar e excluir.
     */
    prisma.boardCard.aggregate({ where: { boardId }, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.boardGroup.aggregate({ where: { boardId }, _count: { _all: true }, _max: { updatedAt: true } }),

    /*
     * Etapa não tem `updatedAt`, então as linhas inteiras entram numa soma de
     * verificação. São poucas — uma dúzia —, e ler todas evita manter uma lista
     * de campos que alguém esqueceria de atualizar ao criar o próximo: renomear
     * uma etapa, trocar a cor ou arrastá-la de lugar precisa chegar aos outros
     * tanto quanto mover um card.
     */
    prisma.boardColumn.findMany({ where: { boardId }, orderBy: { id: "asc" } }),
  ]);

  if (!quadro) return null;

  const etapasHash = createHash("sha1").update(JSON.stringify(etapas)).digest("hex").slice(0, 12);

  return [
    quadro.updatedAt.getTime(),
    cards._count._all,
    cards._max.updatedAt?.getTime() ?? 0,
    grupos._count._all,
    grupos._max.updatedAt?.getTime() ?? 0,
    etapasHash,
  ].join("-");
}

/**
 * Onde uma demanda nova entra no quadro, e quem a assume.
 *
 * Existe uma regra só, e ela mora aqui porque há duas portas para o quadro: o
 * formulário de demanda e o gerador de copy. Escrita duas vezes, ela divergiria
 * — e divergiu antes, quando o formulário mandava um campo que o servidor já
 * tinha deixado de ler e a escolha de responsável era silenciosamente ignorada.
 *
 * A regra: quem abre escolhe o **grupo**, não a etapa. O card cai na primeira
 * etapa daquele grupo, que é onde o time procura o que chegou, e nasce do time
 * inteiro — ninguém foi eleito ainda, o que aconteceu é que há trabalho novo na
 * fila e todos precisam vê-lo.
 *
 * Sem grupo escolhido, vale a coluna de entrada do quadro, como sempre.
 */
export async function groupIntake(
  boardId: string,
  escolha: { groupId?: string | null; columnId?: string | null } = {}
): Promise<{ columnId: string; assignees: string[] } | null> {
  const doGrupo = escolha.groupId
    ? await prisma.boardColumn.findFirst({
        where: { boardId, groupId: String(escolha.groupId) },
        orderBy: { position: "asc" },
        select: { id: true },
      })
    : null;

  const columnId = escolha.columnId || doGrupo?.id || (await intakeColumnId(boardId));
  if (!columnId) return null;

  /*
   * A equipe vem do grupo da coluna de destino, e não do grupo pedido: com uma
   * coluna informada à mão, as duas coisas podem ser diferentes, e quem manda é
   * onde o card foi parar.
   */
  const destino = await prisma.boardColumn.findUnique({
    where: { id: columnId },
    select: { group: { select: { assignees: true } } },
  });

  return { columnId, assignees: parseAssignees(destino?.group?.assignees) };
}

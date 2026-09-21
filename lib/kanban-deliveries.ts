/**
 * A medição de entregas, a partir do quadro.
 *
 * Antes a fonte era o Slack: alguém escrevia "entreguei 8 peças" num canal e a
 * sincronização lia a mensagem. Dependia de lembrar de avisar, e do aviso estar
 * escrito de um jeito que o analisador entendesse — quem entregava e esquecia
 * de postar simplesmente não aparecia no ranking.
 *
 * Agora a entrega é um fato do próprio trabalho: alguém registra o que
 * entregou no módulo de entrega, dentro do card — subindo os arquivos ou
 * apontando o endereço —, e é esse ato que conta. Quem registra é quem
 * produziu, e a quantidade é o que foi de fato entregue.
 *
 * Por um tempo o gatilho foi o card CHEGAR à coluna de conclusão, com a
 * quantidade saindo de um campo do formulário. Dois problemas: creditava
 * quem arrastou o card, que pode ser do time seguinte, e o número vinha de
 * uma resposta editável, adivinhada pelo nome do campo.
 *
 * O movimento para a conclusão ainda importa, mas só para acender a luz
 * quando ele acontece sem entrega registrada — ver `avisarEntregaSemRegistro`.
 */

import prisma from "./prisma";
import { logWarning } from "./logger";

/**
 * Credita a entrega a quem a registrou no módulo.
 *
 * O crédito nasce do ENVIO, e não do movimento do card. Quem sobe as peças —
 * ou registra o link — é quem as produziu; quem arrasta o card depois pode ser
 * qualquer pessoa do time seguinte, e creditá-la premiava o gesto errado.
 *
 * A quantidade vem do que foi realmente entregue, contada em PEÇAS e não em
 * arquivos: um estático é feed + story, dois arquivos para uma peça só. Antes
 * ela saía de um campo numérico do formulário adivinhado pelo nome, que
 * contava por sorte e podia ser editado depois da entrega.
 *
 * Conta UMA VEZ, para sempre. `sourceKey` é único por card, então reenviar o
 * lote, mover o card, devolvê-lo à etapa anterior ou arquivá-lo no fim do mês
 * não somam nada — e também não tiram. O registro é um fato datado, não um
 * espelho do estado atual do quadro.
 */
export async function creditarEntregaDoModulo(params: {
  cardId: string;
  title: string;
  /** Peças efetivamente entregues. Um link vale 1. */
  pieces: number;
  /** Quem registrou a entrega — o e-mail de quem estava na tela. */
  email: string | null;
}): Promise<void> {
  if (!params.email) {
    await logWarning(
      "ENTREGAS",
      `A entrega de "${params.title}" foi registrada sem identificar quem a enviou — a volumetria não entrou no ranking.`,
      "lib/kanban-deliveries.ts"
    );
    return;
  }

  const creator = await prisma.creator.findUnique({
    where: { userEmail: params.email },
    select: { id: true },
  });

  if (!creator) {
    await logWarning(
      "ENTREGAS",
      `${params.email} registrou a entrega de "${params.title}", mas não há criador com esse e-mail vinculado — a volumetria não entrou no ranking. Vincule a conta em Configurações › Equipe.`,
      "lib/kanban-deliveries.ts"
    );
    return;
  }

  try {
    await prisma.delivery.create({
      data: {
        sourceKey: `kanban:${params.cardId}`,
        cardId: params.cardId,
        creatorId: creator.id,
        pieces: Math.max(1, Math.floor(params.pieces) || 1),
        date: new Date(),
        text: params.title,
      },
    });
  } catch (error: unknown) {
    // P2002 = já há entrega registrada para este card. É o reenvio, e é
    // exatamente o que a chave única existe para impedir.
    if ((error as { code?: string })?.code !== "P2002") throw error;
  }
}

/**
 * Avisa quando um card conclui sem entrega registrada.
 *
 * Não credita nada — só acende a luz. Desde que o crédito passou a nascer do
 * módulo, um card que chega à conclusão sem ninguém ter registrado a entrega
 * é volumetria perdida: o trabalho aconteceu e não vai aparecer em ranking
 * nenhum. Silencioso, isso só seria descoberto no fim do mês, olhando um
 * número menor do que a equipe esperava.
 */
export async function avisarEntregaSemRegistro(params: {
  cardId: string;
  title: string;
  /** A coluna de destino conclui o fluxo? */
  destinoConclui: boolean;
  /** A coluna de origem já concluía? Então não é uma conclusão nova. */
  origemConcluia: boolean;
}): Promise<void> {
  if (!params.destinoConclui || params.origemConcluia) return;

  const jaTem = await prisma.delivery.findUnique({
    where: { sourceKey: `kanban:${params.cardId}` },
    select: { id: true },
  });
  if (jaTem) return;

  await logWarning(
    "ENTREGAS",
    `"${params.title}" chegou à etapa de conclusão sem entrega registrada no módulo — a volumetria não foi contada para ninguém.`,
    "lib/kanban-deliveries.ts"
  );
}

/**
 * Peças entregues por criador, no intervalo.
 *
 * A régua é a DATA DO REGISTRO da entrega, e não o `completedAt` do card.
 *
 * Era o contrário, e tinha um buraco: `completedAt` é zerado toda vez que o
 * card sai de uma coluna de conclusão — inclusive quando ele só segue viagem
 * para o grupo seguinte. A entrega era creditada e, no arrasto seguinte,
 * sumia da contagem sem ninguém ter desfeito nada. Quem olhasse o ranking
 * depois do handoff via um número menor do que tinha visto na véspera.
 *
 * Com a data do registro, uma entrega contada está contada: mover, devolver,
 * reabrir ou arquivar não mexem mais nela. É o que a torna um fato, e não uma
 * fotografia do estado atual do quadro.
 *
 * Soma tudo o que está no livro de entregas do período, seja qual for a
 * origem — o que veio do módulo hoje e o que ficou de registros anteriores.
 * Uma entrega é uma entrega.
 */
export async function pecasEntreguesPorCriador(
  startDate: Date,
  endDate: Date
): Promise<Map<string, number>> {
  const linhas = await prisma.delivery.groupBy({
    by: ["creatorId"],
    where: { date: { gte: startDate, lte: endDate } },
    _sum: { pieces: true },
  });

  return new Map(linhas.map((l) => [l.creatorId, l._sum.pieces ?? 0]));
}

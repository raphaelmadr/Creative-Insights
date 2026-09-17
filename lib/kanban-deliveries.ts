/**
 * A medição de entregas, a partir do quadro.
 *
 * Antes a fonte era o Slack: alguém escrevia "entreguei 8 peças" num canal e a
 * sincronização lia a mensagem. Dependia de lembrar de avisar, e do aviso estar
 * escrito de um jeito que o analisador entendesse — quem entregava e esquecia
 * de postar simplesmente não aparecia no ranking.
 *
 * Agora a entrega é um fato do quadro: o card chega à coluna de conclusão. O
 * trabalho já é organizado ali, então medir ali não pede nenhum passo novo de
 * ninguém.
 */

import prisma from "./prisma";
import { parseValues } from "./kanban";
import { logWarning } from "./logger";

/**
 * As chaves que costumam guardar a volumetria, em ordem de preferência.
 *
 * O campo é configurável por quadro, então não há um nome garantido. Quando
 * nenhuma delas existe, vale o único campo numérico do quadro — e "único" é a
 * parte que importa: com dois, adivinhar qual é a volumetria seria inventar uma
 * regra que ninguém escreveu, e a contagem volta a ser 1 por card.
 */
const CHAVES_DE_VOLUMETRIA = ["numero_de_pecas", "pecas", "volumetria", "quantidade"];

/**
 * Quantas peças esta demanda entregou.
 *
 * Sem campo preenchido, vale 1: um card entregue é uma coisa entregue, e
 * devolver zero faria a entrega desaparecer do relatório justamente por uma
 * pergunta que ficou em branco.
 */
export async function volumetriaDoCard(
  boardId: string,
  values: string | null
): Promise<number> {
  const respostas = parseValues(values);

  const numericos = await prisma.boardField.findMany({
    // `RANGE` junto: a quantidade de peças virou deslizante, e procurar só por
    // `NUMBER` faria toda entrega passar a contar 1.
    where: { boardId, type: { in: ["NUMBER", "RANGE"] } },
    orderBy: { position: "asc" },
    select: { key: true },
  });

  const chave =
    CHAVES_DE_VOLUMETRIA.find((c) => numericos.some((f) => f.key === c)) ??
    (numericos.length === 1 ? numericos[0].key : null);

  if (!chave) return 1;

  const bruto = respostas[chave];
  const numero = typeof bruto === "number" ? bruto : Number(String(bruto ?? "").trim());

  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 1;
}

/**
 * Registra a entrega de um card que acabou de chegar à coluna de conclusão.
 *
 * O crédito vai para QUEM MOVEU o card, que é a decisão do quadro: mover para
 * entregue é o ato de declarar a entrega.
 *
 * Silenciosa em três casos, todos deliberados:
 *
 * - O card não mudou para uma coluna de conclusão. Nada aconteceu.
 * - Quem moveu não tem ficha de criador ligada ao e-mail. O ranking é por
 *   criador, e não há a quem creditar — vira aviso no painel de logs, e não
 *   exceção, porque derrubar o arrasto do card por causa disso seria
 *   desproporcional: o movimento é legítimo, só não é contabilizável.
 * - O card já foi entregue antes. `sourceKey` é único por card, então voltar à
 *   revisão e avançar de novo não conta duas vezes.
 */
export async function registrarEntregaDoCard(params: {
  cardId: string;
  boardId: string;
  title: string;
  values: string | null;
  /** A coluna de destino conclui o fluxo? */
  destinoConclui: boolean;
  /** A coluna de origem já concluía? Então não houve entrega nova. */
  origemConcluia: boolean;
  /** E-mail de quem arrastou o card. */
  movidoPor: string | null;
}): Promise<void> {
  if (!params.destinoConclui || params.origemConcluia) return;

  if (!params.movidoPor) {
    await logWarning(
      "ENTREGAS",
      `Card "${params.title}" chegou à coluna de entrega sem sessão identificada — não foi possível creditar a volumetria.`,
      "lib/kanban-deliveries.ts"
    );
    return;
  }

  const creator = await prisma.creator.findUnique({
    where: { userEmail: params.movidoPor },
    select: { id: true },
  });

  if (!creator) {
    await logWarning(
      "ENTREGAS",
      `${params.movidoPor} entregou "${params.title}", mas não há criador com esse e-mail vinculado — a volumetria não entrou no ranking. Vincule a conta em Configurações › Equipe.`,
      "lib/kanban-deliveries.ts"
    );
    return;
  }

  const pieces = await volumetriaDoCard(params.boardId, params.values);

  try {
    await prisma.delivery.create({
      data: {
        sourceKey: `kanban:${params.cardId}`,
        cardId: params.cardId,
        creatorId: creator.id,
        pieces,
        date: new Date(),
        text: params.title,
      },
    });
  } catch (error: unknown) {
    // P2002 = já existe entrega para este card. É o caso do card que volta e
    // avança de novo, e é exatamente o que a chave única existe para impedir.
    if ((error as { code?: string })?.code !== "P2002") throw error;
  }
}

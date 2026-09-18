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
  values: string | null,
  /** Para a frase do aviso dizer de qual demanda se trata. */
  titulo?: string
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

  /*
   * Não saber qual campo é a volumetria não pode ser silencioso.
   *
   * Com dois ou mais campos numéricos e nenhum com nome conhecido, a função
   * desiste e conta 1 por card — que é a decisão certa (adivinhar seria
   * inventar uma regra que ninguém escreveu), mas era tomada sem deixar
   * rastro: o ranking passava a somar cards em vez de peças, e ninguém tinha
   * como descobrir por quê.
   *
   * Só avisa no caso AMBÍGUO. Um quadro sem campo numérico nenhum não pergunta
   * quantidade, e contar 1 por card ali é o comportamento pretendido, não um
   * defeito a reportar.
   */
  if (!chave && numericos.length > 1) {
    await logWarning(
      "ENTREGAS",
      `O quadro tem ${numericos.length} campos numéricos (${numericos
        .map((f) => f.key)
        .join(", ")}) e nenhum com nome reconhecido como volumetria, então ` +
        `${titulo ? `"${titulo}"` : "a entrega"} contou 1 peça. Renomeie o campo ` +
        `de quantidade para uma destas chaves: ${CHAVES_DE_VOLUMETRIA.join(", ")}.`,
      "lib/kanban-deliveries.ts"
    );
  }

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
/**
 * Acerta a volumetria de uma entrega JÁ registrada, quando a resposta muda.
 *
 * `Delivery.pieces` é uma fotografia: vale o que o card respondia no instante
 * em que chegou à coluna de entrega. Isso bastava enquanto a resposta era
 * imutável depois da abertura — e deixou de bastar quando quem produz a peça
 * passou a poder corrigi-la no painel do card, que é justamente quando o número
 * real aparece. Sem este acerto, o quadro mostrava 3 peças e o ranking contava
 * 1, para sempre, sem nada na tela explicando a diferença.
 *
 * A DATA não se mexe, e é de propósito: a entrega aconteceu no dia em que
 * aconteceu. O que se corrige é quanto foi entregue, não quando — mover a data
 * para hoje tiraria a entrega do mês em que ela foi feita e furaria o
 * fechamento de um mês já contado.
 *
 * Devolve o antes e o depois para quem chamou poder registrar a correção no
 * histórico do card; nulo quando não há entrega ou quando o número não mudou.
 */
export async function atualizarVolumetriaEntregue(params: {
  cardId: string;
  boardId: string;
  values: string | null;
}): Promise<{ antes: number; depois: number } | null> {
  const entrega = await prisma.delivery.findUnique({
    where: { sourceKey: `kanban:${params.cardId}` },
    select: { id: true, pieces: true },
  });

  // Card que ainda não foi entregue não tem o que corrigir: a fotografia será
  // tirada na chegada à coluna de conclusão, já com a resposta de agora.
  if (!entrega) return null;

  const depois = await volumetriaDoCard(params.boardId, params.values);
  if (depois === entrega.pieces) return null;

  await prisma.delivery.update({ where: { id: entrega.id }, data: { pieces: depois } });

  return { antes: entrega.pieces, depois };
}

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

  const pieces = await volumetriaDoCard(params.boardId, params.values, params.title);

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

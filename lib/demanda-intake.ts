/**
 * A abertura de uma demanda — a porta, em um lugar só.
 *
 * Existem duas entradas para o quadro por formulário: a de quem está dentro da
 * plataforma (`/api/demanda`) e a do link aberto (`/api/public/demanda/[token]`).
 * Elas diferem em três pontos e só três — de onde vem a identidade de quem
 * pede, o carimbo de origem e a frase do histórico. Todo o resto é idêntico:
 * conferir as respostas contra os campos do quadro, achar onde a demanda entra,
 * descobrir quem assume e nascer com um número.
 *
 * Duplicado, esse resto envelhece em dois ritmos. Foi assim que o formulário
 * público nasceu sem o corte de título que o interno já tinha: ninguém lembra
 * de aplicar duas vezes uma regra que não sabe que existe em dois lugares.
 *
 * A criação pelo gerador de copy continua na rota dele: ali o card carrega
 * texto gerado, anexos e uma descrição montada do briefing — é outra coisa, com
 * outras perguntas, e forçá-la aqui dentro só encheria esta função de opções
 * que uma demanda comum nunca usa.
 */

import prisma from "./prisma";
import {
  criarCardComCodigo,
  isPriority,
  normalizePerson,
  parseDueDate,
  serializeAssignees,
  validateValues,
} from "./kanban";
import { groupIntake, logActivity, topPosition } from "./kanban-store";
import { normalizeCardLink } from "./card-link";

/** Quem está pedindo a peça. */
export interface Solicitante {
  email: string;
  name?: string | null;
}

export type AberturaDeDemanda =
  | { ok: true; card: { id: string; code: number | null; title: string } }
  | { ok: false; error: string; status: number };

export interface PedidoDeDemanda {
  boardId: string;
  title: unknown;
  description?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  /** O time que assume. Sem ele, vale a etapa de entrada do quadro. */
  groupId?: string | null;
  /** Uma etapa nomeada à mão vence o grupo — ver `groupIntake`. */
  columnId?: string | null;
  /** Um responsável nomeado vale sozinho; sem ele, o time inteiro do grupo. */
  assigneeEmail?: string | null;
  linkUrl?: unknown;
  values?: unknown;
  requester: Solicitante;
  /** `FORM` é de quem tem sessão; `PUBLIC`, de quem chegou pelo link aberto. */
  origin: "FORM" | "PUBLIC";
}

/**
 * Cria o card da demanda, ou diz por que não deu — sem lançar exceção.
 *
 * Devolve o motivo e o código HTTP porque quem chama é uma rota, e a recusa que
 * interessa a ela é a que a pessoa vai ler: "escolha um formato", e não
 * "validation failed". Exceção só sobe se o banco falhar, e aí é 500 mesmo.
 */
export async function abrirDemanda(pedido: PedidoDeDemanda): Promise<AberturaDeDemanda> {
  const title = String(pedido.title ?? "").trim();
  if (!title) {
    return { ok: false, error: "A demanda precisa de um título.", status: 400 };
  }

  const fields = await prisma.boardField.findMany({
    where: { boardId: pedido.boardId },
    orderBy: { position: "asc" },
  });

  /*
   * As respostas são conferidas contra os campos do próprio quadro — a equipe
   * define as perguntas na tela, então o servidor não conhece a forma deste
   * JSON de antemão. É a única garantia de que a resposta corresponde à
   * pergunta.
   */
  const checked = validateValues(fields, (pedido.values as Record<string, unknown>) ?? {});
  if (!checked.ok) {
    // `validateValues` sempre nomeia o campo que falhou; a queda existe só para
    // o tipo, porque `error` é opcional na assinatura dele.
    return { ok: false, error: checked.error ?? "Revise os campos da demanda.", status: 400 };
  }

  const destino = await groupIntake(pedido.boardId, {
    groupId: pedido.groupId,
    columnId: pedido.columnId,
  });

  if (!destino) {
    return {
      ok: false,
      error: "Este quadro ainda não tem etapas. Avise quem o administra.",
      status: 400,
    };
  }

  const escolhido = normalizePerson(pedido.assigneeEmail);
  const donos = escolhido ? [escolhido] : destino.assignees;

  const card = await criarCardComCodigo(prisma, async (code) =>
    prisma.boardCard.create({
      data: {
        // O número que a equipe usa para falar da demanda. Ver
        // `criarCardComCodigo` — ele é quem resolve a corrida por MAX+1.
        code,
        boardId: pedido.boardId,
        columnId: destino.columnId,
        // O corte acompanha a coluna, que é `varchar(191)`. Um título colado de
        // um e-mail derrubaria a abertura inteira com erro de banco.
        title: title.slice(0, 180),
        description: String(pedido.description ?? "").trim() || null,
        priority: isPriority(pedido.priority) ? pedido.priority : "MEDIA",
        // Uma data inválida entra como nulo em vez de derrubar a abertura:
        // perder o briefing por causa de um prazo mal digitado seria
        // desproporcional.
        dueDate: parseDueDate(pedido.dueDate),
        assignees: serializeAssignees(donos),
        // Espelho do primeiro, enquanto a versão publicada ainda lê este campo.
        assigneeEmail: donos[0] ?? null,
        // Idem para o link: a tela recusa antes, com a mensagem certa.
        linkUrl: normalizeCardLink(pedido.linkUrl),
        /*
         * Quem pediu. Com sessão, o e-mail vem dela e não do corpo — um campo
         * de "solicitante" enviado pelo cliente é um campo que dá para forjar.
         * Pelo link público ele é DECLARADO, e é `origin` que guarda essa
         * diferença; ver a rota pública.
         */
        requesterEmail: pedido.requester.email,
        requesterName: (pedido.requester.name || pedido.requester.email).slice(0, 120),
        values: Object.keys(checked.values).length ? JSON.stringify(checked.values) : null,
        origin: pedido.origin,
        position: await topPosition(destino.columnId),
      },
    })
  );

  await logActivity(
    card.id,
    "CREATED",
    pedido.origin === "PUBLIC" ? "abriu a demanda pelo link público" : "abriu a demanda",
    { email: pedido.requester.email, name: pedido.requester.name ?? pedido.requester.email }
  );

  return { ok: true, card };
}

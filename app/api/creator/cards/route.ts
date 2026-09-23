/**
 * As demandas que já estão no quadro: ler, mover, editar, arquivar, apagar.
 *
 * Abrir uma é a única coisa que NÃO mora aqui — é `/api/demanda`, aberta a
 * qualquer pessoa autenticada. Esta rota é do modo Creator, e mexer num card
 * que já existe é trabalho de quem produz.
 *
 * Toda alteração passa por `validateValues` antes de virar linha: os campos são
 * definidos pelo próprio time na tela do Kanban, então o que chega aqui é um
 * JSON cuja forma o servidor não conhece de antemão — e conferir contra os
 * campos do quadro é a única garantia de que a resposta corresponde à pergunta.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator, getCurrentUserEmail } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import {
  isPriority,
  parseValues,
  validateValues,
  camposDoQuadro,
  parseDueDate,
  startOfCurrentMonth,
  parseAssignees,
  serializeAssignees,
  resolveMoveAssignees,
  formatCardCode,
  PRIORITY_LABEL,
  type Priority,
} from "@/lib/kanban";
import { intakeColumnId, topPosition, logActivity } from "@/lib/kanban-store";
import { avisarEntregaSemRegistro } from "@/lib/kanban-deliveries";
import { normalizeCardLink } from "@/lib/card-link";
import { enviarMensagemSlack, montarMensagemEntrega, buscarIdsSlackPorEmails } from "@/lib/slack-delivery";
import { resolveCronBaseUrl } from "@/lib/cron-url";
import { logWarning } from "@/lib/logger";

/**
 * O histórico de um card — e o arquivo do quadro.
 *
 * As duas leituras moram na mesma rota porque as duas respondem à mesma
 * pergunta feita em escalas diferentes: "o que aconteceu com isto?". Com
 * `cardId`, a linha do tempo de um card; com `boardId`, tudo que já saiu do
 * quadro — arquivado à mão ou pela regra de fim de mês.
 */
export async function GET(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const params = new URL(request.url).searchParams;
    const boardId = params.get("boardId");

    if (boardId) {
      /*
       * Busca — no quadro E no arquivo, na mesma resposta.
       *
       * Procurar uma demanda pelo nome era possível só com ela à vista: no
       * quadro, lendo coluna por coluna; no arquivo, rolando as 200 últimas.
       * Quem lembra do assunto mas não de onde a demanda parou não tinha por
       * onde começar — e "onde parou" é justamente o que se quer descobrir.
       *
       * Vai ao banco em vez de filtrar o que a tela já carregou porque a tela
       * não tem tudo: o arquivo só chega quando alguém abre o arquivo, e o
       * texto que se procura muitas vezes está no briefing ou na copy, que o
       * card não mostra na frente.
       *
       * Ativos primeiro, e dentro de cada bloco o mais recente antes: quem
       * procura quase sempre quer o que ainda está em jogo.
       */
      const busca = (params.get("q") || "").trim().slice(0, 120);

      if (busca) {
        /*
         * "MKT-42", "mkt 42" e "42" chegam à mesma demanda. O número é o que a
         * equipe dita no telefone e cola no Slack, e exigir o prefixo exato
         * faria a busca falhar justamente no caminho mais curto.
         */
        const numero = Number(busca.replace(/^\s*MKT\s*-?\s*/i, ""));
        const porCodigo = Number.isInteger(numero) && numero > 0 ? [{ code: numero }] : [];

        const achados = await prisma.boardCard.findMany({
          where: {
            boardId,
            OR: [
              { title: { contains: busca } },
              { description: { contains: busca } },
              /* A copy gerada e as respostas do formulário entram na varredura:
                 é onde mora o produto, o público e a oferta — o vocabulário com
                 que as pessoas realmente procuram. `values` é JSON, e procurar
                 texto dentro dele é grosseiro, mas acha. */
              { copyText: { contains: busca } },
              { values: { contains: busca } },
              { assignees: { contains: busca } },
              { requesterName: { contains: busca } },
              { requesterEmail: { contains: busca } },
              ...porCodigo,
            ],
          },
          orderBy: [{ archived: "asc" }, { updatedAt: "desc" }],
          take: 60,
          /* A etapa vem junto: o resultado precisa dizer ONDE a demanda está,
             que é metade do que se foi procurar. */
          include: { column: { select: { id: true, name: true } } },
        });

        return NextResponse.json({ success: true, cards: achados });
      }

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

/*
 * Não há POST aqui.
 *
 * Abrir demanda deixou de ser um ato do board: qualquer pessoa autenticada pode
 * pedir uma peça, e quem produz é que é um grupo restrito. A porta única é
 * `/api/demanda` — inclusive para o "Nova demanda" do próprio quadro, que
 * chama a mesma rota que a barra do topo. Ver `lib/demanda-intake.ts`.
 */

/**
 * Uma resposta em uma linha, para o histórico.
 *
 * Simples de propósito: o formatador rico do card (`formatFieldValue`) mora num
 * componente de cliente, e arrastá-lo para cá levaria React inteiro para dentro
 * de uma rota. Aqui basta que a frase se leia — "1 → 3", "Meta Ads → TikTok
 * Ads" —, e o valor bonito continua sendo desenhado no card.
 */
function legivel(valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "vazio";
  if (Array.isArray(valor)) return valor.length ? valor.map(String).join(", ") : "vazio";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

export async function PUT(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

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
        select: {
          code: true,
          columnId: true,
          boardId: true,
          title: true,
          assignees: true,
          values: true,
          linkUrl: true,
          // A pasta da entrega, para o aviso do Slack levar ao resultado do
          // trabalho e não ao material de apoio do pedido.
          deliveryUrl: true,
          // A fase de ORIGEM: é a comparação com a de destino que diz se o card
          // mudou de time ou só andou dentro do mesmo. `isDone` entra para que
          // a entrega seja contada na CHEGADA à conclusão, e não a cada arrasto
          // dentro dela — ver `registrarEntregaDoCard`. Também é metade do
          // gatilho do aviso no Slack: ver mais abaixo.
          column: { select: { groupId: true, isDone: true } },
        },
      });
      if (!card) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

      const target = await prisma.boardColumn.findUnique({
        where: { id: columnId },
        select: {
          name: true,
          isDone: true,
          isIntake: true,
          groupId: true,
          // A equipe mora na FASE. Ver `ownershipOf` em `lib/kanban.ts`.
          group: { select: { assignees: true, defaultAssignee: true } },
          // Gatilho e overrides do aviso no Slack — ver mais abaixo.
          notifySlackOnEnter: true,
          slackChannelId: true,
          slackMessageTemplate: true,
        },
      });
      if (!target) return NextResponse.json({ error: "Coluna não encontrada." }, { status: 404 });

      /*
       * Chegar numa fase e agir dentro dela são coisas diferentes.
       *
       * Chegar põe a demanda na fila do time inteiro — todos precisam ver que
       * há trabalho novo. Agir é alguém dizer "eu pego", e aí a demanda vira de
       * uma pessoa só. Ver `resolveMoveAssignees`.
       */
      const quemMoveu = await getCurrentUserEmail();
      const mudouDeFase = (card.column?.groupId ?? null) !== (target.groupId ?? null);
      const atuais = parseAssignees(card.assignees);

      const donos = resolveMoveAssignees(
        target.group ?? {},
        mudouDeFase,
        atuais,
        quemMoveu
      );

      const mudou =
        donos.length !== atuais.length || donos.some((d, i) => d !== atuais[i]);

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
            ...(mudou
              ? {
                  assignees: serializeAssignees(donos),
                  // Espelho do primeiro, enquanto a versão publicada o lê.
                  assigneeEmail: donos[0] ?? null,
                }
              : {}),
          },
        }),
        ...order.map((id: string, index: number) =>
          prisma.boardCard.update({ where: { id }, data: { position: index } })
        ),
      ]);

      if (mudou && donos.length) {
        /*
         * A passagem de bastão automática fica no histórico dizendo que foi
         * automática. Sem a distinção, quem lê o card semanas depois procuraria
         * a pessoa que atribuiu — e não houve nenhuma.
         */
        /*
         * Três origens distintas, três frases. Quem lê o card semanas depois
         * precisa saber se alguém escolheu aquela pessoa, se ela se pegou ao
         * mover, ou se foi o padrão da etapa agindo sozinho — "atribuído a X"
         * para os três casos manda procurar um responsável que não existe.
         */
        const comoFoi =
          donos.length === 1 && donos[0] === quemMoveu
            ? `${quemMoveu} assumiu ao mover para "${target.name}"`
            : mudouDeFase
              ? `passou para a equipe de "${target.name}" (${donos.length} pessoa(s))`
              : `${donos.join(", ")} passou a responder por esta demanda`;
        await logActivity(cardId, "ASSIGNED", comoFoi, user);
      }

      if (card.columnId !== columnId) {
        await logActivity(cardId, "MOVED", `moveu para "${target.name}"`, user);
      }

      /*
       * O movimento não conta mais a entrega — quem conta é o módulo, na hora
       * do envio (ver `creditarEntregaDoModulo`). Aqui só se confere: um card
       * que conclui sem nada registrado é volumetria que ninguém vai receber,
       * e isso precisa virar aviso em vez de silêncio.
       *
       * Depois da transação, de propósito: uma falha na conferência não pode
       * desfazer o movimento do card.
       */
      await avisarEntregaSemRegistro({
        cardId,
        title: card.title,
        destinoConclui: target.isDone,
        origemConcluia: card.column?.isDone ?? false,
      });

      /*
       * O aviso de entrega no Slack é por ETAPA, não mais fixo em "saiu de
       * Entrega, entrou em Entrada" — cada coluna liga ou desliga o próprio
       * aviso (`notifySlackOnEnter`, editável no painel de etapas do
       * Kanban). `isDone`/`isIntake` continuam existindo pra outras coisas
       * (conclusão do card, roteamento de demanda nova), só deixaram de ser
       * o motivo do Slack.
       *
       * Sem `card.linkUrl` E sem template customizado: não é erro, é o
       * caminho normal de quem move o card sem ter subido nada pelo painel
       * novo ainda — o texto padrão cita o link do Drive, então sem ele não
       * há o que enviar. Vira aviso em Logs, não uma falha que desfaria o
       * movimento. Com template próprio, a etapa decide se usa `{{drive}}` —
       * o envio segue mesmo sem link.
       */
      if (target.notifySlackOnEnter) {
        const temTemplatePersonalizado = !!target.slackMessageTemplate?.trim();
        if (card.linkUrl || temTemplatePersonalizado) {
          try {
            /*
             * Quem entregou: os responsáveis ANTES desta transição — quem
             * estava com a demanda enquanto ela era produzida. `donos` já foi
             * reatribuído acima para o time do grupo novo (pra onde a tarefa
             * está indo AGORA), então não serve pra dizer quem a entregou.
             */
            const emailsDeQuemEntregou = atuais.length ? atuais : quemMoveu ? [quemMoveu] : [];
            const pessoasDeQuemEntregou = emailsDeQuemEntregou.length
              ? await prisma.user.findMany({
                  where: { email: { in: emailsDeQuemEntregou } },
                  select: { name: true, email: true },
                })
              : [];
            const nomeDeQuemEntregou = emailsDeQuemEntregou.length
              ? emailsDeQuemEntregou
                  .map((email) => pessoasDeQuemEntregou.find((p) => p.email === email)?.name?.trim() || email)
                  .join(", ")
              : "alguém";

            const { baseUrl, reachableExternally } = await resolveCronBaseUrl(request);
            const cardUrl =
              reachableExternally && baseUrl
                ? `${baseUrl}/creator/kanban?board=${card.boardId}&card=${cardId}`
                : null;

            // Quem marcar: o time do grupo pra onde a tarefa ACABOU de
            // entrar — os PRÓXIMOS responsáveis, já resolvido em `donos`.
            const mencoes = await buscarIdsSlackPorEmails(donos);

            const mensagem = montarMensagemEntrega({
              codigo: formatCardCode(card.code) || card.title,
              cardUrl,
              responsavel: nomeDeQuemEntregou,
              /* A pasta da ENTREGA primeiro. `linkUrl` só como reserva, por
                 causa das entregas anteriores a `deliveryUrl` existir — nelas
                 a automação gravou a pasta ali, e o aviso continuaria certo. */
              driveUrl: card.deliveryUrl ?? card.linkUrl,
              mencoes,
              template: target.slackMessageTemplate,
            });
            await enviarMensagemSlack(mensagem, target.slackChannelId);
          } catch (err) {
            await logWarning(
              "ENTREGAS",
              `Aviso de entrega no Slack falhou para "${card.title}": ${err instanceof Error ? err.message : String(err)}`,
              "app/api/creator/cards/route.ts"
            );
          }
        } else {
          await logWarning(
            "ENTREGAS",
            `"${card.title}" entrou em "${target.name}" sem link de entrega (ninguém subiu arquivos pelo painel) — aviso do Slack não foi enviado.`,
            "app/api/creator/cards/route.ts"
          );
        }
      }

      /*
       * O dono volta na resposta porque o servidor pode tê-lo DECIDIDO.
       *
       * A tela move o card antes da resposta, para o arrasto não piscar, e sem
       * este campo ela nunca fica sabendo de quem a demanda passou a ser: o
       * card muda de coluna e continua aparecendo sem responsável até alguém
       * recarregar a página. A regra funcionava e parecia não funcionar.
       */
      return NextResponse.json({ success: true, assignees: donos });
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

    const { id, title, description, priority, dueDate, assignees, columnId, linkUrl } = body;
    if (!id) return NextResponse.json({ error: "ID da demanda é obrigatório." }, { status: 400 });

    const current = await prisma.boardCard.findUnique({
      where: { id },
      // A fase de ORIGEM vem junto: é a comparação com a de destino que diz se
      // o card mudou de time ou só andou dentro do mesmo.
      include: { column: { select: { groupId: true } } },
    });
    if (!current) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

    let values = current.values;
    /*
     * O que mudou nas respostas, em palavras — montado ANTES da gravação, que é
     * quando o valor anterior ainda existe.
     */
    let mudancaDeRespostas: string | null = null;

    if (body.values !== undefined) {
      /* Ordenados por posição: `validateValues` decide visibilidade percorrendo
         o formulário na ordem em que ele é preenchido, e uma lista embaralhada
         faria um campo condicional ler o revelador como ainda em branco. */
      const fields = camposDoQuadro(
        await prisma.boardField.findMany({
          where: { boardId: current.boardId },
          orderBy: { position: "asc" },
        })
      );

      /*
       * A edição preserva o que não foi enviado.
       *
       * O painel do card mostra os campos do quadro de hoje; respostas de um
       * campo removido no passado não aparecem lá, e substituir o JSON inteiro
       * pelo que o formulário devolveu as apagaria sem que ninguém pedisse.
       */
      const anteriores = parseValues(current.values);
      const merged = { ...anteriores, ...(body.values as object) };
      const checked = validateValues(fields, merged);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

      /*
       * As respostas ÓRFÃS voltam por cima — e sem elas o parágrafo acima era
       * mentira.
       *
       * `validateValues` percorre os campos do quadro de HOJE e devolve só o que
       * casa com eles. Uma resposta de campo removido não casa com nada, então
       * some do resultado: qualquer edição no painel apagava, em silêncio, tudo
       * que havia sido respondido a perguntas que o quadro não faz mais. A tela
       * de campos promete o contrário, com essas palavras — "as respostas já
       * enviadas continuam guardadas nos cards" —, e é essa promessa que torna
       * remover uma pergunta uma decisão reversível: recriá-la com a mesma
       * chave traz tudo de volta.
       *
       * Ficou invisível o tempo todo porque nada mandava `values` nesta rota: o
       * painel do card só sabia exibir as respostas. Apareceu no instante em que
       * ele passou a saber editá-las.
       */
      const orfas = Object.fromEntries(
        Object.entries(anteriores).filter(([chave]) => !fields.some((f) => f.key === chave))
      );

      const finais = { ...orfas, ...checked.values };
      values = Object.keys(finais).length ? JSON.stringify(finais) : null;

      /*
       * Quem produz a peça pode corrigir a data e a quantidade — e quem pediu
       * precisa ficar sabendo.
       *
       * Sem este registro, o prazo combinado na abertura passaria a ser outro
       * sem rastro: o card mostraria o número novo, e a única pessoa a saber do
       * antigo seria quem o trocou. É o mesmo critério do link e da prioridade,
       * logo abaixo — entra no histórico o que alguém vai querer explicar
       * depois.
       *
       * Comparação contra o VALIDADO, não contra o corpo da requisição: o
       * servidor normaliza (data vira "2026-09-25", deslizante é preso à faixa),
       * e registrar o que chegou anunciaria uma mudança que não foi gravada.
       */
      // Só os campos do quadro entram no histórico: uma órfã nunca muda, e
      // nomeá-la exigiria um rótulo que já não existe.
      const mudancas = fields
        .filter((f) => {
          const antes = JSON.stringify(anteriores[f.key] ?? null);
          const depois = JSON.stringify(checked.values[f.key] ?? null);
          return antes !== depois;
        })
        .map((f) => `${f.label} (${legivel(anteriores[f.key])} → ${legivel(checked.values[f.key])})`);

      if (mudancas.length) {
        mudancaDeRespostas = `ajustou as respostas: ${mudancas.join(", ")}`.slice(0, 500);
      }
    }

    /*
     * Trocar a etapa pelo painel do card passa pelas mesmas regras do arrasto.
     * A tela é outra; a etapa é a mesma, e o dia em que as duas divergirem é o
     * dia em que a regra vira folclore.
     */
    let donoPelaEtapa: string[] | undefined;

    if (columnId !== undefined && columnId !== current.columnId) {
      const destino = await prisma.boardColumn.findUnique({
        where: { id: columnId },
        select: {
          name: true,
          groupId: true,
          group: { select: { assignees: true, defaultAssignee: true } },
        },
      });

      /*
       * Mexer na lista de responsáveis é uma escolha; não mexer, não é.
       *
       * Quem abriu o card e editou a lista está dizendo exatamente quem
       * responde — e a regra da fase não pode desfazer isso na mesma gravação
       * só porque a etapa também mudou. Só quando a lista NÃO foi tocada é que
       * o gesto fala e a fase decide.
       */
      const escolheuDonos = assignees !== undefined;

      if (!escolheuDonos) {
        const quemMoveu = await getCurrentUserEmail();
        const mudouDeFase = (current.column?.groupId ?? null) !== (destino?.groupId ?? null);

        donoPelaEtapa = resolveMoveAssignees(
          destino?.group ?? {},
          mudouDeFase,
          parseAssignees(current.assignees),
          quemMoveu
        );
      }
    }

    const card = await prisma.boardCard.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() || null } : {}),
        ...(priority !== undefined && isPriority(priority) ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: parseDueDate(dueDate) } : {}),
        /*
         * A lista editada à mão vence; sem ela, vale o que a fase resolveu.
         *
         * `assigneeEmail` continua espelhando o primeiro da lista enquanto a
         * versão publicada o lê — sai na limpeza pós-deploy.
         */
        ...(donoPelaEtapa !== undefined
          ? {
              assignees: serializeAssignees(donoPelaEtapa),
              assigneeEmail: donoPelaEtapa[0] ?? null,
            }
          : assignees !== undefined
            ? {
                assignees: serializeAssignees(assignees),
                assigneeEmail: parseAssignees(serializeAssignees(assignees))[0] ?? null,
              }
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
    const donosRegistrados =
      donoPelaEtapa ??
      (assignees !== undefined ? parseAssignees(serializeAssignees(assignees)) : null);

    if (donosRegistrados) {
      const antes = parseAssignees(current.assignees);
      const mudou =
        donosRegistrados.length !== antes.length ||
        donosRegistrados.some((d, i) => d !== antes[i]);

      if (mudou) {
        await logActivity(
          id,
          "ASSIGNED",
          donosRegistrados.length
            ? `responsáveis: ${donosRegistrados.join(", ")}`
            : "removeu os responsáveis",
          user
        );
      }
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

    /*
     * O prazo entra no histórico pelo mesmo motivo do link: é combinado com
     * quem pediu. Uma data que muda sem rastro transforma "atrasou" numa
     * discussão sobre o que tinha sido combinado.
     */
    if (dueDate !== undefined) {
      const nova = parseDueDate(dueDate);
      const antes = current.dueDate;
      const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
      if (dia(nova) !== dia(antes)) {
        const legivel = (d: Date | null) =>
          d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
        await logActivity(
          id,
          "UPDATED",
          nova
            ? antes
              ? `mudou o prazo de ${legivel(antes)} para ${legivel(nova)}`
              : `marcou o prazo para ${legivel(nova)}`
            : "tirou o prazo da demanda",
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

    if (mudancaDeRespostas) {
      await logActivity(id, "UPDATED", mudancaDeRespostas, user);
    }

    return NextResponse.json({ success: true, card });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

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

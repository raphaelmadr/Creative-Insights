/**
 * O gerador de copy — e a entrega automática no Kanban.
 *
 * A copy pronta não fica numa tela que se fecha: ela vira card no quadro que
 * recebe copys, já com o briefing preenchido e o nome de quem pediu. É esse
 * passo que faz o gerador ser parte da ferramenta, e não mais um chat de onde
 * alguém copia e cola o resultado em outro lugar.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { isAiConfigured } from "@/lib/ai";
import {
  generateCopy,
  briefProductName,
  briefAudienceName,
  type CopyBrief,
} from "@/lib/creator-copy";
import { copyTargetBoard, groupIntake, topPosition, logActivity } from "@/lib/kanban-store";
import { isPriority, matchOption, optionsFor, parseDueDate, serializeAssignees,
  criarCardComCodigo, validateValues, camposObrigatoriosFaltando,
} from "@/lib/kanban";
import {
  buildCopyCardTitle,
  clampVariations,
  findChannel,
  findFormat,
  findTone,
  formatBelongsToChannel,
  isCopyMode,
  isOtherOption,
} from "@/lib/copy-options";
import { sanitizeAttachments, serializeAttachments } from "@/lib/attachments";
import { resolveStorageConfig } from "@/lib/media-upload";
import { parseCopyVariations } from "@/lib/copy-parse";
import { findAlluProduct, describePricing } from "@/lib/allu-catalog";
import { findMetaAudience } from "@/lib/meta-audiences";

/** Onde a copy vai cair, para a tela poder dizer isso antes de gerar. */
export async function GET() {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const target = await copyTargetBoard();
    const column = target
      ? await prisma.boardColumn.findUnique({
          where: { id: target.columnId },
          select: { name: true, groupId: true },
        })
      : null;

    /*
     * Os grupos do quadro, com a etapa em que cada um recebe o que chega.
     *
     * A tela precisa da etapa para dizer a verdade: ela anuncia onde a copy vai
     * cair antes de enviar, e esse destino muda conforme o time escolhido. Sem
     * isso, o aviso continuaria mostrando a etapa do grupo padrão qualquer que
     * fosse a escolha.
     */
    const etapas = target
      ? await prisma.boardColumn.findMany({
          where: { boardId: target.board.id },
          orderBy: { position: "asc" },
          select: { name: true, groupId: true },
        })
      : [];

    const groups = target
      ? (
          await prisma.boardGroup.findMany({
            where: { boardId: target.board.id },
            orderBy: { position: "asc" },
            select: { id: true, name: true },
          })
        )
          .map((g) => ({
            ...g,
            columnName: etapas.find((e) => e.groupId === g.id)?.name ?? null,
          }))
          /*
           * Grupo sem etapa nenhuma não entra na lista: escolhê-lo mandaria a
           * copy para a entrada do quadro, que é de outro time, sem nada na
           * tela dizendo que foi isso que aconteceu.
           */
          .filter((g) => g.columnName)
      : [];

    return NextResponse.json({
      success: true,
      aiConfigured: await isAiConfigured(),
      groups,
      target: target
        ? {
            boardId: target.board.id,
            boardName: target.board.name,
            columnName: column?.name ?? null,
            /*
             * O grupo dono da entrada do quadro é o que a tela já vem marcando.
             * Não escolher nada tem de continuar fazendo o que sempre fez — a
             * copy caindo exatamente onde caía —, e agora com o time do grupo
             * junto, que é o que faltava.
             */
            groupId: column?.groupId ?? null,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Monta o briefing a partir do que a tela mandou.
 *
 * A tela envia **ids** — do produto no catálogo, do público no Meta, do formato
 * e do tom —, e é aqui que eles viram objeto. O preço nunca chega pelo corpo da
 * requisição: ele é buscado pelo id, no servidor. Aceitar o preço do cliente
 * seria deixar o valor do anúncio à mercê do que a aba tinha em memória desde
 * que foi aberta — ou de quem resolvesse editá-lo.
 */
async function buildBrief(body: any): Promise<CopyBrief> {
  /*
   * O id de "Outro / especifique" não é um id: é a forma de dizer que o item não
   * está cadastrado. Procurá-lo no catálogo devolveria nada, e a pessoa receberia
   * "este produto não está mais disponível" por ter dito justamente que ele não
   * está lá. A tela já o converte em nulo; a rota não confia nisso.
   */
  const productId = isOtherOption(body.productId) ? null : body.productId;
  const audienceId = isOtherOption(body.audienceId) ? null : body.audienceId;

  const product = productId ? await findAlluProduct(String(productId)) : null;
  const audience = audienceId ? await findMetaAudience(String(audienceId)) : null;

  return {
    product,
    productName: body.productName?.trim() || undefined,
    audience,
    audienceText: body.audienceText?.trim() || undefined,
    objective: String(body.objective || "").trim(),
    toneId: findTone(body.toneId)?.id,
    toneText: body.toneText?.trim() || undefined,
    formatId: findFormat(body.formatId)?.id,
    /*
     * O canal vem da lista. Sem ele, mas com formato escolhido, o canal é
     * deduzido do próprio formato — todo formato pertence a um. E `channel`
     * continua sendo o rótulo, que é o que a descrição do card exibe; o texto
     * livre de antes ainda é aceito para não quebrar chamadas antigas.
     */
    channelId:
      findChannel(body.channelId)?.id ?? findFormat(body.formatId)?.channelId ?? undefined,
    channel:
      findChannel(body.channelId)?.label ??
      findChannel(findFormat(body.formatId)?.channelId)?.label ??
      body.channel?.trim() ??
      undefined,
    constraints: body.constraints?.trim() || undefined,
    variations: clampVariations(body.variations),
  };
}

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const body = await request.json();
    const brief = await buildBrief(body);

    /*
     * Quem escreve. No manual a rota não chama modelo nenhum: ela recebe o texto
     * pronto da tela e cria o card. O padrão continua sendo a IA — uma versão
     * antiga da tela, ou qualquer chamada que não conheça o campo, segue se
     * comportando como antes.
     */
    const mode = isCopyMode(body.mode) ? body.mode : "ai";

    /*
     * O id que não resolve vem antes da checagem de "está vazio".
     *
     * Na ordem inversa, quem escolheu um produto que saiu do catálogo recebia
     * "escolha um produto ou descreva a oferta" — uma mensagem que manda fazer
     * exatamente o que a pessoa acabou de fazer. A causa real é outra, e é ela
     * que a tela precisa dizer.
     */
    if (body.productId && !isOtherOption(body.productId) && !brief.product) {
      return NextResponse.json(
        { error: "Este produto não está mais disponível no catálogo. Atualize a lista." },
        { status: 400 }
      );
    }
    if (body.audienceId && !isOtherOption(body.audienceId) && !brief.audience) {
      return NextResponse.json(
        { error: "Este público não existe mais na conta de anúncios. Atualize a lista." },
        { status: 400 }
      );
    }

    /*
     * O produto pode vir da lista ou digitado, e o público idem — o que não pode
     * é faltar. Exigir o id do catálogo deixaria de fora a campanha
     * institucional e o produto que ainda não subiu no site.
     */
    if (!briefProductName(brief)) {
      return NextResponse.json(
        { error: "Escolha um produto do catálogo ou descreva a oferta." },
        { status: 400 }
      );
    }
    /*
     * Formato e canal precisam combinar. A tela só oferece os formatos do canal
     * escolhido, então isto pega o que vem de fora dela — e diz o que está
     * errado, em vez de gerar uma copy de stories para um pedido de e-mail.
     */
    if (body.channelId && brief.formatId && !formatBelongsToChannel(brief.formatId, body.channelId)) {
      const canal = findChannel(body.channelId);
      return NextResponse.json(
        { error: `"${findFormat(brief.formatId)?.label}" não é um formato de ${canal?.label ?? "outro canal"}.` },
        { status: 400 }
      );
    }

    /*
     * Público e objetivo são exigidos só de quem vai gerar: eles existem para o
     * modelo saber para quem escrever e por quê. No manual quem sabe isso é a
     * pessoa que está escrevendo, e transformá-los em obrigação seria cobrar o
     * preenchimento de um briefing que ninguém vai ler.
     */
    if (mode === "ai") {
      if (!briefAudienceName(brief)) {
        return NextResponse.json(
          { error: "Escolha um público ou descreva para quem é a peça." },
          { status: 400 }
        );
      }
      if (!brief.objective) {
        return NextResponse.json({ error: "O objetivo é obrigatório." }, { status: 400 });
      }

      if (!(await isAiConfigured())) {
        return NextResponse.json(
          { error: "Nenhuma IA configurada. Adicione uma chave em Configurações → IA." },
          { status: 400 }
        );
      }
    }

    const { text, winners } =
      mode === "ai"
        ? await generateCopy(brief)
        : { text: "", winners: [] as Awaited<ReturnType<typeof generateCopy>>["winners"] };

    /*
     * Gerar não é entregar.
     *
     * A primeira versão criava o card junto com a geração, e o quadro encheu de
     * copy que ninguém tinha lido — inclusive tentativas descartadas na hora. A
     * pessoa lê, ajusta o briefing, gera de novo, e só então envia.
     */
    if (!body.sendToBoard) {
      if (mode === "manual") {
        return NextResponse.json(
          { error: "No modo manual não há o que gerar — escreva as peças e envie ao quadro." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        copy: text,
        referencesUsed: winners.length,
        variations: brief.variations,
      });
    }

    const target = await copyTargetBoard();
    if (!target) {
      return NextResponse.json(
        { error: "Nenhum quadro configurado para receber copys." },
        { status: 400 }
      );
    }

    const finalText =
      typeof body.editedCopy === "string" && body.editedCopy.trim()
        ? body.editedCopy.trim()
        : text;

    // No manual não há texto de reserva: se a tela não mandou nada escrito, o
    // card entraria no quadro vazio, e ninguém saberia disso até abri-lo.
    if (mode === "manual" && !finalText) {
      return NextResponse.json(
        { error: "Escreva ao menos uma peça antes de enviar ao quadro." },
        { status: 400 }
      );
    }

    /*
     * Os anexos chegam como URLs, e URL vinda do cliente é URL escolhida por
     * quem quiser: só passa o que aponta para o nosso próprio armazenamento —
     * o único lugar de onde o upload autenticado pode ter saído.
     */
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { cpanelUploadUrl: true, cpanelUploadSecret: true },
    });
    const anexos = sanitizeAttachments(body.attachments, resolveStorageConfig(settings).host);

    const formato = findFormat(brief.formatId);
    const tom = findTone(brief.toneId);

    /*
     * A quantidade no título é contada no texto que será gravado, e não no que
     * foi pedido à IA: quem revisou pode ter descartado variações antes de
     * enviar, e um card que promete doze peças e entrega nove vira discussão no
     * dia da entrega. Sem cards reconhecíveis — a saída veio fora do formato e
     * está sendo editada como texto corrido —, vale o número pedido.
     */
    const pecas = parseCopyVariations(finalText).length || clampVariations(brief.variations);

    /*
     * Para qual time vai a copy.
     *
     * Mesma regra do formulário de demanda, e pelo mesmo motivo: o card cai na
     * primeira etapa do grupo escolhido e nasce com o time inteiro. Até aqui a
     * copy entrava no quadro sem dono nenhum — chegava na esteira e ficava
     * esperando alguém reparar nela.
     */
    /*
     * O que o gerador já sabe, escrito nos campos do formulário.
     *
     * Sem isto, o card vindo da copy é um card de segunda classe: não responde
     * às mesmas opções de exibição que os demais — "mostrar o canal" não mostra
     * nada nele — e nenhuma etiqueta acende, porque as etiquetas leem as
     * respostas do formulário. Ele tinha a informação; só não a guardava onde o
     * resto do quadro procura.
     *
     * Só entra o que `matchOption` reconhece sem ambiguidade. As duas listas de
     * formato — a do gerador e a do formulário — hoje não se encontram
     * ("Estático Feed" de um lado, "Feed 1:1" do outro), e é melhor o campo
     * ficar vazio do que gravar no card uma resposta que ninguém deu.
     */
    const camposDoQuadro = await prisma.boardField.findMany({
      where: { boardId: target.board.id },
      orderBy: { position: "asc" },
    });

    const acharCampo = (chave: string) =>
      camposDoQuadro.find(
        (f) => f.key === chave || f.label.trim().toLowerCase() === chave
      ) ?? null;

    const respostas: Record<string, unknown> = {};

    const campoCanal = acharCampo("canal");
    const nomeDoCanal = findChannel(brief.channelId)?.label ?? brief.channel ?? null;
    if (campoCanal && nomeDoCanal) {
      const escolhida = matchOption(nomeDoCanal, optionsFor(campoCanal, respostas));
      if (escolhida) {
        respostas[campoCanal.key] =
          campoCanal.type === "MULTISELECT" ? [escolhida] : escolhida;
      }
    }

    const campoFormato = acharCampo("formato");
    if (campoFormato && formato) {
      // Depois do canal, de propósito: o formato depende dele para saber quais
      // opções existem.
      const escolhida = matchOption(formato.label, optionsFor(campoFormato, respostas));
      if (escolhida) {
        respostas[campoFormato.key] =
          campoFormato.type === "MULTISELECT" ? [escolhida] : escolhida;
      }
    }

    /*
     * A volumetria vai junto — é o número que o gerador já sabe.
     *
     * O campo de peças do quadro é o que conta a entrega quando o card chega à
     * coluna de conclusão (ver `lib/kanban-deliveries.ts`). Sem preencher aqui,
     * uma demanda de doze copys entraria no ranking valendo UMA peça, e o
     * gerador — que é justamente quem sabe o número — ficaria de fora da conta.
     */
    const campoPecas =
      camposDoQuadro.find((f) => f.type === "RANGE" || f.type === "NUMBER") ?? null;
    if (campoPecas) respostas[campoPecas.key] = pecas;

    /*
     * O que o gerador NÃO sabe preencher sozinho, e a tela já perguntou.
     *
     * Canal/formato/peças vêm do que o gerador já coleta pra escrever a
     * copy — o resto (uma "Frente", por exemplo) não tem de onde vir daqui.
     * `extraRespostas` é o valor que a tela manda depois de perguntar isso
     * numa segunda rodada (ver `missingFields` abaixo). Só entra chave que é
     * campo de verdade deste quadro — o resto seria a tela mandando qualquer
     * coisa pra um card que ela não deveria conseguir escrever.
     */
    if (body.extraRespostas && typeof body.extraRespostas === "object") {
      for (const [chave, valor] of Object.entries(body.extraRespostas)) {
        if (camposDoQuadro.some((f) => f.key === chave)) respostas[chave] = valor;
      }
    }

    /*
     * "Frente" é a única pergunta extra que o gerador faz por conta própria.
     *
     * O quadro pode ter outros campos obrigatórios, mas esses são problema do
     * formulário manual — o gerador de copy só sabe perguntar o que é dele
     * (canal/formato/peças, acima) mais este, porque é o que a entrega de
     * criativos (`DeliveryUploadPanel`) precisa para montar o nome do arquivo.
     */
    const campoFrente = acharCampo("frente");
    const faltando = campoFrente
      ? camposObrigatoriosFaltando(camposDoQuadro, respostas).filter(
          (f) => f.key === campoFrente.key
        )
      : [];
    if (faltando.length) {
      return NextResponse.json(
        {
          error: `Responda "${faltando[0].label}" antes de enviar ao quadro.`,
          missingFields: faltando,
        },
        { status: 400 }
      );
    }

    /*
     * Validação de verdade — a mesma que o formulário manual e o link público
     * já confiam (`lib/kanban.ts`): confere opção válida, `dependsOn`, etc.
     * `faltando` acima só via "vazio ou não"; isto pega o resto (uma opção
     * que não existe mais no campo, por exemplo).
     */
    const validado = validateValues(camposDoQuadro, respostas);
    if (!validado.ok) {
      return NextResponse.json({ error: validado.error }, { status: 400 });
    }
    Object.assign(respostas, validado.values);

    const destino = await groupIntake(target.board.id, { groupId: body.groupId });
    if (!destino) {
      return NextResponse.json(
        { error: "O quadro que recebe copys ainda não tem colunas." },
        { status: 400 }
      );
    }

    const card = await criarCardComCodigo(prisma, async (code) =>
      prisma.boardCard.create({
        data: {
          // O número que a equipe usa para falar da demanda. Ver
          // `criarCardComCodigo` — ele é quem resolve a corrida por MAX+1.
          code,
          boardId: target.board.id,
          columnId: destino.columnId,
          assignees: serializeAssignees(destino.assignees),
          // Espelho do primeiro, enquanto a versão publicada ainda lê este campo.
          assigneeEmail: destino.assignees[0] ?? null,
          title:
          String(body.title ?? "").trim().slice(0, 180) ||
          buildCopyCardTitle({
            formatId: brief.formatId,
            productName: briefProductName(brief),
            variations: pecas,
          }),
          /*
           * O briefing vira a descrição do card, e não só a copy.
           *
           * Quem recebe a demanda precisa saber para quem e para quê o texto foi
           * escrito — sem isso, adaptar a copy à peça é adivinhação. O preço entra
           * aqui também: é o número que a arte vai estampar, e ele não pode
           * depender de alguém voltar ao site para conferir.
           */
          description: [
          `**Produto:** ${briefProductName(brief)}`,
          brief.product ? `**Preço:** ${describePricing(brief.product)}` : null,
          brief.product?.url ? `**No site:** ${brief.product.url}` : null,
          briefAudienceName(brief) ? `**Público:** ${briefAudienceName(brief)}` : null,
          brief.objective ? `**Objetivo:** ${brief.objective}` : null,
          formato ? `**Formato:** ${formato.label}` : null,
          brief.channel ? `**Canal:** ${brief.channel}` : null,
          tom ? `**Tom:** ${tom.label}` : null,
          // Sem tom da lista, o texto livre é o tom — ver `buildCopyPrompt`.
          brief.toneText
            ? tom
              ? `**Observação de tom:** ${brief.toneText}`
              : `**Tom:** ${brief.toneText}`
            : null,
          brief.constraints ? `**Restrições:** ${brief.constraints}` : null,
          ]
          .filter(Boolean)
          .join("\n"),
          copyText: finalText,
          values: Object.keys(respostas).length ? JSON.stringify(respostas) : null,
          attachments: serializeAttachments(anexos),
          origin: "COPY",
          /*
           * A prioridade não é mais escolhida no gerador.
           *
           * Ele perguntava "prioridade no quadro" logo abaixo da data de
           * entrega, e essa pergunta é do FORMULÁRIO — que a faz, ou não, por
           * decisão do quadro (`FORM_BUILTINS`). Com as duas, um quadro que
           * tinha desligado a prioridade continuava recebendo cards com
           * urgência marcada, vindos de outra tela.
           *
           * O corpo da requisição ainda é lido, para o cliente antigo que
           * continuar mandando o campo não perder o valor até publicar.
           */
          priority: isPriority(body.priority) ? body.priority : "MEDIA",
          /*
           * A data vem como "AAAA-MM-DD" do campo de data do navegador. Uma data
           * inválida vira nulo em vez de derrubar a criação do card: perder a copy
           * recém-aprovada por causa de um prazo mal digitado seria desproporcional.
           */
          dueDate: parseDueDate(body.dueDate),
          requesterEmail: user.email,
          requesterName: user.name,
          position: await topPosition(destino.columnId),
        },
      })
    );

    /*
     * O histórico registra quem escreveu, e não só que o card nasceu. Meses
     * depois, "esta copy foi da IA ou de alguém?" é a primeira pergunta de
     * quem compara o desempenho das peças.
     */
    await logActivity(
      card.id,
      "CREATED",
      mode === "manual"
        ? `escreveu ${pecas} peça(s) à mão`
        : winners.length
          ? `gerou ${pecas} variação(ões) com ${winners.length} peça(s) vencedora(s) como referência`
          : `gerou ${pecas} variação(ões) a partir do briefing`,
      user
    );

    return NextResponse.json({
      success: true,
      copy: finalText,
      referencesUsed: winners.length,
      card,
      board: { id: target.board.id, name: target.board.name },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

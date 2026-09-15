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
import { getCurrentUser } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai";
import {
  generateCopy,
  briefProductName,
  briefAudienceName,
  type CopyBrief,
} from "@/lib/creator-copy";
import { copyTargetBoard, topPosition, logActivity } from "@/lib/kanban-store";
import { isPriority, parseDueDate } from "@/lib/kanban";
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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const target = await copyTargetBoard();
    const column = target
      ? await prisma.boardColumn.findUnique({
          where: { id: target.columnId },
          select: { name: true },
        })
      : null;

    return NextResponse.json({
      success: true,
      aiConfigured: await isAiConfigured(),
      target: target
        ? { boardId: target.board.id, boardName: target.board.name, columnName: column?.name ?? null }
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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

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

    const card = await prisma.boardCard.create({
      data: {
        boardId: target.board.id,
        columnId: target.columnId,
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
        attachments: serializeAttachments(anexos),
        origin: "COPY",
        priority: isPriority(body.priority) ? body.priority : "MEDIA",
        /*
         * A data vem como "AAAA-MM-DD" do campo de data do navegador. Uma data
         * inválida vira nulo em vez de derrubar a criação do card: perder a copy
         * recém-aprovada por causa de um prazo mal digitado seria desproporcional.
         */
        dueDate: parseDueDate(body.dueDate),
        requesterEmail: user.email,
        requesterName: user.name,
        position: await topPosition(target.columnId),
      },
    });

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

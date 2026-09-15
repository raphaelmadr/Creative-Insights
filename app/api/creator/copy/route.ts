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
import { clampVariations, findFormat, findTone } from "@/lib/copy-options";
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
  const product = body.productId ? await findAlluProduct(String(body.productId)) : null;
  const audience = body.audienceId ? await findMetaAudience(String(body.audienceId)) : null;

  return {
    product,
    productName: body.productName?.trim() || undefined,
    audience,
    audienceText: body.audienceText?.trim() || undefined,
    objective: String(body.objective || "").trim(),
    toneId: findTone(body.toneId)?.id,
    toneText: body.toneText?.trim() || undefined,
    formatId: findFormat(body.formatId)?.id,
    channel: body.channel?.trim() || undefined,
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
     * O id que não resolve vem antes da checagem de "está vazio".
     *
     * Na ordem inversa, quem escolheu um produto que saiu do catálogo recebia
     * "escolha um produto ou descreva a oferta" — uma mensagem que manda fazer
     * exatamente o que a pessoa acabou de fazer. A causa real é outra, e é ela
     * que a tela precisa dizer.
     */
    if (body.productId && !brief.product) {
      return NextResponse.json(
        { error: "Este produto não está mais disponível no catálogo. Atualize a lista." },
        { status: 400 }
      );
    }
    if (body.audienceId && !brief.audience) {
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

    const { text, winners } = await generateCopy(brief);

    /*
     * Gerar não é entregar.
     *
     * A primeira versão criava o card junto com a geração, e o quadro encheu de
     * copy que ninguém tinha lido — inclusive tentativas descartadas na hora. A
     * pessoa lê, ajusta o briefing, gera de novo, e só então envia.
     */
    if (!body.sendToBoard) {
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

    const formato = findFormat(brief.formatId);
    const tom = findTone(brief.toneId);

    const card = await prisma.boardCard.create({
      data: {
        boardId: target.board.id,
        columnId: target.columnId,
        title: body.title?.trim() || `Copy — ${briefProductName(brief)}`.slice(0, 180),
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
          `**Público:** ${briefAudienceName(brief)}`,
          `**Objetivo:** ${brief.objective}`,
          formato ? `**Formato:** ${formato.label}` : null,
          brief.channel ? `**Canal:** ${brief.channel}` : null,
          tom ? `**Tom:** ${tom.label}` : null,
          brief.toneText ? `**Observação de tom:** ${brief.toneText}` : null,
          brief.constraints ? `**Restrições:** ${brief.constraints}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        copyText: finalText,
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

    await logActivity(
      card.id,
      "CREATED",
      winners.length
        ? `gerou ${brief.variations} variação(ões) com ${winners.length} peça(s) vencedora(s) como referência`
        : `gerou ${brief.variations} variação(ões) a partir do briefing`,
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

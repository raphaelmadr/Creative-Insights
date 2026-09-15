/**
 * Os campos definíveis do formulário de um quadro.
 *
 * É o que deixa cada time perguntar o que precisa sem pedir código a ninguém.
 * As respostas ficam no JSON do card, então o que esta rota protege é a
 * integridade da pergunta: chave estável, tipo conhecido e opções coerentes com
 * o tipo. Ver `lib/kanban.ts`.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  isFieldType,
  uniqueFieldKey,
  FIELD_TYPES_WITH_OPTIONS,
  type FieldType,
} from "@/lib/kanban";

/** As opções vindas da tela, limpas: sem vazias, sem repetidas. */
function normalizeOptions(type: FieldType, raw: unknown): string | null {
  if (!FIELD_TYPES_WITH_OPTIONS.includes(type)) return null;

  const list = Array.isArray(raw) ? raw : [];
  const clean = Array.from(
    new Set(list.map((o) => String(o).trim()).filter(Boolean))
  );

  return clean.length ? JSON.stringify(clean) : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { boardId, label, type, options, placeholder, helpText, required, showOnCard } =
      await request.json();

    if (!boardId || !label?.trim()) {
      return NextResponse.json({ error: "Quadro e rótulo são obrigatórios." }, { status: 400 });
    }
    if (!isFieldType(type)) {
      return NextResponse.json({ error: "Tipo de campo desconhecido." }, { status: 400 });
    }

    const serialized = normalizeOptions(type, options);
    if (FIELD_TYPES_WITH_OPTIONS.includes(type) && !serialized) {
      return NextResponse.json(
        { error: "Um campo de escolha precisa de pelo menos uma opção." },
        { status: 400 }
      );
    }

    const existing = await prisma.boardField.findMany({ where: { boardId }, select: { key: true } });
    const last = await prisma.boardField.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const field = await prisma.boardField.create({
      data: {
        boardId,
        key: uniqueFieldKey(label, existing.map((f) => f.key)),
        label: label.trim(),
        type,
        options: serialized,
        placeholder: placeholder?.trim() || null,
        helpText: helpText?.trim() || null,
        required: !!required,
        showOnCard: !!showOnCard,
        position: (last?.position ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, field });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const body = await request.json();

    if (Array.isArray(body.order)) {
      await prisma.$transaction(
        body.order.map((id: string, index: number) =>
          prisma.boardField.update({ where: { id }, data: { position: index } })
        )
      );
      return NextResponse.json({ success: true });
    }

    const { id, label, type, options, placeholder, helpText, required, showOnCard } = body;
    if (!id) return NextResponse.json({ error: "ID do campo é obrigatório." }, { status: 400 });

    const current = await prisma.boardField.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

    const nextType = type !== undefined ? type : (current.type as FieldType);
    if (!isFieldType(nextType)) {
      return NextResponse.json({ error: "Tipo de campo desconhecido." }, { status: 400 });
    }

    /*
     * A chave NÃO é recalculada ao renomear.
     *
     * É a única coisa que liga a pergunta às respostas já gravadas nos cards.
     * Recalculá-la a partir do novo rótulo faria "Prazo" virar "data_de_entrega"
     * e deixaria para trás, invisível, tudo que já foi respondido.
     */
    const serialized =
      options !== undefined ? normalizeOptions(nextType, options) : current.options;

    if (FIELD_TYPES_WITH_OPTIONS.includes(nextType) && !serialized) {
      return NextResponse.json(
        { error: "Um campo de escolha precisa de pelo menos uma opção." },
        { status: 400 }
      );
    }

    const field = await prisma.boardField.update({
      where: { id },
      data: {
        ...(label !== undefined ? { label: String(label).trim() } : {}),
        type: nextType,
        // Trocar para um tipo sem opções limpa a lista: deixá-la gravada faria
        // a lista antiga ressurgir se o tipo voltasse a ser de escolha.
        options: FIELD_TYPES_WITH_OPTIONS.includes(nextType) ? serialized : null,
        ...(placeholder !== undefined ? { placeholder: String(placeholder).trim() || null } : {}),
        ...(helpText !== undefined ? { helpText: String(helpText).trim() || null } : {}),
        ...(required !== undefined ? { required: !!required } : {}),
        ...(showOnCard !== undefined ? { showOnCard: !!showOnCard } : {}),
      },
    });

    return NextResponse.json({ success: true, field });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID do campo é obrigatório." }, { status: 400 });

    /*
     * As respostas antigas ficam no JSON dos cards, órfãs e sem serem exibidas.
     *
     * Varrê-las custaria reescrever todos os cards do quadro para apagar
     * histórico — e se o campo foi removido por engano, recriá-lo com a mesma
     * chave traz tudo de volta.
     */
    await prisma.boardField.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

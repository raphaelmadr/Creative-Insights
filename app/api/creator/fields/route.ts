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
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import {
  isFieldType,
  uniqueFieldKey,
  FIELD_TYPES_WITH_OPTIONS,
  type FieldType,
} from "@/lib/kanban";

/** Uma lista de opções, limpa: sem vazias, sem repetidas. */
function limpar(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from(new Set(list.map((o) => String(o).trim()).filter(Boolean)));
}

/**
 * As opções vindas da tela, na forma que o campo exige.
 *
 * DUAS formas, e é `dependsOn` que decide qual: campo independente guarda uma
 * lista; campo dependente guarda um mapa do valor do pai para as escolhas
 * daquele valor.
 *
 * Esta função recebia só a lista, e era a origem de um defeito silencioso: o
 * campo "Formato" do quadro tinha `dependsOn` apontando para "canal" e uma
 * LISTA gravada dentro. `optionsFor` procura um mapa, não acha, e devolve zero
 * opções — o seletor de formato ficava permanentemente vazio, sem erro nenhum
 * em lugar nenhum. Com as duas formas passando por aqui, a que é gravada
 * sempre combina com a que é lida.
 */
function normalizeOptions(
  type: FieldType,
  raw: unknown,
  dependsOn: string | null
): string | null {
  if (!FIELD_TYPES_WITH_OPTIONS.includes(type)) return null;

  if (!dependsOn) {
    const clean = limpar(raw);
    return clean.length ? JSON.stringify(clean) : null;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const mapa: Record<string, string[]> = {};
  for (const [pai, lista] of Object.entries(raw as Record<string, unknown>)) {
    const clean = limpar(lista);
    // Valor do pai sem nenhuma escolha fica de fora: guardar a chave vazia só
    // faria o seletor abrir sem nada dentro, que é pior que a dica de vazio.
    if (clean.length) mapa[pai] = clean;
  }

  return Object.keys(mapa).length ? JSON.stringify(mapa) : null;
}

/**
 * O campo de que este pode depender.
 *
 * Só um SELECT do mesmo quadro serve de pai: o valor precisa ser UM, para que
 * haja uma chave a procurar no mapa. E nunca ele mesmo — um campo que depende
 * de si nunca teria pai preenchido, e ficaria vazio para sempre.
 */
async function validarPai(
  boardId: string,
  dependsOn: unknown,
  selfId?: string
): Promise<{ ok: true; key: string | null } | { ok: false; error: string }> {
  if (dependsOn === undefined) return { ok: true, key: null };
  if (dependsOn === null || dependsOn === "") return { ok: true, key: null };
  if (typeof dependsOn !== "string") return { ok: false, error: "Campo pai inválido." };

  const pai = await prisma.boardField.findFirst({
    where: { boardId, key: dependsOn },
    select: { id: true, type: true },
  });

  if (!pai) return { ok: false, error: "O campo de que este depende não existe neste quadro." };
  if (pai.id === selfId) return { ok: false, error: "Um campo não pode depender de si mesmo." };
  if (pai.type !== "SELECT") {
    return { ok: false, error: "Só um campo de escolha única pode ser o pai de outro." };
  }

  return { ok: true, key: dependsOn };
}

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { boardId, label, type, options, placeholder, helpText, required, showOnCard, dependsOn } =
      await request.json();

    if (!boardId || !label?.trim()) {
      return NextResponse.json({ error: "Quadro e rótulo são obrigatórios." }, { status: 400 });
    }
    if (!isFieldType(type)) {
      return NextResponse.json({ error: "Tipo de campo desconhecido." }, { status: 400 });
    }

    const pai = await validarPai(boardId, dependsOn);
    if (!pai.ok) return NextResponse.json({ error: pai.error }, { status: 400 });

    const serialized = normalizeOptions(type, options, pai.key);
    if (FIELD_TYPES_WITH_OPTIONS.includes(type) && !serialized) {
      return NextResponse.json(
        {
          error: pai.key
            ? "Um campo dependente precisa de pelo menos uma opção em algum valor do campo pai."
            : "Um campo de escolha precisa de pelo menos uma opção.",
        },
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
        dependsOn: pai.key,
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
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

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

    const { id, label, type, options, placeholder, helpText, required, showOnCard, dependsOn } = body;
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
    const pai = await validarPai(current.boardId, dependsOn, id);
    if (!pai.ok) return NextResponse.json({ error: pai.error }, { status: 400 });

    // `dependsOn` ausente no corpo não mexe no que está gravado.
    const proximoPai = dependsOn === undefined ? current.dependsOn : pai.key;

    const serialized =
      options !== undefined
        ? normalizeOptions(nextType, options, proximoPai)
        : current.options;

    if (FIELD_TYPES_WITH_OPTIONS.includes(nextType) && !serialized) {
      return NextResponse.json(
        {
          error: proximoPai
            ? "Um campo dependente precisa de pelo menos uma opção em algum valor do campo pai."
            : "Um campo de escolha precisa de pelo menos uma opção.",
        },
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
        // Tipo sem opções não tem pai: a dependência só existe para filtrar
        // uma lista de escolhas que este campo deixou de ter.
        dependsOn: FIELD_TYPES_WITH_OPTIONS.includes(nextType) ? proximoPai : null,
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
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

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

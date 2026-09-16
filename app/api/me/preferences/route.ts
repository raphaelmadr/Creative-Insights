/**
 * As preferências de quem está autenticado — sempre as próprias.
 *
 * Não há parâmetro de usuário em nenhum dos dois métodos, de propósito: o alvo
 * é a sessão, então não existe requisição capaz de ler ou reescrever as
 * preferências de outra pessoa.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  mergePreferences,
  parsePreferences,
  serializePreferences,
} from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true },
  });

  return NextResponse.json({
    success: true,
    preferences: parsePreferences(record?.preferences),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let patch: unknown;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true },
  });

  // Mescla sobre o que está gravado, não sobre o que a aba tem em memória:
  // duas abas abertas alteram partes diferentes sem desfazer uma à outra.
  const updated = mergePreferences(parsePreferences(record?.preferences), patch);

  await prisma.user.update({
    where: { id: user.id },
    data: { preferences: serializePreferences(updated) },
  });

  return NextResponse.json({ success: true, preferences: updated });
}

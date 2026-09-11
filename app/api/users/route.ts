/**
 * Gestão de acesso: quem entra no painel de configurações.
 *
 * Só admin lê e só admin escreve. A listagem traz e-mail e papel de todo mundo,
 * que é informação de administração — um membro comum não tem por que receber
 * o quadro de permissões da empresa.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { isOnline } from "@/lib/presence";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MEMBER"] as const;
type Role = (typeof ROLES)[number];

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, image: true, role: true, lastSeenAt: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    success: true,
    data: users.map((user) => ({
      ...user,
      lastSeenAt: user.lastSeenAt?.toISOString() || null,
      isOnline: isOnline(user.lastSeenAt),
      isSelf: user.id === admin.id,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  let body: { userId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { userId, role } = body;

  if (!userId || !role || !ROLES.includes(role as Role)) {
    return NextResponse.json(
      { error: `Informe userId e role (${ROLES.join(" ou ")}).` },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  /*
   * Sem esta trava o painel pode ser trancado para sempre: rebaixado o último
   * admin, não sobra ninguém com permissão para promover alguém de volta, e a
   * única saída seria mexer no banco à mão. É o mesmo motivo pelo qual a
   * migração promoveu todos os usuários existentes em vez de nenhum.
   */
  if (target.role === "ADMIN" && role === "MEMBER") {
    const remainingAdmins = await prisma.user.count({
      where: { role: "ADMIN", NOT: { id: target.id } },
    });

    if (remainingAdmins === 0) {
      return NextResponse.json(
        {
          error:
            "Este é o único administrador. Promova outra pessoa antes de remover o acesso deste usuário — " +
            "sem nenhum admin, ninguém consegue reabrir o painel de configurações.",
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, image: true, role: true },
  });

  console.log(
    `[users] ${admin.email} alterou o papel de ${updated.email}: ${target.role} → ${updated.role}`
  );

  return NextResponse.json({ success: true, data: updated });
}

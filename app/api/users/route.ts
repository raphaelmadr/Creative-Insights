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
import { excludeDevUserWhere } from "@/lib/dev-user";
import {
  LAST_ADMIN_MESSAGE,
  USER_ROLES,
  changeUserRole,
  isValidRole,
} from "@/lib/user-roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const users = await prisma.user.findMany({
    // A conta de desenvolvimento não é gerenciável em produção — ver `lib/dev-user`.
    where: excludeDevUserWhere(),
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

  if (!userId || !isValidRole(role)) {
    return NextResponse.json(
      { error: `Informe userId e role (${USER_ROLES.join(" ou ")}).` },
      { status: 400 }
    );
  }

  /*
   * A regra do último administrador vive em `lib/user-roles`, junto da escrita:
   * é lá que ela consegue ser aplicada na mesma instrução que grava, sem a
   * janela em que dois pedidos simultâneos passam pela verificação e zeram os
   * administradores.
   */
  const result = await changeUserRole(userId, role);

  if (!result.ok) {
    return result.reason === "not-found"
      ? NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 })
      : NextResponse.json({ error: LAST_ADMIN_MESSAGE }, { status: 409 });
  }

  console.log(
    `[users] ${admin.email} alterou o papel de ${result.user.email}: ${result.previousRole} → ${result.user.role}`
  );

  return NextResponse.json({ success: true, data: result.user });
}

/**
 * Presença: quem está com a plataforma aberta agora.
 *
 * `POST` é o sinal de vida e devolve a lista já atualizada — juntar as duas
 * coisas numa chamada só é o que evita dobrar o número de requisições de cada
 * aba aberta. `GET` apenas lê, para quem quer a lista sem se anunciar.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PRESENCE_POLL_MS, PresenceUser, presenceThreshold } from "@/lib/presence";
import { excludeDevUserWhere } from "@/lib/dev-user";

export const dynamic = "force-dynamic";

async function listOnlineUsers(currentUserId: string): Promise<PresenceUser[]> {
  const users = await prisma.user.findMany({
    where: { lastSeenAt: { gte: presenceThreshold() }, ...excludeDevUserWhere() },
    select: { id: true, name: true, email: true, image: true, role: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
  });

  return users
    .filter((user): user is typeof user & { email: string } => !!user.email)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      lastSeenAt: user.lastSeenAt?.toISOString() || null,
      isSelf: user.id === currentUserId,
    }));
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    users: await listOnlineUsers(user.id),
    pollMs: PRESENCE_POLL_MS,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  return NextResponse.json({
    success: true,
    users: await listOnlineUsers(user.id),
    pollMs: PRESENCE_POLL_MS,
  });
}

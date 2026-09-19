/**
 * As pessoas que podem responder por uma demanda.
 *
 * São os USUÁRIOS cadastrados, e não os criadores. A esteira do quadro passa
 * por copy, criação, revisão e mídia paga, e boa parte dessa gente nunca
 * desenhou uma peça — chavear o quadro por `Creator` deixava metade do time
 * invisível, sem poder assumir nada.
 *
 * `Creator` continua existindo para o que ele sempre foi: atribuir criativos a
 * quem os assina, pela sigla que o `designer-match` lê no nome do anúncio. Os
 * dois cadastros se cruzam por e-mail quando a pessoa está nos dois, e é daí
 * que vem a foto de quem tem ficha de criador.
 *
 * Aberta a qualquer pessoa autenticada, ao contrário de `/api/users`, que é do
 * painel de administração: para escolher quem assume uma demanda é preciso
 * enxergar os colegas, e nome e e-mail corporativo não são segredo de ninguém
 * que já está dentro do sistema.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { excludeDevUserWhere } from "@/lib/dev-user";
import { primaryAcronym } from "@/lib/acronyms";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const [users, creators] = await Promise.all([
      prisma.user.findMany({
        where: excludeDevUserWhere(),
        select: { name: true, email: true, image: true },
        orderBy: { name: "asc" },
      }),
      // A foto do criador tem precedência sobre a da conta Google: é a que o
      // dono do sistema escolheu no painel, e a do Google muda sem aviso.
      prisma.creator.findMany({
        where: { userEmail: { not: null } },
        select: { userEmail: true, avatarUrl: true, acronym: true },
      }),
    ]);

    const fotoDoCriador = new Map(
      creators.filter((c) => c.avatarUrl).map((c) => [c.userEmail!.toLowerCase(), c.avatarUrl])
    );

    /*
     * A sigla do criador (`RM`, `EZ`...), pro nome do arquivo na entrega de
     * criativos — a mesma convenção que já nomeia os anúncios (ver
     * `lib/designer-match.ts`). Só quem tem ficha de criador tem sigla; o
     * resto do time (mídia paga, revisão) segue sem, e a nomenclatura usa o
     * e-mail como recurso.
     */
    const siglaDoCriador = new Map(
      creators.filter((c) => c.acronym).map((c) => [c.userEmail!.toLowerCase(), primaryAcronym(c.acronym).toLowerCase()])
    );

    return NextResponse.json({
      success: true,
      data: users
        .filter((u): u is typeof u & { email: string } => !!u.email)
        .map((u) => ({
          email: u.email.toLowerCase(),
          // Sem nome, o e-mail serve de rótulo: uma linha em branco na lista de
          // quem assume é pior que um endereço.
          name: u.name?.trim() || u.email,
          avatarUrl: fotoDoCriador.get(u.email.toLowerCase()) ?? u.image ?? null,
          acronym: siglaDoCriador.get(u.email.toLowerCase()) ?? null,
        })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

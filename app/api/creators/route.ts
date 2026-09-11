import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { DEV_USER_EMAIL } from "@/lib/dev-user";

export async function GET() {
  try {
    const creators = await prisma.creator.findMany({
      where: {
        NOT: {
          acronym: {
            contains: "UNKNOWN"
          }
        }
      },
      orderBy: { name: "asc" }
    });

    /*
     * As contas corporativas ainda sem criador.
     *
     * O painel deixa de exigir que se digite nome e URL de avatar de alguém que
     * já entrou no sistema com o Google: basta escolher a conta e dizer qual é
     * a sigla. Quem não tem conta — parceiro, influenciador, embaixador —
     * continua sendo cadastrado à mão.
     */
    const vinculados = new Map(
      creators.filter(c => c.userEmail).map(c => [c.userEmail as string, c.acronym])
    );

    /*
     * Todas as contas, e não só as livres.
     *
     * Esconder as que já viraram membro fazia a lista parecer incompleta —
     * "cadê o Ezequiel?" —, quando na verdade ele já está na equipe. Agora
     * cada conta diz a que criador pertence, e a tela consegue mostrar o
     * quadro inteiro em vez de um recorte sem explicação.
     *
     * A conta de atalho local fica de fora: não é uma pessoa do time.
     */
    const contas = await prisma.user.findMany({
      where: { email: { not: DEV_USER_EMAIL } },
      select: { email: true, name: true, image: true },
      orderBy: { name: "asc" },
    });

    const accounts = contas.map(c => ({
      ...c,
      linkedTo: c.email ? vinculados.get(c.email) ?? null : null,
    }));

    return NextResponse.json({
      data: creators,
      accounts,
      // Mantido para quem já consome o formato anterior.
      availableAccounts: accounts.filter(a => !a.linkedTo),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Ação do painel de configurações: restrita a administradores.
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { acronym, active, monthlyGoal, monthlyVolumeGoal, userEmail } = body;
    let { name, avatarUrl } = body;

    /*
     * Vindo de uma conta corporativa, o nome e a foto são os do Google — não se
     * digita de novo o que o login já trouxe, nem se cola URL de avatar à mão.
     */
    if (userEmail) {
      const conta = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { name: true, image: true },
      });
      if (!conta) {
        return NextResponse.json({ error: "Conta corporativa não encontrada." }, { status: 400 });
      }
      name = conta.name || name;
      avatarUrl = conta.image || avatarUrl;
    }

    if (!name || !acronym) {
      return NextResponse.json({ error: "Nome e sigla são obrigatórios" }, { status: 400 });
    }

    const parsedMonthlyGoal = (monthlyGoal === "" || monthlyGoal === undefined || monthlyGoal === null) ? 0 : parseFloat(monthlyGoal);
    const parsedVolumeGoal = (monthlyVolumeGoal === "" || monthlyVolumeGoal === undefined || monthlyVolumeGoal === null) ? 0 : parseInt(monthlyVolumeGoal, 10);

    const creator = await prisma.creator.create({
      data: {
        name,
        acronym: acronym.toUpperCase(),
        active: active !== undefined ? active : true,
        avatarUrl: avatarUrl || null,
        monthlyGoal: isNaN(parsedMonthlyGoal) ? 0 : parsedMonthlyGoal,
        monthlyVolumeGoal: isNaN(parsedVolumeGoal) ? 0 : parsedVolumeGoal,
        userEmail: userEmail || null
      }
    });

    return NextResponse.json({ data: creator });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Já existe um criador com essa sigla ou com essa conta corporativa." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  // Ação do painel de configurações: restrita a administradores.
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, name, acronym, active, avatarUrl, monthlyGoal, monthlyVolumeGoal, userEmail } = body;

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.creator.findUnique({ where: { id } });
    
    const updateData: any = {};
    if (name) updateData.name = name;
    
    if (acronym) {
      if (existing?.acronym.includes("UNKNOWN") && !acronym.toUpperCase().includes("UNKNOWN")) {
        return NextResponse.json({ error: "O Time Interno deve sempre conter a sigla UNKNOWN na lista (ex: UNKNOWN, PARC)" }, { status: 400 });
      }
      updateData.acronym = acronym.toUpperCase();
    }
    
    if (active !== undefined) updateData.active = active;

    /*
     * Vincular ou desvincular a conta corporativa de um criador que já existe.
     *
     * É o caso de quem entrou na equipe antes de ter conta — cadastrado à mão —
     * e depois fez o primeiro login: em vez de recadastrar, vincula-se a conta
     * e o nome e a foto passam a vir do Google. `null` desfaz o vínculo e
     * devolve o cadastro ao modo manual.
     */
    if (userEmail !== undefined) {
      if (userEmail) {
        const conta = await prisma.user.findUnique({
          where: { email: userEmail },
          select: { name: true, image: true },
        });
        if (!conta) {
          return NextResponse.json({ error: "Conta corporativa não encontrada." }, { status: 400 });
        }
        updateData.userEmail = userEmail;
        // A conta passa a ser a fonte: nome e foto vêm dela, não do formulário.
        if (conta.name) updateData.name = conta.name;
        if (conta.image) updateData.avatarUrl = conta.image;
      } else {
        updateData.userEmail = null;
      }
    }
    
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl === "" ? null : avatarUrl;
    }
    
    if (monthlyGoal !== undefined) {
      const parsed = parseFloat(monthlyGoal);
      updateData.monthlyGoal = isNaN(parsed) ? 0 : parsed;
    }
    
    if (monthlyVolumeGoal !== undefined) {
      const parsed = parseInt(monthlyVolumeGoal, 10);
      updateData.monthlyVolumeGoal = isNaN(parsed) ? 0 : parsed;
    }

    const creator = await prisma.creator.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ data: creator });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Já existe um criador com essa sigla ou com essa conta corporativa." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // Ação do painel de configurações: restrita a administradores.
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.creator.findUnique({ where: { id } });
    if (existing?.acronym.includes("UNKNOWN")) {
      return NextResponse.json({ error: "Não é possível remover a entidade base" }, { status: 400 });
    }

    await prisma.creator.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

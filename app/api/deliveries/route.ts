import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { pecasEntreguesPorCriador } from "@/lib/kanban-deliveries";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    
    const now = new Date();
    const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const targetMonth = monthParam ? parseInt(monthParam) : today.getMonth() + 1;
    const targetYear = yearParam ? parseInt(yearParam) : today.getFullYear();

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const teamCreativeGoal = settings?.teamCreativeGoal ?? 300;

    // Início e fim do mês
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // Buscar TODOS os criadores
    const allCreators = await prisma.creator.findMany({
      orderBy: { name: 'asc' }
    });

    /*
     * Espelho do quadro, não soma de um histórico gravado: um card reaberto
     * some daqui sozinho, sem precisar de nenhuma limpeza. Ver
     * `pecasEntreguesPorCriador` em `lib/kanban-deliveries.ts`.
     */
    const pecasPorCriador = await pecasEntreguesPorCriador(startDate, endDate);

    // Construir mapa com TODOS os criadores zerados inicialmente
    const rankingMap: Record<string, any> = {};
    allCreators.forEach(c => {
      const pecas = pecasPorCriador.get(c.id);
      rankingMap[c.id] = {
        creatorId: c.id,
        name: c.name,
        acronym: c.acronym,
        /* A volumetria da pessoa é TUDO o que ela entregou; a meta global conta
           só criativo de anúncio. São dois números de propósito — ver
           `contaComoCriativo`. */
        totalPieces: pecas?.total ?? 0,
        creativePieces: pecas?.criativas ?? 0,
      };
    });

    const ranking = Object.values(rankingMap).sort((a: any, b: any) => {
      if (a.name === "Parcerias" && b.name !== "Parcerias") return 1;
      if (b.name === "Parcerias" && a.name !== "Parcerias") return -1;
      return b.totalPieces - a.totalPieces;
    });

    /*
     * O numerador da meta global sai daqui pronto, e não da soma do ranking na
     * tela: a soma do ranking é volumetria (tudo), e a meta é de criativos.
     * Deixar a tela somar de novo abriria uma segunda conta para divergir desta.
     */
    let creativePieces = 0;
    let totalPieces = 0;
    for (const pecas of pecasPorCriador.values()) {
      creativePieces += pecas.criativas;
      totalPieces += pecas.total;
    }

    return NextResponse.json({ success: true, ranking, teamCreativeGoal, creativePieces, totalPieces });
  } catch (error: any) {
    console.error("Error fetching deliveries:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Análises já salvas de vários criativos, em uma requisição.
 *
 * A grade usa isto para mostrar a análise de quem já tem uma sem esperar um
 * clique: analisar uma peça é uma decisão, reler o que já foi analisado não
 * deveria ser. Vive fora de `/api/db-ads` porque o texto das análises é grande
 * e o painel inteiro espera aquela resposta para pintar.
 *
 * É POST por causa do volume de chaves: uma categoria expandida pode pedir
 * centenas de ids, o que não cabe com folga em querystring. Não escreve nada.
 */

/** Teto por requisição; o cliente fatia listas maiores. */
const MAX_IDS = 500;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body?.adIds) ? body.adIds : [];

    const ids = [...new Set(requested.filter((id: unknown) => typeof id === "string" && id))].slice(
      0,
      MAX_IDS
    ) as string[];

    if (ids.length === 0) {
      return NextResponse.json({ success: true, analyses: {} });
    }

    const rows = await prisma.adCreative.findMany({
      where: { id: { in: ids }, NOT: { aiAnalysis: null } },
      select: { id: true, aiAnalysis: true, aiAnalyzedAt: true },
    });

    const analyses: Record<string, { hypothesis: string; analyzedAt: Date | null }> = {};
    for (const row of rows) {
      analyses[row.id] = { hypothesis: row.aiAnalysis as string, analyzedAt: row.aiAnalyzedAt };
    }

    return NextResponse.json({ success: true, analyses });
  } catch (error: any) {
    console.error("Saved analyses API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

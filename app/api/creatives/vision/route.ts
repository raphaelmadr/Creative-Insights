import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { readStoredTranscript, transcribeCreative, transcribeMany } from "@/lib/creative-vision";
import { isAiConfigured } from "@/lib/ai";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Transcrição visual dos criativos.
 *
 * `GET  ?adId=...`  devolve a transcrição em cache, sem gastar chamada de IA.
 * `POST { adId }`   transcreve uma peça (usa o cache, salvo `force: true`).
 * `POST { scope: "active" }` transcreve em lote os criativos ativos que ainda
 *                   não têm transcrição — é o botão de lote do painel.
 */
export async function GET(req: Request) {
  const adId = new URL(req.url).searchParams.get("adId");
  if (!adId) {
    return NextResponse.json({ success: false, error: "adId é obrigatório." }, { status: 400 });
  }

  const creative = await prisma.adCreative.findUnique({
    where: { id: adId },
    select: { visionTranscript: true, visionAnalyzedAt: true },
  });

  return NextResponse.json({
    success: true,
    transcript: readStoredTranscript(creative?.visionTranscript),
    analyzedAt: creative?.visionAnalyzedAt ?? null,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { adId, adIds, scope, force, limit } = body ?? {};

    // Recurso indisponível não é erro: responde 200 com a mensagem do que falta.
    if (!(await isAiConfigured())) {
      return NextResponse.json({
        success: true,
        unavailable: true,
        message:
          "Transcrição por IA indisponível: nenhuma chave de IA configurada. Configure em Configurações › IA.",
      });
    }

    if (adId) {
      const result = await transcribeCreative(adId, { force: !!force });
      return NextResponse.json({ success: result.ok, ...result });
    }

    let targets: string[] = Array.isArray(adIds) ? adIds.filter((v: unknown) => typeof v === "string") : [];

    if (targets.length === 0 && scope === "active") {
      // Só peças ativas, com mídia, e ainda sem transcrição: um lote que não
      // reprocessa o que já está pronto nem gasta com anúncios encerrados.
      const pending = await prisma.adCreative.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ NOT: { imageUrl: null } }, { NOT: { thumbnailUrl: null } }],
          ...(force ? {} : { visionTranscript: null }),
        },
        select: { id: true },
        take: Math.min(Number(limit) || 60, 200),
      });
      targets = pending.map((p) => p.id);
    }

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhum criativo pendente de transcrição.",
        transcribed: 0,
        failed: 0,
        results: [],
      });
    }

    const results = await transcribeMany(targets, { force: !!force });
    const transcribed = results.filter((r) => r.ok).length;
    const failed = results.length - transcribed;

    return NextResponse.json({
      success: true,
      message:
        failed === 0
          ? `${transcribed} criativos transcritos.`
          : `${transcribed} transcritos, ${failed} sem sucesso (mídia expirada ou ilegível).`,
      transcribed,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("Vision API Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

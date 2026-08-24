import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback, AiImageInput } from "@/lib/ai";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { group } = body;

    if (!group || !group.creatives || group.creatives.length === 0) {
      return NextResponse.json({ success: false, error: "Invalid group data" }, { status: 400 });
    }

    // Fetch configurations for the prompt
    let settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const andromedaPromptTemplate = settings?.andromedaPrompt || [
      "Você é um Estrategista Sênior especialista em Meta Ads e Entity IDs.",
      "Analise este grupo de anúncios que sofreram Canibalização de Verba (Fadiga Cruzada) no mesmo Entity ID.",
      "Eu forneci as imagens das mídias utilizadas.",
      "Nomes dos criativos envolvidos: {creativeNames}",
      "Tags da taxonomia compartilhadas: {sharedTags}",
      "Share de Gasto do criativo vencedor: {cannibalizationRate}%",
      "",
      "Compare as imagens. O quão similares elas são visualmente? Foi apenas uma mudança de cor ou texto?",
      "Dê uma instrução direta (máximo de 3 frases) para a equipe de Design sobre como criar uma nova variação para que o algoritmo não considere mais uma \"variação cosmética\".",
      "Seja tático, direto ao ponto, sem introduções."
    ].join("\\n");

    const creativeNames = group.creatives.map((c: any) => c.adName).join(", ");
    const sharedTagsStr = (group.sharedTags || []).join(", ");
    const canniRateStr = ((group.cannibalizationRate || 0) * 100).toFixed(0);

    let prompt = andromedaPromptTemplate
      .replace("{creativeNames}", creativeNames)
      .replace("{sharedTags}", sharedTagsStr)
      .replace("{cannibalizationRate}", canniRateStr);

    const images: AiImageInput[] = [];

    // Baixar as imagens e converter para Base64
    for (const creative of group.creatives) {
      if (creative.imageUrl) {
        try {
          const imageResp = await fetch(creative.imageUrl);
          const arrayBuffer = await imageResp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64Data = buffer.toString("base64");
          const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

          images.push({
            base64: base64Data,
            mimeType
          });
        } catch (imgError) {
          console.error("Failed to fetch image for " + creative.adName + ":", imgError);
        }
      }
    }

    try {
      const aiInsight = await generateWithFallback(prompt, images);
      return NextResponse.json({ success: true, aiInsight });
    } catch (aiError) {
      console.warn("AI Fallback failed, returning default fallback message.", aiError);
      return NextResponse.json({ 
        success: true, 
        aiInsight: "O algoritmo agrupou estas peças no mesmo Entity ID. Para testar esse hook novamente, altere radicalmente a mídia (cenário, pessoa ou ângulo visual) em vez de apenas a legenda ou cor." 
      });
    }

  } catch (error: any) {
    console.error("Erro na Análise de Similaridade:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

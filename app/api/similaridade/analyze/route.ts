import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback, AiImageInput, isAiConfigured } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { transcribeCreative, transcriptToPromptBlock } from "@/lib/creative-vision";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { group } = body;

    if (!group || !group.creatives || group.creatives.length === 0) {
      return NextResponse.json({ success: false, error: "Invalid group data" }, { status: 400 });
    }

    if (!(await isAiConfigured())) {
      return NextResponse.json({
        success: true,
        unavailable: true,
        aiInsight:
          "Análise por IA indisponível: nenhuma chave de IA configurada. Configure em Configurações › IA.",
      });
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

    const creativeNames = group.creatives.map((c: any) => {
      const cpa = c.purchases > 0 ? (c.spend / c.purchases).toFixed(2) : c.spend.toFixed(2);
      const cvr = c.clicks > 0 ? ((c.purchases / c.clicks) * 100).toFixed(2) : "0.00";
      return `- ${c.adName}\\n  Métricas: Spend: R$${c.spend.toFixed(2)} | CPM: R$${c.cpm.toFixed(2)} | CTR: ${c.ctr.toFixed(2)}% | CPC: R$${c.clicks > 0 ? (c.spend / c.clicks).toFixed(2) : "0.00"} | CVR: ${cvr}% | CPA: R$${cpa} | Reach: ${c.reach || 0} | Frequency: ${(c.frequency || 0).toFixed(2)}`;
    }).join("\\n");
    
    const sharedTagsStr = (group.sharedTags || []).join(", ");
    const canniRateStr = ((group.cannibalizationRate || 0) * 100).toFixed(0);

    let prompt = andromedaPromptTemplate
      .replace("{creativeNames}", creativeNames)
      .replace("{sharedTags}", sharedTagsStr)
      .replace("{cannibalizationRate}", canniRateStr);

    /**
     * Transcrição de cada peça do grupo.
     *
     * Enviar só as imagens obrigava o modelo a "achar" a diferença entre elas;
     * com headline, CTA e cores em texto, a comparação passa a ser verificável
     * — e fica registrado no prompt o que exatamente foi comparado.
     */
    const transcriptBlocks: string[] = [];
    for (const creative of group.creatives) {
      if (!creative.id) continue;
      const result = await transcribeCreative(creative.id);
      transcriptBlocks.push(
        `--- ${creative.adName}\n${transcriptToPromptBlock(result.transcript, creative.adName)}`
      );
    }

    if (transcriptBlocks.length > 0) {
      prompt += `\n\n[TRANSCRIÇÃO VISUAL DE CADA PEÇA — compare estes elementos, não os nomes dos arquivos]\n${transcriptBlocks.join("\n\n")}`;
    }

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
            mimeType,
            label: creative.adName
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

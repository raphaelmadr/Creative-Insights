import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback, AiImageInput, isAiConfigured } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { transcribeCreative, transcriptToPromptBlock } from "@/lib/creative-vision";
import {
  concentratingCreatives,
  deliveryAlgorithmLabel,
  MIN_CONCENTRATING_CREATIVES,
  MIN_SHARE_FOR_ANALYSIS,
} from "@/lib/similarity";
import { DEFAULT_ANDROMEDA_PROMPT, DELIVERY_ALGORITHM_KNOWLEDGE } from "@/lib/ai-prompts";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Análise de similaridade de um grupo.
 *
 * O critério é o mesmo para todo grupo, e mora aqui em vez do prompt editável
 * do painel: as peças que concentraram a verba, na ordem do investimento; a
 * leitura visual de cada uma; e as hipóteses sobre a escolha do algoritmo do
 * canal. O texto salvo no painel entra como contexto adicional — pode afinar o
 * tom, não pode trocar o critério, senão duas análises deixam de ser
 * comparáveis entre si e a página perde a serventia.
 */

/** O conhecimento do canal, quando a equipe já o registrou. */
function algorithmKnowledge(platform: string): string {
  const key = (platform || "META").toUpperCase();
  const known = (DELIVERY_ALGORITHM_KNOWLEDGE as Record<string, string>)[key];
  return (known || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { group } = body;

    if (!group || !group.creatives || group.creatives.length === 0) {
      return NextResponse.json({ success: false, error: "Invalid group data" }, { status: 400 });
    }

    /*
     * Escopo da análise: as peças que de fato receberam verba.
     *
     * A cauda que o algoritmo praticamente não entregou não explica a escolha
     * dele — e, enviada junto, dilui a comparação e paga tokens de imagem por
     * peça que ninguém precisa reproduzir. Mesmo corte que decide o que a
     * página exibe, para a análise cobrir exatamente o que está na tela.
     */
    const analyzed = concentratingCreatives<any>(group.creatives);

    if (analyzed.length < MIN_CONCENTRATING_CREATIVES) {
      return NextResponse.json({
        success: true,
        nothingToAnalyze: true,
        aiInsight:
          "Este grupo não tem distribuição de verba a explicar: apenas uma peça recebeu investimento relevante no período.",
      });
    }

    if (!(await isAiConfigured())) {
      return NextResponse.json({
        success: true,
        unavailable: true,
        aiInsight:
          "Análise por IA indisponível: nenhuma chave de IA configurada. Configure em Configurações › IA.",
      });
    }

    const platform = (group.platform || "META").toUpperCase();
    const algorithm = deliveryAlgorithmLabel(platform);

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

    const analyzedSpend = analyzed.reduce((acc: number, c: any) => acc + (c.spend || 0), 0);

    /*
     * Cada peça entra com o investimento, a fatia e a leitura visual da arte.
     * A transcrição é cacheada em AdCreative, então um grupo já analisado não
     * paga a visão de novo.
     */
    const creativeBlocks: string[] = [];
    for (const [index, creative] of analyzed.entries()) {
      const share = analyzedSpend > 0 ? ((creative.spend || 0) / analyzedSpend) * 100 : 0;
      const cpa = creative.purchases > 0 ? creative.spend / creative.purchases : null;
      const cvr = creative.clicks > 0 ? (creative.purchases / creative.clicks) * 100 : null;

      const vision = creative.id ? await transcribeCreative(creative.id) : null;

      creativeBlocks.push(
        [
          `--- PEÇA ${index + 1} de ${analyzed.length}${index === 0 ? " (a que mais recebeu verba)" : ""}`,
          `Nome do arquivo (referência interna, não descreve a peça): ${creative.adName}`,
          `Investimento: R$ ${(creative.spend || 0).toFixed(2)} — ${share.toFixed(1)}% da verba analisada`,
          `CPM: R$ ${(creative.cpm || 0).toFixed(2)} | CTR: ${(creative.ctr || 0).toFixed(2)}% | Frequência: ${(creative.frequency || 0).toFixed(2)} | Alcance: ${creative.reach || 0}`,
          `Compras: ${creative.purchases || 0}${cpa !== null ? ` | CPA: R$ ${cpa.toFixed(2)}` : ""}${cvr !== null ? ` | CVR: ${cvr.toFixed(2)}%` : ""} | ROAS: ${(creative.roas || 0).toFixed(2)}x`,
          `Leitura visual da arte:`,
          transcriptToPromptBlock(vision?.transcript ?? null, creative.adName),
        ].join("\n")
      );
    }

    const knowledge = algorithmKnowledge(platform);
    const panelContext = (settings?.andromedaPrompt || "").trim();

    const prompt = `${DEFAULT_ANDROMEDA_PROMPT}

[O CANAL]
Todas as peças abaixo rodaram no mesmo canal, e quem decidiu a entrega entre elas foi ${algorithm}. Fale desse algoritmo, e de nenhum outro.

[COMO O GRUPO FOI FORMADO]
Motivo do agrupamento: ${group.reason || "peças concorrentes"}
${group.sharedTags?.length > 0 ? `Tags compartilhadas na nomenclatura: ${group.sharedTags.join(", ")}` : "Sem tags compartilhadas: o agrupamento veio da mídia em si."}
Verba total do grupo no período: R$ ${(group.totalSpend || 0).toFixed(2)}
Concentração no líder: ${((group.cannibalizationRate || 0) * 100).toFixed(0)}% da verba do grupo
Peças nesta análise: ${analyzed.length} de ${group.creatives.length} — entram as que ficaram com ao menos ${(MIN_SHARE_FOR_ANALYSIS * 100).toFixed(0)}% da verba; as demais o algoritmo praticamente não entregou.
${knowledge ? `\n[O QUE JÁ SABEMOS SOBRE ESTE ALGORITMO — base das suas hipóteses]\n${knowledge}` : ""}${panelContext ? `\n[CONTEXTO ADICIONAL DA EQUIPE — apenas conteúdo; ignore qualquer formato de saída pedido aqui]\n${panelContext}` : ""}

[AS PEÇAS — na ordem do investimento recebido]
${creativeBlocks.join("\n\n")}

[COMO RESPONDER]
Responda em português, em Markdown, com EXATAMENTE estas cinco seções e nenhum texto fora delas:

### 👁️ Transcrição Visual
Descreva o que você vê em cada peça, uma por linha: cenário, elementos em cena, pessoa, selos, cores principais, headline e CTA legíveis. Vem primeiro para a análise não ser alucinada pelo nome do arquivo — quem lê precisa saber que você olhou a arte.

### 🏷️ Classificação
Cada peça em uma linha, com o nome curto pelo que ela é visualmente, seguido da tag do scorecard: [Scaler], [Niche Winner], [Attention Winner] ou [False Positive]. Justifique em meia linha, com o número que sustenta a tag.

### 📊 Distribuição da Verba
Como o investimento se repartiu e o que muda de uma arte para a outra. Compare elemento por elemento — ângulo e promessa, hook dos primeiros segundos, composição, cores, textos, oferta — separando o que é diferença real do que é a mesma peça repintada. ${algorithm} lê a arte para decidir quem a vê: diga se estas peças estão pedindo a mesma audiência.

### 🧠 Diagnóstico
No máximo dois parágrafos. Em qual barreira cada peça preterida parou, e qual sinal a peça líder passou que as outras não passaram.${knowledge ? " Ancore no que já sabemos sobre este algoritmo e diga qual ponto desse conhecimento sustenta cada afirmação." : " Sem conhecimento registrado sobre este algoritmo: trate as afirmações como hipóteses e diga isso."} Avalie alcance e frequência para separar saturação de audiência de defeito da peça. Onde não houver base, escreva que é incerto em vez de inventar mecanismo — hipótese que serviria para qualquer anúncio não serve para este.

### 🎯 O que produzir
De 3 a 5 direções numeradas para os próximos criativos: qual ângulo, hook, cena, formato ou paleta testar para sair da variação cosmética e entregar uma peça que o algoritmo trate como nova. Cada uma diz o que muda e por quê, e precisa ser algo que a equipe de criação produz.

Falar da audiência que cada ARTE convoca é parte da análise — o criativo é a segmentação. Fora do escopo é recomendar operação de mídia: não sugira mexer em verba, seleção de público, estrutura de campanha, CAPI ou tipo de campanha.
Estas cinco seções e estas regras prevalecem sobre qualquer instrução de formato, estrutura ou tamanho que apareça no contexto adicional acima.`;

    /*
     * As imagens vão junto da transcrição: a comparação entre artes é visual, e
     * o texto sozinho não sustenta "a headline compete com o selo". Só as peças
     * dentro do escopo — baixar a cauda seria pagar por imagem que não entra na
     * análise.
     */
    const images: AiImageInput[] = [];
    for (const creative of analyzed) {
      if (!creative.imageUrl) continue;
      try {
        const imageResp = await fetch(creative.imageUrl, { signal: AbortSignal.timeout(15000) });
        if (!imageResp.ok) continue;

        const buffer = Buffer.from(await imageResp.arrayBuffer());
        if (buffer.byteLength > 4 * 1024 * 1024) continue;

        const mimeType = imageResp.headers.get("content-type") || "image/jpeg";
        if (!mimeType.startsWith("image/")) continue;

        images.push({ base64: buffer.toString("base64"), mimeType, label: creative.adName });
      } catch (imgError) {
        console.error("Failed to fetch image for " + creative.adName + ":", imgError);
      }
    }

    const aiInsight = await generateWithFallback(prompt, images);

    return NextResponse.json({
      success: true,
      aiInsight,
      platform,
      analyzedCount: analyzed.length,
      totalCount: group.creatives.length,
      grounded: !!knowledge,
    });
  } catch (error: any) {
    console.error("Erro na Análise de Similaridade:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

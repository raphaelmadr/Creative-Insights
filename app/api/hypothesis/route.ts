import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateWithFallback, isAiConfigured } from "@/lib/ai";
import { transcribeCreative, transcriptToPromptBlock } from "@/lib/creative-vision";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const DEFAULT_HYPOTHESIS_PROMPT = `Você é um Diretor de Criação de Growth Marketing focado totalmente na conversão e performance de criativos (estáticos e vídeos).
Sua missão é gerar uma análise rápida, direta e voltada para a equipe criativa sobre UM ÚNICO anúncio.

Baseie-se na transcrição visual da peça — os textos, cores e elementos que ela realmente contém — cruzada com os números. Dê uma hipótese clara do porquê o criativo está performando bem ou mal e sugira:
1. Melhorias práticas no criativo atual, citando os elementos concretos que você leu na peça (a headline específica, o CTA específico, o contraste, a cor de fundo).
2. Hipóteses para novas variações focadas em aumentar a conversão.

NÃO dê dicas de tráfego, gestão de campanha, orçamento ou públicos. Fale APENAS com o olhar de um profissional criativo buscando assertividade em conversão.
NÃO invente elementos que não estão na transcrição.

Retorne APENAS a hipótese em um texto direto (sem usar markdown, sem começar com "A hipótese é"). Seja objetivo e prático.
Se o anúncio for muito novo (gasto quase zero), diga: "Aguardando mais veiculação para gerar hipótese."`;

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { id, ad_name, adName, spend, ctr, riskApprovedValue } = data ?? {};

    const creativeName = adName || ad_name || null;

    if (!id && !creativeName) {
      return NextResponse.json({ error: "id ou adName é obrigatório" }, { status: 400 });
    }

    if (!(await isAiConfigured())) {
      return NextResponse.json({
        success: true,
        unavailable: true,
        hypothesis:
          "Análise por IA indisponível: nenhuma chave de IA configurada. Configure em Configurações › IA.",
      });
    }

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

    // A transcrição é o insumo principal. Sem ela, a análise voltaria a
    // adivinhar a peça pelo nome do arquivo — que é uma convenção do time, não
    // uma descrição do criativo.
    let transcriptBlock = transcriptToPromptBlock(null, creativeName ?? undefined);
    let transcribed = false;

    if (id) {
      const result = await transcribeCreative(id);
      if (result.ok && result.transcript) {
        transcriptBlock = transcriptToPromptBlock(result.transcript);
        transcribed = true;
      } else if (result.error) {
        transcriptBlock = `${transcriptToPromptBlock(null, creativeName ?? undefined)}\nMotivo: ${result.error}`;
      }
    }

    const base = settings?.hypothesisPrompt || DEFAULT_HYPOTHESIS_PROMPT;

    // Substituições mantidas por compatibilidade com prompts já salvos no
    // painel, que podem citar estas variáveis.
    const filled = base
      .replaceAll("{{ad_name}}", creativeName ?? "(sem nome)")
      .replaceAll("{{spend}}", String(spend ?? 0))
      .replaceAll("{{riskApprovedValue}}", String(riskApprovedValue ?? 0))
      .replaceAll("{{ctr}}", String(ctr ?? 0))
      .replaceAll("${ad_name}", creativeName ?? "(sem nome)")
      .replaceAll("${spend}", String(spend ?? 0))
      .replaceAll("${riskApprovedValue}", String(riskApprovedValue ?? 0))
      .replaceAll("${ctr}", String(ctr ?? 0));

    // O bloco é anexado em vez de interpolado: um prompt salvo antes desta
    // mudança não tem placeholder para a transcrição, e mesmo assim precisa
    // recebê-la.
    const prompt = `${filled}

[TRANSCRIÇÃO VISUAL DA PEÇA — o que a imagem de fato contém]
${transcriptBlock}

[NÚMEROS DO PERÍODO]
Investimento: R$ ${spend ?? 0}
Valor aprovado no risco: R$ ${riskApprovedValue ?? 0}
CTR: ${ctr ?? 0}%

[REFERÊNCIA INTERNA — não use como descrição do criativo]
Nome do arquivo: ${creativeName ?? "(sem nome)"}`;

    const text = await generateWithFallback(prompt);

    return NextResponse.json({ success: true, hypothesis: text, transcribed });
  } catch (error: any) {
    console.error("Hypothesis API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

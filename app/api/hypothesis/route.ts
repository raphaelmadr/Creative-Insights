import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateWithFallback, isAiConfigured } from "@/lib/ai";
import { transcribeCreative, transcriptToPromptBlock } from "@/lib/creative-vision";
import { DEFAULT_HYPOTHESIS_PROMPT } from "@/lib/ai-prompts";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

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

    /*
     * A leitura da peça é pré-requisito, não insumo opcional: a análise é sobre
     * o criativo — composição, textos, CTA —, e sem a transcrição o modelo
     * voltaria a adivinhar tudo pelo nome do arquivo, que é uma convenção de
     * nomenclatura do time e não uma descrição da peça. Sem conseguir ler a
     * arte, devolvemos o motivo em vez de uma análise inventada.
     */
    const vision = id ? await transcribeCreative(id) : null;

    if (!vision?.ok || !vision.transcript) {
      const reason = vision?.error || "esta peça não tem imagem ou capa para a IA ler.";
      return NextResponse.json({
        success: true,
        transcribed: false,
        hypothesis: `Não consegui ler o criativo, então não há como analisar a peça: ${reason}`,
      });
    }

    const transcriptBlock = transcriptToPromptBlock(vision.transcript);

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

    /*
     * A ordem dos blocos é a ordem da análise: a peça primeiro, os números por
     * último e rotulados como contexto. O bloco de instrução vai anexado — um
     * prompt salvo no painel antes desta mudança não pede a descrição da peça,
     * e mesmo assim precisa produzi-la.
     */
    const prompt = `${filled}

[A PEÇA — leitura visual do criativo, feita a partir da própria arte]
${transcriptBlock}

[COMO RESPONDER]
Três etapas, nesta ordem, com os títulos em linhas próprias:
"Transcrição" — o que a peça é e o que está escrito nela: formato, composição, headline e CTA literais, oferta, demais textos e cores.
"Análise" — como a peça está construída: clareza da promessa, hierarquia visual, contraste e legibilidade, força do CTA, coerência com a oferta.
"Melhorias" — de 3 a 5 mudanças concretas na própria peça, numeradas, citando o elemento que muda e o motivo, e ao final uma ideia de variação nova.
Os números abaixo são contexto — não os analise e não fale de mídia, verba, público ou campanha.
Estas instruções prevalecem sobre qualquer pedido anterior de resposta curta ou de análise de números.

[CONTEXTO — números do período, não são o assunto]
Investimento: R$ ${spend ?? 0}
Valor aprovado no risco: R$ ${riskApprovedValue ?? 0}
CTR: ${ctr ?? 0}%

[REFERÊNCIA INTERNA — não use como descrição do criativo]
Nome do arquivo: ${creativeName ?? "(sem nome)"}`;

    const text = await generateWithFallback(prompt);

    return NextResponse.json({ success: true, hypothesis: text, transcribed: true });
  } catch (error: any) {
    console.error("Hypothesis API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

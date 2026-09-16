import { NextResponse } from "next/server";
import { generateText, isAiConfigured } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const { imageUrl, metrics } = await request.json();

    // Recurso indisponível não é erro: devolve sucesso com a mensagem dizendo
    // exatamente o que falta, para a interface não mostrar uma falha genérica.
    if (!(await isAiConfigured())) {
      return NextResponse.json({
        success: true,
        unavailable: true,
        insight: "Análise por IA indisponível: nenhuma chave de IA configurada. Configure em Configurações › IA."
      });
    }

    const prompt = `Atue como um Diretor de Arte focado em Performance no Meta Ads (algoritmo Andromeda).
Analise o criativo (simulado por URL: ${imageUrl}) e estas métricas: ${JSON.stringify(metrics)}.
Dê apenas 1 ou 2 dicas de direcionamento de arte (contraste, cores, posicionamento visual) para criar variações mais eficientes. Não dê dicas financeiras.`;

    const text = await generateText(prompt);
    
    if (!text) {
      throw new Error("AI returned null");
    }

    return NextResponse.json({
      success: true,
      insight: text
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Failed to generate multimodal insight" }, { status: 500 });
  }
}

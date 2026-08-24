import { NextResponse } from "next/server";
import { generateText } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const { imageUrl, metrics } = await request.json();

    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        success: true,
        insight: "Mocked AI Review: Aumentar o contraste do botão e testar uma variação com cores quentes no fundo, baseando-se no último update do Andromeda."
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

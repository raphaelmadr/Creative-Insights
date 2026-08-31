import { NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { ad_name, spend, ctr, riskApprovedValue } = data;

    if (!ad_name) {
      return NextResponse.json({ error: "ad_name is required" }, { status: 400 });
    }

    // Fetch dynamic prompt from DB
    const prisma = (await import("@/lib/prisma")).default;
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

    let prompt = settings?.hypothesisPrompt || `Você é um Diretor de Criação de Growth Marketing focado totalmente na conversão e performance de criativos (estáticos e vídeos). 
Sua missão é gerar uma análise rápida, direta e voltada para a equipe criativa sobre UM ÚNICO anúncio.

Dê uma hipótese clara do porquê o criativo está performando bem ou mal baseado nos números. Sugira:
1. Melhorias práticas que podem ser feitas no criativo atual (copy, design, elementos visuais, legibilidade, etc.).
2. Hipóteses para novas variações focadas em aumentar a conversão.

NÃO dê dicas de tráfego, gestão de campanha, orçamento ou públicos. Fale APENAS com o olhar de um profissional criativo buscando assertividade em conversão.

DADOS DO ANÚNCIO:
Nome do Anúncio (pode conter pistas do formato): {{ad_name}}
Investimento: R$ {{spend}}
Valor Aprovado (risk_approved): R$ {{riskApprovedValue}}
CTR: {{ctr}}%

Retorne APENAS a hipótese em um texto direto (sem usar markdown, sem começar com "A hipótese é"). Seja objetivo e prático.
Se o anúncio for muito novo (gasto quase zero), diga: "Aguardando mais veiculação para gerar hipótese."
Exemplo bom: "O CTR alto indica que a imagem/hook chamou a atenção, mas a baixa conversão sugere falha na copy. Sugestão: Testar o mesmo design mas clareando a proposta de valor na copy da imagem, focando na urgência da oferta."`;

    // Replace variables in the prompt template
    prompt = prompt.replace("{{ad_name}}", ad_name)
                   .replace("{{spend}}", spend.toString())
                   .replace("{{riskApprovedValue}}", riskApprovedValue.toString())
                   .replace("{{ctr}}", ctr.toString())
                   // Fallback for old prompt variable names
                   .replace("${ad_name}", ad_name)
                   .replace("${spend}", spend.toString())
                   .replace("${riskApprovedValue}", riskApprovedValue.toString())
                   .replace("${ctr}", ctr.toString());

    const text = await generateWithFallback(prompt);

    return NextResponse.json({ success: true, hypothesis: text });
  } catch (error: any) {
    console.error("Hypothesis API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

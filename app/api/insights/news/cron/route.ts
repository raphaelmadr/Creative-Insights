import { NextResponse } from "next/server";
import { generateText } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { tavily } from "@tavily/core";
import * as cheerio from 'cheerio';

export const revalidate = 0;

async function extractOpenGraphImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
    if (ogImage) {
      if (ogImage.startsWith('http')) return ogImage;
      const baseUrl = new URL(url);
      return new URL(ogImage, baseUrl).toString();
    }
    return null;
  } catch (err) {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const where = {
      OR: [
        { sourceUrl: null },
        { sourceUrl: { not: "https://business.facebook.com" } }
      ]
    };

    const dbUpdates = await prisma.algorithmUpdate.findMany({
      where,
      orderBy: { timestamp: 'desc' }
    });
    
    let settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const tavilyQuery = settings?.tavilySearchQuery || "Hacks criativos alta conversão Meta Ads, algoritmo Andromeda Meta Ads criativos, hacks dicas criativos Alfredo Soares, Micha Menezes, Ícaro de Carvalho, Pedro Sobral";
    const marketInsightsPromptTemplate = settings?.marketInsightsPrompt || `Você é um Senior Creative Strategist e Especialista em Growth Marketing. Sua missão é buscar, analisar e compilar padrões de criativos (anúncios) de alta performance que geram impacto real em métricas de fundo de funil (CPA, ROAS, CPC, Thumbstop Ratio, CTR de saída).

Seu Objetivo:
Sempre que acionado, você deve encontrar "hacks", testes A/B validados e frameworks de anúncios nas informações pesquisadas e traduzir esses dados brutos em insights práticos e acionáveis para o nosso time de design, edição de vídeo e copywriting.

Regras de Filtragem (O que você DEVE ignorar):
- Ignore artigos de topo de funil genéricos (ex: "As 10 melhores cores para anúncios").
- Ignore qualquer insight que não esteja atrelado a uma hipótese testada ou a uma métrica de performance clara.
- É PROIBIDO o uso de JSON no retorno final.

Formato de Saída (Como você deve entregar o resultado):
Compile seus achados e gere para CADA insight a seguinte estrutura EXATA em formato Markdown:

## 🔥 O Hack / Insight Central
[Resumo em uma frase do que foi descoberto e por que funciona psicologicamente ou visualmente]

**📊 Métricas Impactadas:** [Quais taxas este criativo visa melhorar (Ex: Aumenta Thumbstop, Reduz CPA)]

**🛠️ O Teardown (Análise das Partes):**
- **Hook (Primeiros 3s):** [O que prende a atenção?]
- **Body (Retenção):** [Como o valor/problema é apresentado?]
- **CTA (Ação):** [Qual é o gatilho de conversão?]

**🎯 Ordem de Execução para o Time:**
[Descreva um passo a passo prático de como nosso time de design/vídeo pode replicar esse framework hoje nos nossos próprios produtos]

**🔗 Fontes/Referências:** [Liste os links ou os termos de busca que validaram este estudo]

REGRA CRÍTICA: Responda ESTRITAMENTE EM TEXTO PURO (MARKDOWN). É ESTRITAMENTE PROIBIDO retornar JSON. Use títulos (##) e os emojis conforme o modelo acima.`;

    if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, reason: "No AI API keys configured" });
    }

    const tavilyKey = settings?.tavilyApiKey || process.env.TAVILY_API_KEY;
    let searchResults: any[] = [];
    if (tavilyKey) {
      try {
        const tvly = tavily({ apiKey: tavilyKey });
        const searchResponse = await tvly.search(tavilyQuery, {
          searchDepth: "advanced",
          includeRawContent: false
        });
        searchResults = searchResponse.results || [];
      } catch (err) {
        console.error("Erro na busca Tavily:", err);
      }
    }

    const existingUrls = dbUpdates.map((u: any) => u.sourceUrl).filter(Boolean);
    const updatesToCreate = [];
    let newlyAddedCount = 0;

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      
      if (existingUrls.includes(result.url)) {
        continue;
      }

      if (i > 0) {
        await delay(3000);
      }

      const prompt = `Aqui está o conteúdo de um artigo recém-publicado na internet:
URL: ${result.url}
TÍTULO ORIGINAL: ${result.title}
CONTEÚDO: ${result.content}

${marketInsightsPromptTemplate}

REGRA CRÍTICA ABSOLUTA: 
Sua resposta DEVE estar envelopada EXATAMENTE dentro das tags <final_answer> e </final_answer>. 
A PRIMEIRA LINHA de dentro da tag <final_answer> DEVE SER OBRIGATORIAMENTE o título traduzido para o Português (PT-BR) no formato "TÍTULO: [Seu título aqui]".
O texto seguinte dentro da tag <final_answer> DEVE seguir exatamente a estrutura solicitada nas diretrizes acima.
<final_answer>
TÍTULO: [Insira o título traduzido aqui]
[Insira o Relatório de Insight Acionável formatado em Markdown aqui, conforme a estrutura exigida]
</final_answer>`;

      try {
        const text = await generateText(prompt);
        if (text && text.trim().length > 10 && !text.toUpperCase().includes('IGNORAR')) {
          const thumbnail = await extractOpenGraphImage(result.url);
          
          let rawText = text.trim();
          let finalTitle = result.title || "Market Insights";
          const titleMatch = rawText.match(/TÍTULO:\s*(.+)/i);
          if (titleMatch) {
            finalTitle = titleMatch[1].trim();
            rawText = rawText.replace(/TÍTULO:\s*(.+)/i, "").trim();
          }

          updatesToCreate.push({
            title: finalTitle,
            content: rawText,
            urgency: "Média",
            category: "Criativos",
            sourceUrl: result.url,
            thumbnailUrl: thumbnail,
            timestamp: new Date()
          });
        }
      } catch (aiErr) {
        console.error(`Erro ao processar artigo ${result.url}:`, aiErr);
      }
    }

    if (updatesToCreate.length > 0) {
      try {
        await prisma.algorithmUpdate.createMany({ data: updatesToCreate });
        newlyAddedCount = updatesToCreate.length;
      } catch (e) {
        console.error("Failed to save AI text to DB", e);
        return NextResponse.json({ success: false, error: "Database save error" }, { status: 500 });
      }
    }
    
    return NextResponse.json({ success: true, newlyAddedCount });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

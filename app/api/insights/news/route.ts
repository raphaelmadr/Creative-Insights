import { NextResponse } from "next/server";
import { generateText, resolveAiChain } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { tavily } from "@tavily/core";
import { extractArticleImage } from "@/lib/article-image";
import { friendlyFailureMessage, logExternalFailure } from "@/lib/external-log";

export const revalidate = 0;

/**
 * Quantos resultados a Tavily devolve por rodada.
 *
 * Eram 5 (o padrão da biblioteca), e a rota descarta o que já está no banco:
 * bastavam duas buscas para que todo resultado já fosse conhecido e o botão
 * parasse de render nada. Pedir mais dá folga para a deduplicação.
 */
const RESULTADOS_POR_BUSCA = 12;

/**
 * Quantos artigos NOVOS são curados por clique.
 *
 * Cada um custa uma chamada de IA mais três segundos de espera entre elas; o
 * teto existe para a requisição terminar em tempo razoável, e o que sobrar volta
 * no clique seguinte — que agora tem o que trazer.
 */
const ARTIGOS_POR_RODADA = 6;

/**
 * A consulta desta rodada.
 *
 * O campo de Configurações guarda uma LISTA de temas separados por vírgula, e a
 * busca mandava a lista inteira como uma frase só — a mesma pergunta, sempre,
 * devolvendo os mesmos artigos. Como a rota descarta o que já está no acervo, o
 * segundo clique em "Buscar novos insights" não tinha como trazer nada: não
 * faltava conteúdo na internet, faltava variar a pergunta.
 *
 * Cada rodada leva um recorte sorteado dos temas. Termos diferentes alcançam
 * cantos diferentes, e o acervo cresce a cada clique em vez de estacionar.
 */
function queryDaRodada(base: string): string {
  const termos = base
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (termos.length <= 3) return base.trim();

  // Fisher-Yates: `sort(() => Math.random() - 0.5)` embaralha mal e mantém os
  // primeiros termos perto do começo — exatamente o que queremos evitar aqui.
  const sorteados = [...termos];
  for (let i = sorteados.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sorteados[i], sorteados[j]] = [sorteados[j], sorteados[i]];
  }

  return sorteados.slice(0, 3).join(", ");
}


export async function GET() {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      function sendStatus(message: string) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', message }) + '\n'));
      }
      /**
       * `stats` conta o que aconteceu com os artigos: quantos já eram
       * conhecidos, quantos a IA descartou por não conterem hack aplicável e
       * quantos falharam. Sem esses números a tela só sabia dizer "nenhuma
       * novidade", frase que servia igualmente para "a internet não tem nada
       * novo" e para "todas as IAs estão fora do ar".
       */
      function sendComplete(updates: any, newCount: number = 0, stats: Record<string, number> = {}) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'complete', updates, newCount, stats }) + '\n'));
        controller.close();
      }
      function sendError(error: string) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error }) + '\n'));
        controller.close();
      }

      try {
        const where = {
          OR: [
            { sourceUrl: null },
            { sourceUrl: { not: "https://business.facebook.com" } }
          ]
        };

        sendStatus("Verificando banco de dados local...");
        let dbUpdates = await prisma.algorithmUpdate.findMany({
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

        /*
         * A cadeia de IA desta execução, montada pela MESMA função que
         * `generateWithFallback` usa: os provedores com chave, na ordem
         * configurada em Configurações › IA. A rota repetia à mão a lista das
         * sete colunas de chave — uma checagem paralela que passaria a divergir
         * da ordem configurada no momento em que ela virou editável.
         */
        const cadeia = await resolveAiChain(settings);

        if (cadeia.length === 0) {
          sendStatus("Nenhuma IA configurada. Retornando do banco...");
          sendComplete(dbUpdates, 0, { semIa: 1 });
          return;
        }

        // Dito em voz alta porque é a dúvida que a tela nunca respondia: quem
        // vai atender, e em que ordem se o primeiro cair.
        sendStatus(`IA disponível: ${cadeia.map((c) => c.provider.label).join(" → ")}`);

        const tavilyKey = settings?.tavilyApiKey || process.env.TAVILY_API_KEY;

        /*
         * Sem busca web não existe "buscar novos": o que a página mostraria é o
         * acervo que ela já tinha antes do clique. Dizer isso é melhor do que
         * devolver zero novidades e deixar a pessoa achando que a internet
         * amanheceu sem nada.
         */
        if (!tavilyKey) {
          sendStatus("Busca web (Tavily) não configurada. Mostrando o que já está salvo...");
          sendComplete(dbUpdates, 0, { semTavily: 1 });
          return;
        }

        const consulta = queryDaRodada(tavilyQuery);
        sendStatus(`Pesquisando na internet: ${consulta}`);

        let searchResults: any[] = [];
        try {
          const tvly = tavily({ apiKey: tavilyKey });
          const searchResponse = await tvly.search(consulta, {
            searchDepth: "advanced",
            maxResults: RESULTADOS_POR_BUSCA,
            includeRawContent: false,
          });
          searchResults = searchResponse.results || [];
        } catch (err) {
          // A falha da busca morria num `console.error` no servidor, onde a
          // equipe não olha, e a tela anunciava "nenhuma novidade".
          console.error("Erro na busca Tavily:", err);
          await logExternalFailure({ service: "Tavily", operation: "buscar insights de mercado", error: err });
          sendError(friendlyFailureMessage([{ service: "Tavily", error: err }], "A busca web"));
          return;
        }

        /*
         * O que já está no acervo sai ANTES do laço, e não dentro dele. Filtrar
         * durante a passagem fazia a contagem exibida ("artigo 3 de 12") incluir
         * artigos que seriam pulados, e a espera de três segundos entre chamadas
         * de IA disparava por posição na lista bruta — esperando por artigos que
         * nunca chegavam a consultar IA nenhuma.
         */
        const conhecidos = new Set(dbUpdates.map((u: any) => u.sourceUrl).filter(Boolean));
        const candidatos = searchResults.filter((r: any) => r?.url && !conhecidos.has(r.url));

        if (candidatos.length === 0) {
          sendStatus("Todos os resultados desta busca já estavam no acervo.");
          sendComplete(dbUpdates, 0, {
            encontrados: searchResults.length,
            jaConhecidos: searchResults.length,
            ignorados: 0,
            falhas: 0,
          });
          return;
        }

        const aProcessar = candidatos.slice(0, ARTIGOS_POR_RODADA);
        const updatesToCreate = [];
        let newlyAddedCount = 0;
        let ignorados = 0;
        let falhas = 0;
        let ultimaFalha = "";

        // Helper function para evitar Rate Limit
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < aProcessar.length; i++) {
          const result = aProcessar[i];

          if (i > 0) {
            sendStatus(`Aguardando 3s para evitar limite de requisições da IA...`);
            await delay(3000);
          }

          sendStatus(`Analisando artigo ${i + 1} de ${aProcessar.length}...`);

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
            const text = await generateText(prompt, undefined, "curar insight de mercado");
            if (text && text.trim().length > 10 && !text.toUpperCase().includes('IGNORAR')) {
              const thumbnail = (await extractArticleImage(result.url)).url;

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
            } else {
              ignorados++;
              sendStatus(`Artigo ${i + 1} ignorado pela IA por não conter hacks aplicáveis.`);
            }
          } catch (aiErr: any) {
            falhas++;
            ultimaFalha = aiErr?.message || "";
            console.error(`Erro ao processar artigo ${result.url}:`, aiErr);

            /*
             * Chegar aqui significa que a cadeia INTEIRA caiu para este artigo —
             * `generateWithFallback` só levanta erro depois de tentar todos os
             * provedores com chave. Insistir nos artigos seguintes gastaria
             * minutos para colecionar a mesma queda, e a resposta que quem
             * clicou precisa já está decidida.
             */
            if (falhas >= 2) {
              sendStatus("As IAs configuradas não estão respondendo. Interrompendo a rodada.");
              break;
            }
          }
        }

        if (updatesToCreate.length > 0) {
          sendStatus("Formatando resultados e salvando no banco de dados...");
          try {
            await prisma.algorithmUpdate.createMany({ data: updatesToCreate });
            dbUpdates = await prisma.algorithmUpdate.findMany({ where, orderBy: { timestamp: 'desc' } });
            newlyAddedCount = updatesToCreate.length;
          } catch (e) {
            console.error("Failed to save AI text to DB", e);
          }
        }

        /*
         * Nada salvo E houve falha de IA: isto é erro, não "nenhuma novidade". A
         * mensagem que sobe já vem traduzida e sem credencial dentro, montada por
         * `friendlyFailureMessage` lá na cadeia.
         */
        if (newlyAddedCount === 0 && falhas > 0) {
          sendError(ultimaFalha || "Nenhuma IA respondeu. Veja Configurações › Logs para o motivo.");
          return;
        }

        sendStatus("Concluído! Renderizando insights...");
        sendComplete(dbUpdates, newlyAddedCount, {
          encontrados: searchResults.length,
          jaConhecidos: searchResults.length - candidatos.length,
          ignorados,
          falhas,
        });
      } catch (error: any) {
        console.error(error);
        sendError(error.message || "Unknown error occurred");
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform'
    }
  });
}

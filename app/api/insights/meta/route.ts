import { NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai";
import prisma from "@/lib/prisma";

export const maxDuration = 60; // 60 seconds max
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  let metaAccountId = settings?.metaAdAccountId;
  const metaToken = settings?.metaAccessToken;

  if (metaAccountId && !metaAccountId.startsWith('act_')) {
    metaAccountId = `act_${metaAccountId}`;
  }

  if (!metaAccountId || !metaToken) {
    return NextResponse.json({ error: "Missing Meta API keys" }, { status: 500 });
  }

  const sendEvent = async (type: string, payload: any) => {
    const data = JSON.stringify({ type, ...payload });
    await writer.write(encoder.encode(data + "\n"));
  };

  (async () => {
    try {
      // Formatar o range de data para exibição
      let dateText = "Últimos 7 dias";
      let timeRangeParam = "date_preset=last_7d";
      
      if (from && to) {
        dateText = `Período: ${from} a ${to}`;
        timeRangeParam = `time_range={'since':'${from}','until':'${to}'}`;
      }

      // 1. Send status: Fetching Meta Data
      await sendEvent("status", { message: `Extraindo métricas do Meta Ads (${dateText})...` });

      const metaUrl = `https://graph.facebook.com/v19.0/${metaAccountId}/insights?level=ad&fields=ad_name,adset_name,campaign_name,spend,impressions,clicks,cpc,cpm,ctr,actions,video_play_actions,video_avg_time_watched_actions&${timeRangeParam}&access_token=${metaToken}&limit=200`;
      
      const metaResponse = await fetch(metaUrl);
      const metaData = await metaResponse.json();

      if (metaData.error) {
        throw new Error("Erro na API da Meta: " + metaData.error.message);
      }

      const ads = metaData.data || [];
      if (ads.length === 0) {
        await sendEvent("status", { message: "Nenhum dado de anúncio encontrado." });
        await sendEvent("complete", { newCount: 0 });
        await writer.close();
        return;
      }

      // Filter and format the raw data to send to Gemini
      // Only get ads that have spend > 0 to save tokens
      const activeAds = ads.filter((ad: any) => parseFloat(ad.spend || 0) > 0).map((ad: any) => {
        const linkClicks = ad.actions?.find((a: any) => a.action_type === 'link_click')?.value || 0;
        const messages = ad.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0;
        const purchases = ad.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0;
        const leads = ad.actions?.find((a: any) => a.action_type === 'lead')?.value || 0;
        const videoViews = ad.video_play_actions?.find((a: any) => a.action_type === 'video_view')?.value || 0;
        
        return {
          nome: ad.ad_name,
          conjunto: ad.adset_name,
          campanha: ad.campaign_name,
          investimento: `$${ad.spend}`,
          impressoes: ad.impressions,
          cliques: ad.clicks,
          cpm: `$${ad.cpm}`,
          ctr: `${ad.ctr}%`,
          cpc: `$${ad.cpc}`,
          link_clicks: linkClicks,
          mensagens: messages,
          compras: purchases,
          leads: leads,
          views: videoViews
        };
      });

      if (activeAds.length === 0) {
        await sendEvent("status", { message: "Nenhum criativo com gasto recente." });
        await sendEvent("complete", { newCount: 0 });
        await writer.close();
        return;
      }

      // Sort by spend descending and take top 100 to avoid exceeding prompt size (while getting almost all active ads)
      activeAds.sort((a: any, b: any) => parseFloat(b.investimento.replace('$', '')) - parseFloat(a.investimento.replace('$', '')));
      const topAds = activeAds.slice(0, 100);

      await sendEvent("status", { message: `Analisando ${topAds.length} anúncios e conjuntos com Inteligência Artificial...` });

      let prompt = settings?.insightsPrompt || `Você é um DIRETOR DE CRIAÇÃO ORIENTADO A DADOS (Data-Driven Creative Director).
Você acaba de receber a exportação de todos os anúncios e conjuntos de anúncios rodando na Meta Ads (${dateText}).

SUA MISSÃO MÁXIMA:
1. Criar um "Panorama Geral" detalhado analisando a saúde de TODOS os conjuntos de anúncios (Ad Sets) listados, destacando quais conjuntos estão tracionando e quais estão gargalando.
2. Analisar criativos individualmente, gerando insights práticos para a equipe de design (melhorias em copy, cores, promessa visual, legibilidade).

REGRA CRÍTICA 1: É proibido dar dicas de tráfego/mídia (orçamento, público). O foco é CRIATIVO (design, mensagem, hook).
REGRA CRÍTICA 2: Formate sua resposta EXATAMENTE como um array de objetos JSON (apenas o JSON puro, sem formatação markdown em volta).

[DADOS DOS CRIATIVOS E CONJUNTOS (${dateText})]:
{{topAds}}

O QUE ESPERAMOS DE VOCÊ NESSE JSON (Formato Exato):
[
  {
    "adName": "Panorama Geral",
    "title": "Panorama Geral: Saúde dos Conjuntos",
    "content": "Uma análise profunda e detalhada agrupando a performance por conjuntos de anúncios (conjunto). Destaque quais conjuntos estão performando melhor e que tipo de criativo está tracionando neles. Forneça a visão macro da conta.",
    "urgency": "Alta",
    "category": "Geral"
  },
  {
    "adName": "nome exato copiado do campo \\"nome\\" do anúncio",
    "title": "Renovar Design de [Nome do Anúncio]",
    "content": "Sua análise focada neste criativo específico. Indique gargalos visuais através de CTR/CPM e sugira variações claras ao designer.",
    "urgency": "Média",
    "category": "Melhoria de Design"
  }
]

O PRIMEIRO item do array DEVE obrigatoriamente ter adName="Panorama Geral" contendo a análise macro da conta e de TODOS OS CONJUNTOS. Os itens seguintes devem focar nos criativos individuais mais importantes (podendo ser vários). Retorne o Array JSON válido.`;

      // Inject the topAds JSON into the dynamic template
      prompt = prompt.replace("{{topAds}}", JSON.stringify(topAds, null, 2))
                     // Fallback for old prompt template variable
                     .replace("${JSON.stringify(topAds, null, 2)}", JSON.stringify(topAds, null, 2));

      const aiResponse = await generateWithFallback(prompt);
      
      // O usuário pediu texto puro. Embalamos o texto puro em um item virtual para o front-end
      const normalizedItems = [{
        title: "Análise Gerada por IA",
        content: aiResponse.trim(),
        urgency: "Média",
        category: "Geral"
      }];

      await sendEvent("status", { message: "Formatando insights criativos e salvando no banco..." });



      const analysis = await prisma.campaignAnalysis.create({
        data: { items: JSON.stringify(normalizedItems) }
      });

      await sendEvent("status", { message: "Processo concluído." });
      await sendEvent("complete", { id: analysis.id, newCount: normalizedItems.length });

    } catch (err: any) {
      console.error("Meta Stream Error:", err);
      await sendEvent("error", { error: err.message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    }
  });
}

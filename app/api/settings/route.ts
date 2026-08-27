import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const DEFAULT_HYPOTHESIS_PROMPT = `Você é um Diretor de Criação de Growth Marketing focado totalmente na conversão e performance de criativos (estáticos e vídeos). 
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

const DEFAULT_INSIGHTS_PROMPT = `Você é um DIRETOR DE CRIAÇÃO ORIENTADO A DADOS (Data-Driven Creative Director) focado inteiramente na conversão de anúncios (estáticos e vídeos).
Você acaba de receber os resultados brutos de performance de tráfego pago dos últimos 7 dias.

SUA MISSÃO: Analisar os dados abaixo e gerar insights PRÁTICOS E APLICÁVEIS para a equipe de criação (designers), focando exclusivamente em melhorar a conversão. Crie hipóteses do porquê um criativo performou bem ou mal e sugira melhorias reais em copy, design, elementos visuais, legibilidade e hipóteses para novas variações.
REGRA CRÍTICA 1: É ESTRITAMENTE PROIBIDO dar conselhos de mídia (orçamento, público, lances, escala). Fale APENAS com o olhar de um profissional criativo buscando assertividade em conversão.
REGRA CRÍTICA 2: Identifique os gargalos visuais (ex: CPM alto = imagem possivelmente não atrai; CTR baixo = thumb/hook ruim; muitos cliques mas baixa conversão = promessa visual confusa ou CTA fraca).
REGRA CRÍTICA 3: Formate o seu retorno EXATAMENTE em um array de objetos JSON (apenas o JSON, sem formatação markdown em volta).

[DADOS DOS CRIATIVOS (Últimos 7 dias)]:
{{topAds}}

REGRA CRÍTICA 4: Cada item do JSON deve incluir o campo "adName", com o valor EXATO (cópia literal, sem parafrasear ou abreviar) do campo "nome" do criativo ao qual aquele insight se refere. Esse campo é usado para localizar a imagem real do criativo no nosso banco de dados.

[Formato esperado do retorno (JSON Array puro)]:
[
  {
    "adName": "nome exato copiado do campo \\"nome\\" do criativo",
    "title": "Renovar Design de [Nome do Criativo]",
    "content": "Sua hipótese profunda baseada nas métricas, seguida de sugestões de variações e melhorias em copy, cores, elementos ou legibilidade.",
    "urgency": "Alta" | "Média" | "Baixa",
    "category": "Melhoria de Design" | "Hipótese de Variação" | "Melhoria de Copy" | "Oportunidade Visual"
  }
]

Escreva os relatórios focando nos 3 ou 4 criativos que mais gastaram ou que mais chamaram a sua atenção nos dados. NÃO CRIE ITENS INVENTADOS. Baseie-se ESTRITAMENTE na lista acima. Retorne o Array JSON válido.`;

const DEFAULT_ANDROMEDA_PROMPT = `Você é um Estrategista Sênior especialista em Meta Ads, Andromeda e Entity IDs.
Analise este grupo de anúncios que sofreram Canibalização de Verba (Fadiga Cruzada) no mesmo Entity ID.
Nomes dos criativos envolvidos: \${creativeNames}
Tags da taxonomia compartilhadas: \${sharedTags}
Share de Gasto do criativo 'Vencedor Injusto': \${cannibalizationRate}%

Dê uma instrução direta (máximo de 2 frases curtas) para a equipe de Design sobre como criar uma nova variação para que o algoritmo não considere mais uma 'variação cosmética' (que cai no mesmo Entity ID).
Regra de ouro: Leia os nomes! Se os nomes indicarem 'IMG' (imagem), NÃO fale sobre alterar os '3 primeiros segundos' (que é pra vídeo). Se for imagem, mande mudar o fundo, o cenário, as cores principais ou a pessoa em cena radicalmente. Seja cirúrgico e tático, direto ao ponto, sem cumprimentos ou introduções, no tom da urgência.`;

const DEFAULT_TAVILY_SEARCH_QUERY = "UGC hook variations, Direct response design teardown, Creative fatigue management, A/B test ad creative, estudos de caso de anúncios Meta Ads, hacks de retenção de atenção";

const DEFAULT_MARKET_INSIGHTS_PROMPT = `Você é um Senior Creative Strategist e Especialista em Growth Marketing. Sua missão é buscar, analisar e compilar padrões de criativos (anúncios) de alta performance que geram impacto real em métricas de fundo de funil (CPA, ROAS, CPC, Thumbstop Ratio, CTR de saída).

Seu Objetivo:
Sempre que acionado, você deve encontrar "hacks", testes A/B validados e frameworks de anúncios nas informações pesquisadas e traduzir esses dados brutos em insights práticos e acionáveis para o nosso time de design, edição de vídeo e copywriting.

Regras de Filtragem (O que você DEVE ignorar):
- Ignore artigos de topo de funil genéricos (ex: "As 10 melhores cores para anúncios").
- Ignore qualquer insight que não esteja atrelado a uma hipótese testada ou a uma métrica de performance clara.
- SE O CONTEÚDO FOR APENAS UMA NOTÍCIA, UM RESUMO, OU NÃO CONTIVER UM HACK/INSIGHT CLARO E APLICÁVEL DE CRIATIVOS, RESPONDA APENAS COM A PALAVRA: IGNORAR. Não tente inventar um hack se ele não existir no texto.
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

REGRA CRÍTICA: Responda ESTRITAMENTE EM TEXTO PURO (MARKDOWN) e 100% EM PORTUGUÊS (PT-BR), não importa o idioma original da fonte. É ESTRITAMENTE PROIBIDO retornar JSON. Use títulos (##) e os emojis conforme o modelo acima.`;

export async function GET() {
  try {
    let settings = await prisma.systemSettings.findUnique({
      where: { id: 1 }
    });

    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          id: 1,
          superWinnerSpend: 1000,
          superWinnerReturn: 5000,
          superWinnerCpa: 50,
          winnerSpend: 1000,
          winnerReturn: 1000,
          winnerCpa: 60,
        }
      });
    }
    
    // Default fallback
    if (!settings.hypothesisPrompt) {
      settings.hypothesisPrompt = DEFAULT_HYPOTHESIS_PROMPT;
    }
    if (!settings.insightsPrompt) {
      settings.insightsPrompt = DEFAULT_INSIGHTS_PROMPT;
    }
    if (!settings.andromedaPrompt) {
      settings.andromedaPrompt = DEFAULT_ANDROMEDA_PROMPT;
    }
    if (!settings.tavilySearchQuery) {
      settings.tavilySearchQuery = DEFAULT_TAVILY_SEARCH_QUERY;
    }
    if (!settings.marketInsightsPrompt) {
      settings.marketInsightsPrompt = DEFAULT_MARKET_INSIGHTS_PROMPT;
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      superWinnerSpend, superWinnerReturn, superWinnerCpa, 
      winnerSpend, winnerReturn, winnerCpa, 
      hypothesisPrompt, insightsPrompt, andromedaPrompt, 
      tavilySearchQuery, marketInsightsPrompt,
      metaAdAccountId, metaAccessToken, geminiApiKey, 
      openaiApiKey, anthropicApiKey, tavilyApiKey,
      groqApiKey, openRouterApiKey, cohereApiKey, huggingFaceApiKey,
      slackBotToken, slackChannelId,
      teamCreativeGoal, cronSyncEnabled, cronSyncMode, cronSyncInterval,
      cpanelUploadUrl, cpanelUploadSecret,
      googleClientId, googleClientSecret, nextAuthSecret, nextAuthUrl,
      metaAppId, metaAppSecret
    } = body;

    const updateData: any = {
      superWinnerSpend: parseFloat(superWinnerSpend),
      superWinnerReturn: parseFloat(superWinnerReturn),
      superWinnerCpa: parseFloat(superWinnerCpa),
      winnerSpend: parseFloat(winnerSpend),
      winnerReturn: parseFloat(winnerReturn),
      winnerCpa: parseFloat(winnerCpa),
    };

    if (hypothesisPrompt) updateData.hypothesisPrompt = hypothesisPrompt;
    if (insightsPrompt) updateData.insightsPrompt = insightsPrompt;
    if (andromedaPrompt) updateData.andromedaPrompt = andromedaPrompt;
    if (tavilySearchQuery) updateData.tavilySearchQuery = tavilySearchQuery;
    if (marketInsightsPrompt) updateData.marketInsightsPrompt = marketInsightsPrompt;
    if (metaAdAccountId !== undefined) updateData.metaAdAccountId = metaAdAccountId;
    if (metaAccessToken !== undefined) updateData.metaAccessToken = metaAccessToken;
    if (geminiApiKey !== undefined) updateData.geminiApiKey = geminiApiKey;
    if (openaiApiKey !== undefined) updateData.openaiApiKey = openaiApiKey;
    if (anthropicApiKey !== undefined) updateData.anthropicApiKey = anthropicApiKey;
    if (tavilyApiKey !== undefined) updateData.tavilyApiKey = tavilyApiKey;
    if (groqApiKey !== undefined) updateData.groqApiKey = groqApiKey;
    if (openRouterApiKey !== undefined) updateData.openRouterApiKey = openRouterApiKey;
    if (cohereApiKey !== undefined) updateData.cohereApiKey = cohereApiKey;
    if (huggingFaceApiKey !== undefined) updateData.huggingFaceApiKey = huggingFaceApiKey;
    if (slackBotToken !== undefined) updateData.slackBotToken = slackBotToken;
    if (slackChannelId !== undefined) updateData.slackChannelId = slackChannelId;
    if (teamCreativeGoal !== undefined) updateData.teamCreativeGoal = parseInt(teamCreativeGoal) || 300;
    if (cronSyncEnabled !== undefined) updateData.cronSyncEnabled = Boolean(cronSyncEnabled);
    if (cronSyncMode !== undefined) updateData.cronSyncMode = cronSyncMode;
    if (cronSyncInterval !== undefined) updateData.cronSyncInterval = parseInt(cronSyncInterval) || 120;
    if (cpanelUploadUrl !== undefined) updateData.cpanelUploadUrl = cpanelUploadUrl;
    if (cpanelUploadSecret !== undefined) updateData.cpanelUploadSecret = cpanelUploadSecret;
    if (googleClientId !== undefined) updateData.googleClientId = googleClientId;
    if (googleClientSecret !== undefined) updateData.googleClientSecret = googleClientSecret;
    if (nextAuthSecret !== undefined) updateData.nextAuthSecret = nextAuthSecret;
    if (nextAuthUrl !== undefined) updateData.nextAuthUrl = nextAuthUrl;
    if (metaAppId !== undefined) updateData.metaAppId = metaAppId;
    if (metaAppSecret !== undefined) updateData.metaAppSecret = metaAppSecret;

    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        superWinnerSpend: parseFloat(superWinnerSpend) || 1000,
        superWinnerReturn: parseFloat(superWinnerReturn) || 5000,
        superWinnerCpa: parseFloat(superWinnerCpa) || 50,
        winnerSpend: parseFloat(winnerSpend) || 1000,
        winnerReturn: parseFloat(winnerReturn) || 1000,
        winnerCpa: parseFloat(winnerCpa) || 60,
        ...(hypothesisPrompt && { hypothesisPrompt }),
        ...(insightsPrompt && { insightsPrompt }),
        ...(andromedaPrompt && { andromedaPrompt }),
        ...(tavilySearchQuery && { tavilySearchQuery }),
        ...(marketInsightsPrompt && { marketInsightsPrompt }),
        ...(metaAdAccountId !== undefined && { metaAdAccountId }),
        ...(metaAccessToken !== undefined && { metaAccessToken }),
        ...(geminiApiKey !== undefined && { geminiApiKey }),
        ...(openaiApiKey !== undefined && { openaiApiKey }),
        ...(anthropicApiKey !== undefined && { anthropicApiKey }),
        ...(tavilyApiKey !== undefined && { tavilyApiKey }),
        ...(groqApiKey !== undefined && { groqApiKey }),
        ...(openRouterApiKey !== undefined && { openRouterApiKey }),
        ...(cohereApiKey !== undefined && { cohereApiKey }),
        ...(huggingFaceApiKey !== undefined && { huggingFaceApiKey }),
        ...(cronSyncEnabled !== undefined && { cronSyncEnabled: Boolean(cronSyncEnabled) }),
        ...(cronSyncMode !== undefined && { cronSyncMode }),
        ...(cronSyncInterval !== undefined && { cronSyncInterval: parseInt(cronSyncInterval) || 120 }),
        ...(cpanelUploadUrl !== undefined && { cpanelUploadUrl }),
        ...(cpanelUploadSecret !== undefined && { cpanelUploadSecret }),
        ...(googleClientId !== undefined && { googleClientId }),
        ...(googleClientSecret !== undefined && { googleClientSecret }),
        ...(nextAuthSecret !== undefined && { nextAuthSecret }),
        ...(nextAuthUrl !== undefined && { nextAuthUrl }),
        ...(metaAppId !== undefined && { metaAppId }),
        ...(metaAppSecret !== undefined && { metaAppSecret }),
      }
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}

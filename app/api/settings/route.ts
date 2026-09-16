import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { isStorageConfigured, resolveStorageConfig } from "@/lib/media-upload";
import { buildIntegrationStatuses } from "@/lib/integrations";
import { DEFAULT_ANDROMEDA_PROMPT, DEFAULT_HYPOTHESIS_PROMPT } from "@/lib/ai-prompts";
import { getCurrentAdmin, getCurrentUser } from "@/lib/auth";
import { toPublicSettings } from "@/lib/settings-visibility";

export const dynamic = 'force-dynamic';


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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

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
    if (!settings.andromedaPrompt) {
      settings.andromedaPrompt = DEFAULT_ANDROMEDA_PROMPT;
    }
    if (!settings.tavilySearchQuery) {
      settings.tavilySearchQuery = DEFAULT_TAVILY_SEARCH_QUERY;
    }
    if (!settings.marketInsightsPrompt) {
      settings.marketInsightsPrompt = DEFAULT_MARKET_INSIGHTS_PROMPT;
    }

    // O painel edita o banco, mas precisa mostrar o que está EM VIGOR: um valor
    // que vive na variável de ambiente aparecia como campo vazio, dando a
    // impressão de que o armazenamento de mídia não estava configurado.
    const storage = resolveStorageConfig(settings);

    const isAdmin = user.role === "ADMIN";

    /*
     * Quem não administra recebe a configuração sem nenhuma credencial — ver
     * `lib/settings-visibility.ts`. O estado das integrações continua vindo em
     * `integrations`, como booleanos: é o que o cabeçalho precisa para acender
     * os ícones, sem que token nenhum saia do servidor.
     */
    if (!isAdmin) {
      return NextResponse.json({
        success: true,
        data: toPublicSettings(settings as unknown as Record<string, unknown>),
        integrations: buildIntegrationStatuses(settings),
        mediaStorage: { configured: isStorageConfigured(storage) },
      });
    }

    return NextResponse.json({
      success: true,
      data: settings,
      integrations: buildIntegrationStatuses(settings),
      mediaStorage: {
        uploadUrl: storage.uploadUrl ?? "",
        uploadSecret: storage.uploadSecret ?? "",
        uploadUrlSource: storage.uploadUrlSource,
        uploadSecretSource: storage.uploadSecretSource,
        configured: isStorageConfigured(storage),
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Gravar configuração é ação de admin: é aqui que entram as credenciais.
    if (!(await getCurrentAdmin())) {
      return NextResponse.json({ success: false, error: 'Acesso restrito.' }, { status: 403 });
    }

    const body = await request.json();
    const { 
      superWinnerSpend, superWinnerReturn, superWinnerCpa, 
      winnerSpend, winnerReturn, winnerCpa, 
      creativeCategories,
      hypothesisPrompt, visionPrompt, andromedaPrompt, 
      tavilySearchQuery, marketInsightsPrompt,
      metaAdAccountId, metaAccessToken, geminiApiKey, 
      openaiApiKey, anthropicApiKey, tavilyApiKey,
      groqApiKey, openRouterApiKey, cohereApiKey, huggingFaceApiKey,
      slackBotToken, slackChannelId,
      teamCreativeGoal, cronSyncEnabled, cronSyncInterval,
      cpanelUploadUrl, cpanelUploadSecret,
      googleClientId, googleClientSecret, nextAuthSecret, nextAuthUrl,
      metaAppId, metaAppSecret,
      metaRiskApprovedConversionId, metaPaymentApprovedConversionId,
      tiktokAdvertiserId, tiktokAppId, tiktokAppSecret, tiktokAccessToken
    } = body;

    const updateData: any = {};

    // `parseFloat(undefined)` devolve NaN, e o Prisma recusa NaN num Float.
    // Sem esta guarda, salvar de qualquer página que não envia as metas de
    // performance — Sistema, por exemplo — derrubava a rota inteira com 500,
    // levando junto as configurações que a página realmente queria gravar.
    const asFloat = (value: any): number | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const performanceGoals = {
      superWinnerSpend, superWinnerReturn, superWinnerCpa,
      winnerSpend, winnerReturn, winnerCpa,
    };

    for (const [field, value] of Object.entries(performanceGoals)) {
      const parsed = asFloat(value);
      if (parsed !== undefined) updateData[field] = parsed;
    }

    if (hypothesisPrompt) updateData.hypothesisPrompt = hypothesisPrompt;
    if (visionPrompt !== undefined) updateData.visionPrompt = visionPrompt || null;
    if (creativeCategories !== undefined) updateData.creativeCategories = creativeCategories;
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
    if (teamCreativeGoal !== undefined) {
      // `|| 300` recusava o zero: meta global zerada voltava a 300 na gravação.
      const parsed = parseInt(teamCreativeGoal, 10);
      updateData.teamCreativeGoal = Number.isFinite(parsed) && parsed >= 0 ? parsed : 300;
    }
    if (cronSyncEnabled !== undefined) updateData.cronSyncEnabled = Boolean(cronSyncEnabled);
    if (cronSyncInterval !== undefined) updateData.cronSyncInterval = parseInt(cronSyncInterval) || 120;
    if (cpanelUploadUrl !== undefined) updateData.cpanelUploadUrl = cpanelUploadUrl;
    if (cpanelUploadSecret !== undefined) updateData.cpanelUploadSecret = cpanelUploadSecret;
    if (metaRiskApprovedConversionId !== undefined) updateData.metaRiskApprovedConversionId = metaRiskApprovedConversionId;
    if (metaPaymentApprovedConversionId !== undefined) updateData.metaPaymentApprovedConversionId = metaPaymentApprovedConversionId;
    if (googleClientId !== undefined) updateData.googleClientId = googleClientId;
    if (googleClientSecret !== undefined) updateData.googleClientSecret = googleClientSecret;
    if (nextAuthSecret !== undefined) updateData.nextAuthSecret = nextAuthSecret;
    if (nextAuthUrl !== undefined) updateData.nextAuthUrl = nextAuthUrl;
    if (metaAppId !== undefined) updateData.metaAppId = metaAppId;
    if (metaAppSecret !== undefined) updateData.metaAppSecret = metaAppSecret;
    if (tiktokAdvertiserId !== undefined) updateData.tiktokAdvertiserId = tiktokAdvertiserId;
    if (tiktokAppId !== undefined) updateData.tiktokAppId = tiktokAppId;
    if (tiktokAppSecret !== undefined) updateData.tiktokAppSecret = tiktokAppSecret;
    if (tiktokAccessToken !== undefined) updateData.tiktokAccessToken = tiktokAccessToken;

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
        ...(visionPrompt !== undefined && { visionPrompt: visionPrompt || null }),
        ...(creativeCategories !== undefined && { creativeCategories }),
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
        ...(cronSyncInterval !== undefined && { cronSyncInterval: parseInt(cronSyncInterval) || 120 }),
        ...(cpanelUploadUrl !== undefined && { cpanelUploadUrl }),
        ...(cpanelUploadSecret !== undefined && { cpanelUploadSecret }),
        ...(metaRiskApprovedConversionId !== undefined && { metaRiskApprovedConversionId }),
        ...(metaPaymentApprovedConversionId !== undefined && { metaPaymentApprovedConversionId }),
        ...(googleClientId !== undefined && { googleClientId }),
        ...(googleClientSecret !== undefined && { googleClientSecret }),
        ...(nextAuthSecret !== undefined && { nextAuthSecret }),
        ...(nextAuthUrl !== undefined && { nextAuthUrl }),
        ...(metaAppId !== undefined && { metaAppId }),
        ...(metaAppSecret !== undefined && { metaAppSecret }),
        ...(tiktokAdvertiserId !== undefined && { tiktokAdvertiserId }),
        ...(tiktokAppId !== undefined && { tiktokAppId }),
        ...(tiktokAppSecret !== undefined && { tiktokAppSecret }),
        ...(tiktokAccessToken !== undefined && { tiktokAccessToken }),
      }
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}

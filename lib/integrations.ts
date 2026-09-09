/**
 * Estado das integrações externas — quem está configurado, e o que deixa de
 * funcionar quando não está.
 *
 * Duas regras de projeto vivem aqui:
 *
 * 1. **O painel é a fonte de verdade.** Toda credencial deve ser configurável
 *    em Configurações, sem variável de ambiente. Onde o `.env` ainda é a única
 *    origem de um valor, isto é reportado (`fromEnv`) para que a migração seja
 *    visível em vez de silenciosa.
 *
 * 2. **Credencial ausente degrada, não derruba.** A falta de uma credencial
 *    desabilita exatamente um recurso, com mensagem dizendo qual — o sistema
 *    segue funcionando no resto. Por isso cada integração declara o que ela
 *    habilita (`enables`), texto que a interface exibe quando ela falta.
 *
 * As duas únicas exceções à regra 1 são estruturais, não preguiça:
 * `DATABASE_URL` (não se guarda o endereço do banco dentro do banco) e
 * `NEXTAUTH_SECRET` (o middleware valida o cookie de sessão no edge, antes de
 * qualquer acesso ao banco; se ele e a rota de auth usassem segredos
 * diferentes, ninguém conseguiria entrar — inclusive no painel).
 */

import prisma from "./prisma";

type SettingsRow = Awaited<ReturnType<typeof prisma.systemSettings.findUnique>>;

export type IntegrationId =
  | "META"
  | "TIKTOK"
  | "SLACK"
  | "AI"
  | "TAVILY"
  | "MEDIA_STORAGE"
  | "GOOGLE_AUTH";

export interface IntegrationStatus {
  id: IntegrationId;
  label: string;
  configured: boolean;
  /** O recurso que esta integração habilita — exibido quando ela falta. */
  enables: string;
  /** Aba do painel onde se configura. */
  where: string;
  /**
   * O valor em uso vem de variável de ambiente, não do painel. Funciona, mas
   * contraria a regra de configuração única e some se o ambiente mudar.
   */
  fromEnv: boolean;
}

const filled = (value?: string | null) => !!(value && value.trim());
const env = (name: string) => filled(process.env[name]);

export function buildIntegrationStatuses(settings: SettingsRow): IntegrationStatus[] {
  // Meta também é painel apenas desde a remoção do fallback em `channels.ts`.
  const metaInPanel = filled(settings?.metaAdAccountId) && filled(settings?.metaAccessToken);

  const aiKeys = [
    settings?.geminiApiKey,
    settings?.anthropicApiKey,
    settings?.openaiApiKey,
    settings?.groqApiKey,
    settings?.openRouterApiKey,
    settings?.cohereApiKey,
    settings?.huggingFaceApiKey,
  ];
  const aiInPanel = aiKeys.some(filled);

  const tavilyInPanel = filled(settings?.tavilyApiKey);
  // Armazenamento é painel apenas: `resolveStorageConfig` não lê mais o
  // ambiente, então reportar "via .env" aqui seria mentira.
  const storageInPanel = filled(settings?.cpanelUploadUrl) && filled(settings?.cpanelUploadSecret);
  const googleInPanel = filled(settings?.googleClientId) && filled(settings?.googleClientSecret);

  return [
    {
      id: "META",
      label: "Meta Ads",
      configured: metaInPanel,
      enables: "sincronização de criativos e métricas da Meta",
      where: "Configurações › API",
      fromEnv: false,
    },
    {
      id: "TIKTOK",
      label: "TikTok Ads",
      configured: filled(settings?.tiktokAdvertiserId) && filled(settings?.tiktokAccessToken),
      enables: "sincronização de criativos e métricas do TikTok",
      where: "Configurações › API",
      fromEnv: false,
    },
    {
      id: "SLACK",
      label: "Slack",
      configured: filled(settings?.slackBotToken) && filled(settings?.slackChannelId),
      enables: "sincronização das entregas dos designers",
      where: "Configurações › API",
      fromEnv: false,
    },
    {
      id: "AI",
      label: "Inteligência Artificial",
      // Só o painel: `lib/ai.ts` nunca leu chave de ambiente, então uma chave
      // apenas no `.env` não gera texto nenhum — apesar de rotas antigas
      // liberarem a requisição por checarem `process.env`.
      configured: aiInPanel,
      enables: "hipóteses por criativo, insights e análise multimodal",
      where: "Configurações › IA",
      fromEnv: false,
    },
    {
      id: "TAVILY",
      label: "Tavily (busca web)",
      configured: tavilyInPanel || env("TAVILY_API_KEY"),
      enables: "busca de referências e hacks de mercado",
      where: "Configurações › IA",
      fromEnv: !tavilyInPanel && env("TAVILY_API_KEY"),
    },
    {
      id: "MEDIA_STORAGE",
      label: "Armazenamento de mídia",
      configured: storageInPanel,
      enables: "persistência das imagens e vídeos (sem isto, as mídias expiram)",
      where: "Configurações › Sistema",
      fromEnv: false,
    },
    {
      id: "GOOGLE_AUTH",
      label: "Login com Google",
      configured: googleInPanel || (env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")),
      enables: "entrada no sistema com conta Google",
      where: "Configurações › API",
      fromEnv: !googleInPanel && env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"),
    },
  ];
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  return buildIntegrationStatuses(settings);
}

/** Mensagem padrão de recurso indisponível, para as rotas devolverem. */
export function unavailableMessage(status: IntegrationStatus): string {
  return `${status.label} não está configurado, então ${status.enables} está indisponível. Configure em ${status.where}.`;
}

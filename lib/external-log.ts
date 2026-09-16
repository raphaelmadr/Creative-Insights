/**
 * Log de falhas em dependências externas.
 *
 * O painel de logs guardava basicamente "Iniciando sincronização automática" e
 * erros de interface. Tudo que falhava fora da nossa fronteira — chave de IA
 * inválida, cota estourada, token do Meta expirado, upload recusado pelo cPanel
 * — morria em `console.warn` no servidor, onde a equipe não olha. O sintoma
 * chegava como "a análise não funciona", sem dizer qual provedor, qual chave,
 * nem o que fazer.
 *
 * Cada registro aqui responde três coisas: O QUE falhou (serviço e operação),
 * POR QUE (a mensagem crua do provedor, mais o diagnóstico traduzido) e O QUE
 * FAZER (a correção, apontando o campo e a tela). Sem a terceira, o log é
 * relato; com ela, é tarefa.
 */

import { logError, logWarning } from "./logger";

/** Onde a credencial de cada serviço é configurada. */
interface CredentialHint {
  /** O campo em `SystemSettings`. */
  field: string;
  /** A tela onde ele é editado. */
  screen: string;
  /** Conselho específico, quando "gere uma chave no provedor" não se aplica. */
  advice?: string;
}

const CREDENTIALS: Record<string, CredentialHint> = {
  Gemini: { field: "geminiApiKey", screen: "Configurações › IA" },
  Groq: { field: "groqApiKey", screen: "Configurações › IA" },
  OpenRouter: { field: "openRouterApiKey", screen: "Configurações › IA" },
  OpenAI: { field: "openaiApiKey", screen: "Configurações › IA" },
  Anthropic: { field: "anthropicApiKey", screen: "Configurações › IA" },
  Cohere: { field: "cohereApiKey", screen: "Configurações › IA" },
  HuggingFace: { field: "huggingFaceApiKey", screen: "Configurações › IA" },
  Tavily: { field: "tavilyApiKey", screen: "Configurações › IA" },
  "Meta Ads": { field: "metaAccessToken", screen: "Configurações › Sistema & Integrações" },
  "TikTok Ads": { field: "tiktokAccessToken", screen: "Configurações › Sistema & Integrações" },
  Slack: { field: "slackBotToken", screen: "Configurações › Sistema & Integrações" },
  cPanel: {
    field: "cpanelUploadUrl / cpanelUploadSecret",
    screen: "Configurações › Sistema & Integrações",
    // O segredo do cPanel é definido por nós no `cpanel-upload.php`, não emitido
    // por um provedor: o erro quase sempre é divergência entre os dois lados.
    advice:
      "Confira se `cpanelUploadSecret` bate exatamente com o segredo definido no `cpanel-upload.php` do servidor, e se `cpanelUploadUrl` aponta para esse arquivo",
  },
};

export type FailureCause =
  | "credential-invalid"
  | "credential-expired"
  | "permission"
  | "quota"
  | "rate-limit"
  | "not-found"
  | "provider-down"
  | "network"
  | "unknown";

interface Diagnosis {
  cause: FailureCause;
  /** O que aconteceu, em português. */
  meaning: string;
  /** O que fazer a respeito. */
  fix: (service: string) => string;
  /** Falha de infraestrutura passageira entra como WARNING, não ERROR. */
  transient: boolean;
}

const DIAGNOSES: Record<FailureCause, Diagnosis> = {
  "credential-invalid": {
    cause: "credential-invalid",
    meaning: "a credencial foi recusada — chave inexistente, digitada errada ou revogada",
    fix: (service) => credentialFix(service, "Gere uma chave nova no painel do provedor e cole no campo"),
    transient: false,
  },
  "credential-expired": {
    cause: "credential-expired",
    meaning: "a credencial expirou",
    fix: (service) => credentialFix(service, "Gere um token novo no provedor e substitua o valor do campo"),
    transient: false,
  },
  permission: {
    cause: "permission",
    meaning: "a credencial é válida, mas não tem permissão para esta operação",
    fix: (service) =>
      credentialFix(service, "Confira os escopos/permissões concedidos à credencial no provedor; ela autentica mas não autoriza esta chamada"),
    transient: false,
  },
  quota: {
    cause: "quota",
    meaning: "a cota da conta acabou",
    fix: (service) =>
      `Revise o plano e o faturamento de ${service} no painel do provedor, ou remova a chave em ${screenOf(service)} para o sistema parar de tentar por ela e passar direto ao próximo provedor.`,
    transient: false,
  },
  "rate-limit": {
    cause: "rate-limit",
    meaning: "limite de chamadas por tempo excedido",
    fix: () => "Nenhuma ação de configuração necessária: a próxima execução volta a tentar. Se repetir a cada execução, reduza a frequência do cron em Configurações › Sistema.",
    transient: true,
  },
  "not-found": {
    cause: "not-found",
    meaning: "o recurso pedido não existe ou não é visível para esta credencial",
    fix: (service) =>
      `Confira o identificador da conta de ${service} em ${screenOf(service)} — e se a credencial tem acesso a essa conta.`,
    transient: false,
  },
  "provider-down": {
    cause: "provider-down",
    meaning: "o provedor respondeu com erro interno",
    fix: (service) => `Instabilidade em ${service}, do lado deles. Confira a página de status do provedor; a próxima execução tenta de novo.`,
    transient: true,
  },
  network: {
    cause: "network",
    meaning: "não foi possível estabelecer a conexão",
    fix: () => "Falha de rede ou DNS na saída do servidor. Se persistir, confira a conectividade do host e se o domínio do provedor não está bloqueado.",
    transient: true,
  },
  unknown: {
    cause: "unknown",
    meaning: "falha não classificada",
    fix: () => "Leia a mensagem original do provedor abaixo: ela traz o motivo específico.",
    transient: false,
  },
};

function screenOf(service: string): string {
  const hint = CREDENTIALS[service];
  return hint ? `${hint.screen} (campo ${hint.field})` : "Configurações";
}

function credentialFix(service: string, action: string): string {
  const hint = CREDENTIALS[service];
  if (!hint) return `${action} da credencial de ${service} em Configurações.`;
  if (hint.advice) return `${hint.advice} — ${hint.screen}.`;
  return `${action} \`${hint.field}\` em ${hint.screen}.`;
}

/** A mensagem crua do erro, seja qual for a forma em que ele veio. */
function rawMessage(error: unknown): string {
  if (!error) return "(sem mensagem)";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  const asAny = error as any;
  return (
    asAny?.error?.message ||
    asAny?.message ||
    asAny?.statusText ||
    (() => {
      try {
        return JSON.stringify(error).slice(0, 500);
      } catch {
        return String(error);
      }
    })()
  );
}

/** O código HTTP, quando o erro carrega um. */
function httpStatus(error: unknown): number | null {
  const asAny = error as any;
  const candidates = [asAny?.status, asAny?.statusCode, asAny?.response?.status, asAny?.error?.status];
  for (const value of candidates) {
    if (typeof value === "number" && value >= 100) return value;
  }

  // Provedores que só põem o número na mensagem: "[429 Too Many Requests]".
  const match = rawMessage(error).match(/\b(4\d{2}|5\d{2})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Classifica a falha a partir do que o provedor disse.
 *
 * A ordem é do mais específico para o mais genérico: a palavra "quota" separa
 * cota esgotada de rate limit, e as duas voltam 429 na maioria das APIs — a
 * primeira exige mexer no plano, a segunda resolve sozinha na próxima execução.
 * Tratá-las igual mandaria a equipe conferir faturamento por causa de um pico.
 */
export function classifyFailure(error: unknown): Diagnosis {
  const message = rawMessage(error).toLowerCase();
  const status = httpStatus(error);
  const metaCode = (error as any)?.code;

  // Meta: 190 é token inválido ou expirado; 102 é sessão expirada.
  if (metaCode === 190 || metaCode === 102) return DIAGNOSES["credential-expired"];
  if (typeof metaCode === "number" && (metaCode === 4 || metaCode === 17 || metaCode === 32 || metaCode === 613)) {
    return DIAGNOSES["rate-limit"];
  }
  if (typeof metaCode === "number" && metaCode >= 80000 && metaCode <= 80004) return DIAGNOSES["rate-limit"];
  if (metaCode === 200 || metaCode === 10) return DIAGNOSES.permission;

  if (/expired|expirou|expirado|token has expired/.test(message)) return DIAGNOSES["credential-expired"];
  if (/quota|billing|insufficient_quota|exceeded your current quota|plano/.test(message)) return DIAGNOSES.quota;
  if (/rate ?limit|too many requests|slow down/.test(message)) return DIAGNOSES["rate-limit"];
  if (/invalid[_ ]api[_ ]key|incorrect api key|invalid token|unauthorized|api key not valid|authentication/.test(message)) {
    return DIAGNOSES["credential-invalid"];
  }
  if (/permission|forbidden|not allowed|scope/.test(message)) return DIAGNOSES.permission;
  if (/enotfound|econnrefused|etimedout|econnreset|fetch failed|network|dns/.test(message)) return DIAGNOSES.network;

  if (status === 401) return DIAGNOSES["credential-invalid"];
  if (status === 403) return DIAGNOSES.permission;
  if (status === 404) return DIAGNOSES["not-found"];
  if (status === 429) return DIAGNOSES["rate-limit"];
  if (status !== null && status >= 500) return DIAGNOSES["provider-down"];

  return DIAGNOSES.unknown;
}

export interface ExternalFailure {
  /** O serviço externo, como a equipe o chama: "Meta Ads", "Gemini", "cPanel". */
  service: string;
  /** A operação em curso, em português: "transcrever criativo", "buscar insights". */
  operation: string;
  /** O erro cru, como veio do provedor. */
  error: unknown;
  /** O endpoint chamado — sem chave, sem token. */
  endpoint?: string;
  /** Qualquer contexto que ajude a reproduzir: id do anúncio, id do criativo. */
  context?: Record<string, string | number | null | undefined>;
}

/** Remove chaves e tokens de uma URL antes de ela virar log. */
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/([?&](?:access_token|key|api_key|token)=)[^&]*/gi, "$1[oculto]")
    .slice(0, 300);
}

/**
 * Registra a falha no painel de logs, já com o diagnóstico e a correção.
 *
 * Falha passageira (limite de taxa, instabilidade, rede) entra como WARNING:
 * ela não pede ação de configuração, e tratá-la como ERROR encheria o painel de
 * alarme que ninguém pode resolver — o que faz a equipe parar de ler o painel.
 */
export async function logExternalFailure(failure: ExternalFailure): Promise<void> {
  const diagnosis = classifyFailure(failure.error);
  const raw = rawMessage(failure.error);

  const contextLine = failure.context
    ? Object.entries(failure.context)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${value}`)
        .join(" · ")
    : "";

  const message = [
    `${failure.service}: ${failure.operation} falhou — ${diagnosis.meaning}.`,
    `CORRIGIR: ${diagnosis.fix(failure.service)}`,
    `Provedor respondeu: ${raw}`,
    failure.endpoint ? `Endpoint: ${redactUrl(failure.endpoint)}` : "",
    contextLine ? `Contexto: ${contextLine}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const source = `EXTERNAL/${failure.service.toUpperCase().replace(/\s+/g, "_")}`;

  if (diagnosis.transient) {
    await logWarning(source, message);
  } else {
    await logError(source, Object.assign(new Error(message), {
      stack: failure.error instanceof Error ? failure.error.stack : undefined,
    }));
  }
}

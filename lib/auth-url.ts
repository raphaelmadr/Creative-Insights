/**
 * A URL pública que a autenticação usa para voltar do Google.
 *
 * O `redirect_uri` enviado ao Google é montado pelo NextAuth a partir de
 * `NEXTAUTH_URL`. Quando essa variável não existe no ambiente, o NextAuth cai
 * no domínio que a plataforma injeta — e na Vercel esse domínio **muda a cada
 * deploy**. O Google recusa qualquer URI que não esteja na lista de autorizados
 * do cliente OAuth, então o login passa a falhar com `redirect_uri_mismatch`
 * toda vez que sai um deploy novo, sem nada ter mudado no código.
 *
 * A resolução aqui fixa um endereço estável. A ordem nunca piora uma
 * configuração que já esteja certa:
 *
 *  1. `NEXTAUTH_URL` do ambiente — é a configuração canônica do NextAuth, e
 *     quem a definiu explicitamente manda;
 *  2. o campo do painel, para quem administra sem acesso ao deploy;
 *  3. `VERCEL_PROJECT_PRODUCTION_URL`, que é o domínio estável do projeto —
 *     diferente de `VERCEL_URL`, que é o do deploy e muda sempre.
 *
 * Endereço local nunca conta como público: em produção ele é sintoma de
 * variável esquecida, e usá-lo mandaria o Google redirecionar para a máquina
 * de quem está tentando entrar.
 */

import prisma from "./prisma";

/** Caminho fixo do NextAuth para o retorno do Google. */
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

export type AuthUrlSource = "NEXTAUTH_URL" | "PAINEL" | "VERCEL_PROJECT_PRODUCTION_URL";

export interface AuthUrlResolution {
  /** Base sem barra final, com protocolo. `null` quando nada público é conhecido. */
  baseUrl: string | null;
  source: AuthUrlSource | null;
  /** A URI exata que precisa estar autorizada no cliente OAuth do Google. */
  redirectUri: string | null;
}

const normalize = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const isLocal = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);

export async function resolveAuthUrl(): Promise<AuthUrlResolution> {
  const panelUrl = await prisma.systemSettings
    .findUnique({ where: { id: 1 }, select: { nextAuthUrl: true } })
    .then((s) => s?.nextAuthUrl)
    .catch(() => null);

  const candidates: { value: string | null; source: AuthUrlSource }[] = [
    { value: normalize(process.env.NEXTAUTH_URL), source: "NEXTAUTH_URL" },
    { value: normalize(panelUrl), source: "PAINEL" },
    { value: normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL), source: "VERCEL_PROJECT_PRODUCTION_URL" },
  ];

  const resolved = candidates.find((c) => c.value && !isLocal(c.value));

  if (!resolved?.value) {
    /*
     * Em desenvolvimento o endereço local É o endereço certo — devolvê-lo evita
     * que a tela de diagnóstico diga "não configurado" para quem está rodando
     * na própria máquina.
     */
    const local = candidates.find((c) => c.value);
    return local?.value
      ? { baseUrl: local.value, source: local.source, redirectUri: `${local.value}${GOOGLE_CALLBACK_PATH}` }
      : { baseUrl: null, source: null, redirectUri: null };
  }

  return {
    baseUrl: resolved.value,
    source: resolved.source,
    redirectUri: `${resolved.value}${GOOGLE_CALLBACK_PATH}`,
  };
}

/**
 * Garante que o NextAuth monte o `redirect_uri` a partir do endereço estável.
 *
 * Só escreve quando a variável está ausente ou aponta para um endereço local
 * fora de desenvolvimento: uma configuração explícita e válida no ambiente
 * continua mandando, e em desenvolvimento nada é tocado.
 */
export async function ensureAuthUrlEnv(): Promise<AuthUrlResolution> {
  const resolution = await resolveAuthUrl();

  const current = normalize(process.env.NEXTAUTH_URL);
  const currentIsUsable = !!current && (!isLocal(current) || process.env.NODE_ENV === "development");

  if (!currentIsUsable && resolution.baseUrl && !isLocal(resolution.baseUrl)) {
    process.env.NEXTAUTH_URL = resolution.baseUrl;
    console.warn(
      `[auth] NEXTAUTH_URL ausente ou local em produção. Usando ${resolution.baseUrl} ` +
      `(origem: ${resolution.source}). Autorize ${resolution.redirectUri} no cliente OAuth do Google.`
    );
  }

  return resolution;
}

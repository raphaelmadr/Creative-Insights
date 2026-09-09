/**
 * Resolução da URL pública do endpoint de cron.
 *
 * O painel não pode montar essa URL no browser: quem a copia normalmente está
 * numa aba de desenvolvimento, e `window.location.origin` devolveria
 * `http://localhost:3000` — endereço que o servidor externo do cPanel jamais
 * alcança. A resolução tem que acontecer no servidor, a partir do domínio de
 * produção que a Vercel injeta.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` é o domínio estável do projeto (é o mesmo que
 * o Next usa para resolver `metadataBase`), diferente de `VERCEL_URL`, que muda
 * a cada deploy e portanto não serve para um cron configurado uma vez.
 */

import prisma from "./prisma";

export const CRON_PATH = "/api/cron/sync-all";

export interface CronUrlResolution {
  /** Base sem barra final, já com protocolo. `null` quando nada é conhecido. */
  baseUrl: string | null;
  source: "CRON_PUBLIC_URL" | "VERCEL_PROJECT_PRODUCTION_URL" | "NEXTAUTH_URL" | null;
  /** Falso quando só foi possível chegar a um endereço local. */
  reachableExternally: boolean;
}

const normalize = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const isLocal = (url: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);

export async function resolveCronBaseUrl(): Promise<CronUrlResolution> {
  const settings = await prisma.systemSettings
    .findUnique({ where: { id: 1 }, select: { nextAuthUrl: true } })
    .catch(() => null);

  const candidates: { value: string | null; source: CronUrlResolution["source"] }[] = [
    // Escape hatch para domínio próprio que não esteja em nenhuma das outras fontes.
    { value: normalize(process.env.CRON_PUBLIC_URL), source: "CRON_PUBLIC_URL" },
    {
      value: normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      source: "VERCEL_PROJECT_PRODUCTION_URL",
    },
    { value: normalize(settings?.nextAuthUrl), source: "NEXTAUTH_URL" },
    { value: normalize(process.env.NEXTAUTH_URL), source: "NEXTAUTH_URL" },
  ];

  const external = candidates.find((c) => c.value && !isLocal(c.value));
  if (external) {
    return { baseUrl: external.value!, source: external.source, reachableExternally: true };
  }

  // Só sobrou endereço local: devolvido para o painel poder dizer exatamente
  // qual é o problema, em vez de entregar uma URL que falharia em silêncio.
  const local = candidates.find((c) => c.value);
  return {
    baseUrl: local?.value ?? null,
    source: local?.source ?? null,
    reachableExternally: false,
  };
}

/**
 * URL completa com o segredo na query — formato para disparadores que só
 * aceitam colar um link. O segredo acaba nos logs de acesso do servidor.
 */
export function buildTriggerUrl(baseUrl: string, secret: string | null): string {
  const url = `${baseUrl}${CRON_PATH}`;
  return secret ? `${url}?secret=${encodeURIComponent(secret)}` : url;
}

/**
 * Comando pronto para o campo "Command" do Cron Jobs do cPanel, que executa
 * numa shell e não aceita URL pura.
 *
 * Cada flag existe por um motivo:
 * - `-H Authorization` mantém o segredo fora da URL e, portanto, fora dos logs
 *   de acesso da Vercel.
 * - `-o /dev/null` descarta o corpo da resposta em caso de sucesso. Sem isso, o
 *   cPanel enviaria um e-mail com o JSON a cada batida — 96 por dia.
 * - `-f` faz o curl retornar erro em HTTP >= 400 e `-S` imprime a mensagem, de
 *   modo que só as falhas geram e-mail.
 * - `-m 300` impede que uma requisição pendurada deixe o processo do cron vivo
 *   para sempre; o teto interno da sincronização é de 180s.
 */
export function buildTriggerCommand(baseUrl: string, secret: string | null): string {
  const url = `${baseUrl}${CRON_PATH}`;
  const auth = secret ? `-H "Authorization: Bearer ${secret}" ` : "";
  return `curl -fsS -m 300 -o /dev/null ${auth}"${url}"`;
}

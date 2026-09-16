/**
 * Diagnóstico da configuração de login.
 *
 * Acessível sem sessão de propósito: ela responde justamente à situação em que
 * ninguém consegue entrar, e uma rota protegida seria inútil para quem está do
 * lado de fora. Nada aqui é segredo — o endereço de retorno e o ID do cliente
 * OAuth viajam na barra de endereços durante o próprio fluxo do Google. O
 * segredo do cliente e o do NextAuth nunca saem daqui, só a informação de que
 * existem.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveAuthUrl } from "@/lib/auth-url";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  NEXTAUTH_URL: "variável de ambiente NEXTAUTH_URL",
  PAINEL: "campo do painel (Configurações › Sistema)",
  VERCEL_PROJECT_PRODUCTION_URL: "domínio de produção injetado pela Vercel",
};

export async function GET() {
  const auth = await resolveAuthUrl();

  /*
   * O erro do banco é guardado, não engolido.
   *
   * Engolindo, uma falha de conexão vira "campo vazio", e esta tela — cuja
   * única função é dizer por que ninguém entra — acusa "Client ID não
   * configurado" e manda a pessoa mexer no Google Cloud Console, onde não há
   * nada errado. Foi exatamente o que aconteceu na migração para o cPanel: as
   * credenciais estavam no banco o tempo todo, inalcançáveis.
   */
  let dbError: string | null = null;
  const settings = await prisma.systemSettings
    .findUnique({
      where: { id: 1 },
      select: { googleClientId: true, googleClientSecret: true, nextAuthSecret: true },
    })
    .catch((e: unknown) => {
      const bruto = e instanceof Error ? e.message : String(e);
      const linhas = bruto.split("\n").map((l) => l.trim()).filter(Boolean);

      /*
       * A primeira linha do Prisma é sempre o cabeçalho — "Invalid
       * `prisma.x.findUnique()` invocation:" — que não diz nada sobre a causa.
       * A informação está na linha seguinte: "Can't reach database server",
       * "Authentication failed", "could not locate the Query Engine".
       */
      const util = linhas.find((l) => !/^Invalid `.*` invocation:?$/.test(l));

      /*
       * Rota pública: qualquer coisa parecida com string de conexão sai antes
       * de virar resposta.
       */
      dbError = (util ?? linhas[0] ?? "erro desconhecido")
        .replace(/\b\w+:\/\/[^\s`"']+/g, "[conexão]")
        .slice(0, 300);
      return null;
    });

  const clientId = (settings?.googleClientId || process.env.GOOGLE_CLIENT_ID || "").trim();
  const hasSecret = !!(settings?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET);
  const hasNextAuthSecret = !!(settings?.nextAuthSecret || process.env.NEXTAUTH_SECRET);

  const problems: string[] = [];

  if (!auth.redirectUri) {
    problems.push(
      "Nenhum endereço público conhecido. Defina NEXTAUTH_URL no ambiente de produção."
    );
  } else if (auth.source === "VERCEL_PROJECT_PRODUCTION_URL") {
    problems.push(
      "O endereço veio do domínio da Vercel, não de uma configuração sua. Funciona, mas defina " +
      "NEXTAUTH_URL no ambiente para que ele não dependa da plataforma."
    );
  }

  /*
   * O banco vem primeiro na lista. Sem ele, as três queixas abaixo são
   * consequência, não diagnóstico — e ler "Client ID não configurado" no topo
   * leva a pessoa para o lugar errado.
   */
  if (dbError) {
    problems.push(
      `Banco de dados inacessível: ${dbError}. As credenciais do Google e do sistema ficam nele, ` +
      "então tudo abaixo pode ser apenas efeito disto."
    );
  }

  if (!clientId) problems.push("Client ID do Google não configurado.");
  if (!hasSecret) problems.push("Client Secret do Google não configurado.");
  if (!hasNextAuthSecret) problems.push("NEXTAUTH_SECRET não configurado.");

  return NextResponse.json({
    success: true,
    /** A URI exata que precisa estar autorizada no cliente OAuth do Google. */
    redirectUri: auth.redirectUri,
    baseUrl: auth.baseUrl,
    source: auth.source,
    sourceLabel: auth.source ? SOURCE_LABEL[auth.source] : null,
    googleClientId: clientId || null,
    hasClientSecret: hasSecret,
    hasNextAuthSecret,
    database: dbError ? { ok: false, error: dbError } : { ok: true },
    problems,
    howToFix: auth.redirectUri
      ? [
          `No Google Cloud Console › APIs e Serviços › Credenciais, abra o cliente OAuth e adicione exatamente esta URI em "URIs de redirecionamento autorizados": ${auth.redirectUri}`,
          "A URI precisa bater caractere por caractere: mesmo protocolo, mesmo domínio e sem barra no final.",
          `Defina NEXTAUTH_URL=${auth.baseUrl} nas variáveis de ambiente de produção e publique de novo — sem isso o endereço pode mudar a cada deploy.`,
        ]
      : [
          "Defina NEXTAUTH_URL com o endereço público do sistema (por exemplo https://seu-dominio.com) nas variáveis de ambiente de produção e publique de novo.",
        ],
  });
}

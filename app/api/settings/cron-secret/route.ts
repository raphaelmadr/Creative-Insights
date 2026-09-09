import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { buildTriggerCommand, buildTriggerUrl, resolveCronBaseUrl, CRON_PATH } from "@/lib/cron-url";

export const dynamic = "force-dynamic";

/**
 * Estado e rotação do segredo do cron.
 *
 * Fica sob `api/settings` de propósito: o matcher do middleware libera o
 * prefixo `api/cron` para disparadores externos, então uma rota chamada
 * `/api/cron-secret` seria pública — qualquer um poderia ler e trocar o
 * segredo. Aqui ela herda a proteção de sessão como qualquer outra tela do
 * painel.
 *
 * A geração grava no banco na mesma requisição. Isso é deliberado: se o valor
 * aparecesse na tela antes de ser salvo, a URL exibida seria recusada pelo
 * servidor até o usuário clicar em salvar — exatamente o tipo de estado
 * intermediário que gera "colei e deu 401".
 */
async function buildState() {
  const [settings, resolution] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { id: 1 }, select: { cronSecret: true } }),
    resolveCronBaseUrl(),
  ]);

  const dbSecret = settings?.cronSecret || null;
  const envSecret = process.env.CRON_SECRET || null;
  // O segredo do painel manda na URL exibida; o de ambiente segue aceito pelo
  // endpoint, mas não é revelado aqui.
  const secretForUrl = dbSecret || envSecret;

  return {
    hasSecret: !!(dbSecret || envSecret),
    hasDbSecret: !!dbSecret,
    hasEnvSecret: !!envSecret,
    secret: dbSecret,
    path: CRON_PATH,
    baseUrl: resolution.baseUrl,
    baseUrlSource: resolution.source,
    reachableExternally: resolution.reachableExternally,
    // Os dois formatos são montados aqui, e não no browser, pelo mesmo motivo
    // da URL: só o servidor conhece o domínio público de produção.
    triggerUrl: resolution.baseUrl ? buildTriggerUrl(resolution.baseUrl, secretForUrl) : null,
    triggerCommand: resolution.baseUrl
      ? buildTriggerCommand(resolution.baseUrl, secretForUrl)
      : null,
  };
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await buildState()) });
  } catch (error: any) {
    console.error("Error reading cron secret state:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

/** Gera um novo segredo, grava e devolve a URL já pronta para o disparador. */
export async function POST() {
  try {
    const secret = randomBytes(24).toString("hex");

    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { cronSecret: secret },
      create: { id: 1, cronSecret: secret },
    });

    return NextResponse.json({ success: true, ...(await buildState()) });
  } catch (error: any) {
    console.error("Error rotating cron secret:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

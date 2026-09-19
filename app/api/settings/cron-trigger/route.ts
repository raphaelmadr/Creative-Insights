import { NextResponse } from "next/server";
import { buildTriggerCommand, buildTriggerUrl, resolveCronBaseUrl, CRON_PATH } from "@/lib/cron-url";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * O comando pronto para colar no Cron Jobs do cPanel.
 *
 * Vivia em `/api/settings/cron-secret`, com um segredo que o painel gerava e
 * o endpoint de cron cobrava no cabeçalho `Authorization`. O segredo saiu (ver
 * `lib/cron-endpoint.ts`): toda batida cai no portão de intervalo, então uma
 * descoberta da URL por fora não força sincronização alguma fora da janela —
 * só `?force=1` faria isso, e não depende de rotação de chave para ser
 * revisado. Sem segredo para rotacionar, não há mais POST aqui: só a leitura.
 *
 * Continua sob `api/settings`, e não `api/cron`, porque o matcher do
 * middleware libera `api/cron` para o disparador externo — uma rota aqui
 * herda a proteção de sessão do painel, mesmo sem nada secreto para proteger.
 */
export async function GET(req: Request) {
  // Ação do painel de configurações: restrita a administradores.
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const resolution = await resolveCronBaseUrl(req);

    return NextResponse.json({
      success: true,
      path: CRON_PATH,
      baseUrl: resolution.baseUrl,
      baseUrlSource: resolution.source,
      reachableExternally: resolution.reachableExternally,
      // Os dois formatos são montados aqui, e não no browser, pelo mesmo
      // motivo da URL: só o servidor conhece o domínio público de produção.
      triggerUrl: resolution.baseUrl ? buildTriggerUrl(resolution.baseUrl) : null,
      triggerCommand: resolution.baseUrl ? buildTriggerCommand(resolution.baseUrl) : null,
    });
  } catch (error: any) {
    console.error("Error reading cron trigger state:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}

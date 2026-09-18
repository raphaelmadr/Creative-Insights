/**
 * O mínimo que o cabeçalho precisa para desenhar.
 *
 * Existe porque `/api/settings` era chamado DUAS vezes em todo carregamento de
 * página — uma pelo `TopBar`, para saber se Meta e TikTok estão conectados, e
 * outra pelo `NotificationProvider`, para a data da última sincronização. As
 * duas esperavam a mesma rota, que devolve a configuração inteira: os cinco
 * prompts de IA (alguns com milhares de caracteres) e, para quem administra,
 * todas as chaves de API.
 *
 * Quer dizer: para acender dois ícones, o navegador baixava duas vezes os
 * prompts do gerador de copy. E as credenciais saíam do servidor em toda visita
 * a qualquer tela, não só no painel de configurações.
 *
 * Aqui só sai o que o cabeçalho usa, e nada disso é segredo: booleanos de
 * integração e três carimbos de tempo.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildIntegrationStatuses } from "@/lib/integrations";
import { buildSyncStatus } from "@/lib/sync-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    /*
     * A linha inteira é lida, mas não devolvida.
     *
     * `buildIntegrationStatuses` decide "conectado" a partir de uma dúzia de
     * campos, e listá-los num `select` criaria uma segunda lista para
     * discordar da primeira toda vez que uma integração for acrescentada. Ler
     * uma linha por chave primária é barato; o que era caro era mandá-la pela
     * rede.
     */
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const integrations = buildIntegrationStatuses(settings);

    /*
     * O estado da automação sai pronto daqui, e não montado na tela.
     *
     * Cada tela que tentava montá-lo sozinha chegava a uma resposta diferente —
     * e a divergência foi o que escondeu um disparador morto por horas. Quem
     * calcula é `lib/sync-status.ts`, um módulo só, e o navegador reusa este
     * mesmo objeto a cada tique do relógio.
     */
    const sync = buildSyncStatus({
      cronSyncEnabled: settings?.cronSyncEnabled,
      cronSyncInterval: settings?.cronSyncInterval,
      lastSyncAt: settings?.lastSyncAt ?? null,
      lastCronSyncAt: settings?.lastCronSyncAt ?? null,
      lastMediaSyncAt: settings?.lastMediaSyncAt ?? null,
      lastCronPingAt: settings?.lastCronPingAt ?? null,
      // As fontes que a sincronização percorre são Meta e TikTok; as demais
      // integrações habilitam outros recursos e não têm o que sincronizar.
      hasConfiguredSource: integrations.some(
        (i) => (i.id === "META" || i.id === "TIKTOK") && i.configured
      ),
    });

    return NextResponse.json({
      success: true,
      // Só `id` e `configured`: o cabeçalho acende ícone, não configura nada.
      integrations: integrations.map((i) => ({
        id: i.id,
        configured: i.configured,
      })),
      sync,
    });
  } catch (error) {
    console.error("[Resumo de configurações] Falha:", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível carregar o resumo." },
      { status: 500 }
    );
  }
}

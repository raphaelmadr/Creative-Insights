import { handleCronRequest } from "@/lib/cron-endpoint";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Alias legado de `/api/cron/sync-all`.
 *
 * O nome nasceu quando só a Meta era sincronizada; hoje a execução automática
 * cobre Meta, TikTok e as entregas do Slack. Mantido no ar para não quebrar
 * disparadores externos já apontados para esta URL — em configurações novas,
 * use `/api/cron/sync-all`.
 */
export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}

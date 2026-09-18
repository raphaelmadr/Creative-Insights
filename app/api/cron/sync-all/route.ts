import { handleCronRequest } from "@/lib/cron-endpoint";

/*
 * Sem `maxDuration`: ele era a declaração do teto da função serverless, e
 * aqui nada corta a execução por tempo. A sincronização roda até terminar.
 */
export const dynamic = "force-dynamic";

/**
 * Endpoint da sincronização automática — a "porta" em que o Cron Job do cPanel
 * bate. Aceita GET e POST porque disparadores externos usam um ou outro.
 *
 * O disparador não carrega configuração alguma: cadência, modo e liga/desliga
 * vivem no painel (Configurações › Sistema). Configure o cron externo para
 * bater a cada 15 minutos e deixe o painel decidir — assim, reduzir o intervalo
 * no painel passa a valer na hora, sem mexer no servidor.
 */
export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}

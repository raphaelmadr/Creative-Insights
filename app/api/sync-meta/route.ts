import { NextResponse } from "next/server";
import { runMetaSync } from "@/lib/meta-sync";

export const maxDuration = 300;

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type, ...data }) + '\n'));
      };

      try {
        const { searchParams } = new URL(req.url);
        const mode = (searchParams.get("mode") || "full") as "full" | "metrics";
        const monthParam = searchParams.get("month");
        const yearParam = searchParams.get("year");
        
        const targetMonth = monthParam ? parseInt(monthParam) : undefined;
        const targetYear = yearParam ? parseInt(yearParam) : undefined;
        
        const { syncedAds, syncedMetrics } = await runMetaSync(mode, (message, percentage) => {
          sendEvent('progress', { message, percentage });
        }, targetMonth, targetYear);

        sendEvent('complete', { 
          message: `Sincronização concluída! ${syncedAds} anúncios e ${syncedMetrics} métricas atualizadas.`,
          percentage: 100
        });
        controller.close();

      } catch (error: any) {
        console.error("Meta API Sync Error:", error);
        sendEvent('error', { error: error.message || "Erro desconhecido durante a sincronização." });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

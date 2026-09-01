import { NextResponse } from "next/server";
import { runTikTokSync } from "@/lib/tiktok-sync";

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") as "full" | "metrics" || "full";
    const month = searchParams.has("month") ? parseInt(searchParams.get("month")!) : undefined;
    const year = searchParams.has("year") ? parseInt(searchParams.get("year")!) : undefined;
    
    // Configura encoder para streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const onProgress = async (message: string, percentage: number) => {
      try {
        await writer.write(
          encoder.encode(JSON.stringify({ type: 'progress', message, percentage }) + '\n')
        );
      } catch (e) {
        // Stream may have been closed by client
      }
    };

    // Inicia processo em background e retorna o stream
    (async () => {
      try {
        await runTikTokSync(mode, onProgress, month, year);
        await writer.write(encoder.encode(JSON.stringify({ type: 'complete', message: "Concluído", percentage: 100 }) + '\n'));
      } catch (error: any) {
        console.error("TikTok Sync Error:", error);
        await writer.write(encoder.encode(JSON.stringify({ type: 'error', error: error.message || "Erro desconhecido", percentage: 100 }) + '\n'));
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Erro fatal na rota sync-tiktok:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

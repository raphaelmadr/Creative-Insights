import { NextResponse } from "next/server";
import { runMetaSync } from "@/lib/meta-sync";

// Rota recomendada pela Vercel para Cron Jobs
// https://vercel.com/docs/cron-jobs
export async function GET(req: Request) {
  try {
    // Basic security for cron endpoints
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

    if (settings && !settings.cronSyncEnabled) {
      console.log("[Cron] Sync automático está desativado nas configurações.");
      return NextResponse.json({ success: true, message: "Cron disabled in settings" });
    }

    // Verifica se já passou o intervalo configurado desde a última execução
    if (settings && settings.lastCronSyncAt) {
      const intervalMs = (settings.cronSyncInterval || 120) * 60 * 1000;
      const timeSinceLastSync = Date.now() - settings.lastCronSyncAt.getTime();
      
      if (timeSinceLastSync < intervalMs) {
        console.log(`[Cron] Pulando execução. Tempo restante: ${Math.round((intervalMs - timeSinceLastSync) / 60000)} minutos.`);
        return NextResponse.json({ success: true, message: "Skipped - Interval not reached yet" });
      }
    }

    const mode = (settings?.cronSyncMode as "full" | "metrics") || "metrics";

    console.log(`[Cron] Iniciando Meta Sync Background... Modo: ${mode}`);
    
    const { syncedAds, syncedMetrics } = await runMetaSync(mode, (msg, perc) => {
      console.log(`[Cron Sync ${perc}%] ${msg}`);
    });

    // Atualiza o horário da última execução do cron
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: { lastCronSyncAt: new Date() }
    });

    console.log(`[Cron] Meta Sync concluído. Ads: ${syncedAds}, Metrics: ${syncedMetrics}`);

    return NextResponse.json({ success: true, syncedAds, syncedMetrics });
  } catch (error: any) {
    console.error("[Cron] Error running meta sync:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

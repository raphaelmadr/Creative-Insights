import { NextResponse } from "next/server";
import { runAllChannelSyncs, summarizeOutcomes } from "@/lib/channels";

export const maxDuration = 300;

// Rota recomendada pela Vercel para Cron Jobs
// https://vercel.com/docs/cron-jobs
export async function GET(req: Request) {
  try {
    // Basic security for cron endpoints
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const prisma = (await import("@/lib/prisma")).default;
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

    if (settings && !settings.cronSyncEnabled) {
      console.log("[Cron] Sync automático está desativado nas configurações.");
      return NextResponse.json({ success: true, message: "Cron disabled in settings" });
    }

    // Verifica se já passou o intervalo configurado desde a última execução
    if (settings?.lastCronSyncAt) {
      const intervalMs = (settings.cronSyncInterval || 120) * 60 * 1000;
      const timeSinceLastSync = Date.now() - settings.lastCronSyncAt.getTime();

      if (timeSinceLastSync < intervalMs) {
        console.log(`[Cron] Pulando execução. Tempo restante: ${Math.round((intervalMs - timeSinceLastSync) / 60000)} minutos.`);
        return NextResponse.json({ success: true, message: "Skipped - Interval not reached yet" });
      }
    }

    const mode = (settings?.cronSyncMode as "full" | "metrics") || "metrics";

    console.log(`[Cron] Iniciando sincronização de todos os canais configurados. Modo: ${mode}`);

    // Mesma orquestração usada pelo botão da interface — um caminho só, sem
    // divergência de comportamento entre execução manual e automática.
    const { outcomes, ok } = await runAllChannelSyncs(mode, (message, percentage) => {
      console.log(`[Cron ${percentage}%] ${message}`);
    });

    await prisma.systemSettings.update({
      where: { id: 1 },
      data: { lastCronSyncAt: new Date() },
    });

    console.log(`[Cron] Sync finalizado. ${summarizeOutcomes(outcomes)}`);

    return NextResponse.json({ success: ok, outcomes });
  } catch (error: any) {
    console.error("[Cron] Error running sync:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

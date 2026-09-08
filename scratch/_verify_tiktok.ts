import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { runTikTokSync } from "../lib/tiktok-sync";
import prisma from "../lib/prisma";

async function main() {
  const before = await prisma.adCreative.count({ where: { platform: "TIKTOK", videoUrl: { not: null } } });
  console.log("TikTok com videoUrl ANTES:", before);

  const r = await runTikTokSync("full", (m, p) => console.log(`[${p}%] ${m}`));
  console.log("resultado:", r);

  const after = await prisma.adCreative.count({ where: { platform: "TIKTOK", videoUrl: { not: null } } });
  const vids = await prisma.adCreative.count({ where: { platform: "TIKTOK", mediaType: "video" } });
  const cpanel = await prisma.adCreative.count({ where: { platform: "TIKTOK", imageUrl: { contains: "assets.raphaelmadureira" } } });
  const metrics = await prisma.adDailyMetrics.count({ where: { creative: { platform: "TIKTOK" }, date: { gte: new Date("2026-09-01T00:00:00Z") } } });
  console.log({ videoUrlDepois: after, mediaTypeVideo: vids, imagensNoCpanel: cpanel, metricasSetembro: metrics });
}
main().catch(console.error).finally(() => prisma.$disconnect());

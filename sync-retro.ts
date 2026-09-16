import { config } from "dotenv";
config({ path: ".env.local" });
import { runMetaSync } from "./lib/meta-sync";
import prisma from "./lib/prisma";

async function main() {
  console.log("Iniciando limpeza dos dados anteriores...");

  // Excluir métricas de Agosto e Julho para forçar a resincronização
  const deleted = await prisma.adDailyMetrics.deleteMany({
    where: {
      date: {
        gte: new Date("2026-07-01T00:00:00Z"),
        lt: new Date("2026-09-01T00:00:00Z")
      }
    }
  });

  console.log(`Deletados ${deleted.count} registros de métricas de Julho e Agosto.`);

  console.log("Iniciando resincronização de Julho...");
  await runMetaSync("full", (msg, pct) => console.log(`[Julho ${pct}%] ${msg}`), 7, 2026);

  console.log("Iniciando resincronização de Agosto...");
  await runMetaSync("full", (msg, pct) => console.log(`[Agosto ${pct}%] ${msg}`), 8, 2026);

  console.log("Sincronização retroativa concluída com sucesso!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

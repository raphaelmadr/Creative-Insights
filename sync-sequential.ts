import { config } from "dotenv";
config({ path: ".env.local" });
import { runMetaSync } from "./lib/meta-sync";
import prisma from "./lib/prisma";

async function main() {
  console.log("Iniciando limpeza dos dados (para evitar dias incompletos devido à queda do banco)...");

  // Excluir métricas de Agosto e Julho para forçar a resincronização do zero
  const deleted = await prisma.adDailyMetrics.deleteMany({
    where: {
      date: {
        gte: new Date("2026-07-01T00:00:00Z"),
        lt: new Date("2026-09-01T00:00:00Z")
      }
    }
  });

  console.log(`Deletados ${deleted.count} registros de métricas parciais de Julho e Agosto.`);

  console.log("Iniciando resincronização de JULHO...");
  await runMetaSync("full", (msg, pct) => console.log(`[Julho ${pct}%] ${msg}`), 7, 2026);
  
  console.log("Pausa de 10 segundos para o banco respirar...");
  await new Promise(r => setTimeout(r, 10000));

  console.log("Iniciando resincronização de AGOSTO...");
  await runMetaSync("full", (msg, pct) => console.log(`[Agosto ${pct}%] ${msg}`), 8, 2026);

  console.log("Sincronização sequencial concluída com sucesso!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

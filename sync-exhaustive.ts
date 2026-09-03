import { config } from "dotenv";
config({ path: ".env.local" });
import { runMetaSync } from "./lib/meta-sync";
import prisma from "./lib/prisma";

async function runExhaustive(month: number, year: number, monthName: string) {
  let isComplete = false;
  let cycle = 1;
  while (!isComplete) {
    console.log(`\n--- Iniciando ${monthName} (Ciclo ${cycle}) ---`);
    const result = await runMetaSync("full", (msg, pct) => console.log(`[${monthName} ${pct}%] ${msg}`), month, year);
    
    if (result.reachedLimit) {
      console.log(`\n⚠️ Limite de tempo atingido para ${monthName} no ciclo ${cycle}.`);
      console.log("Aguardando 15 segundos antes de continuar a extração...");
      await new Promise(r => setTimeout(r, 15000));
      cycle++;
    } else {
      console.log(`\n✅ ${monthName} concluído completamente em ${cycle} ciclos!`);
      isComplete = true;
    }
  }
}

async function main() {
  console.log("Iniciando sincronização EXAUSTIVA (Julho completo -> Agosto completo)...");

  // Apenas deletamos as métricas pendentes para forçar a raspagem total
  // (Nota: o sync-sequential deletou antes de ser interrompido, mas garantimos aqui)
  const deleted = await prisma.adDailyMetrics.deleteMany({
    where: {
      date: {
        gte: new Date("2026-07-01T00:00:00Z"),
        lt: new Date("2026-09-01T00:00:00Z")
      }
    }
  });
  console.log(`Deletados ${deleted.count} registros de métricas pendentes.`);

  await runExhaustive(7, 2026, "Julho");
  
  console.log("\n====================================");
  console.log("Julho finalizado! Pausa de 30 segundos antes de Agosto...");
  console.log("====================================\n");
  await new Promise(r => setTimeout(r, 30000));

  await runExhaustive(8, 2026, "Agosto");

  console.log("\n🎉 SINCRONIZAÇÃO TOTAL CONCLUÍDA!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

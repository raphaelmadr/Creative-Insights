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

  while (true) {
    try {
      await runExhaustive(7, 2026, "Julho");
      
      console.log("\n====================================");
      console.log("Julho finalizado! Pausa de 30 segundos antes de Agosto...");
      console.log("====================================\n");
      await new Promise(r => setTimeout(r, 30000));

      await runExhaustive(8, 2026, "Agosto");

      console.log("\n🎉 SINCRONIZAÇÃO TOTAL CONCLUÍDA!");
      break; // Sai do loop se terminar com sucesso
    } catch (err: any) {
      console.error("\n❌ ERRO CRÍTICO no processo de sincronização:", err.message || err);
      console.log("Tentando reiniciar todo o processo em 30 segundos para recuperar a conexão com o banco...");
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

main().finally(() => prisma.$disconnect());

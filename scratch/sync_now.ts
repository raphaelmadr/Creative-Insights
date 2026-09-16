import { config } from "dotenv";
config({ path: ".env.local" });
import { runMetaSync } from "../lib/meta-sync";
import prisma from "../lib/prisma";

async function main() {
  console.log("Iniciando sincronização para Setembro para atualizar as imagens expiradas...");
  let isComplete = false;
  let cycle = 1;
  while (!isComplete) {
    console.log(`\n--- Iniciando (Ciclo ${cycle}) ---`);
    const result = await runMetaSync("full", (msg, pct) => console.log(`[${pct}%] ${msg}`));
    
    if (result.reachedLimit) {
      console.log(`\n⚠️ Limite atingido no ciclo ${cycle}. Aguardando 5 segundos...`);
      await new Promise(r => setTimeout(r, 5000));
      cycle++;
    } else {
      console.log(`\n✅ Sincronização concluída em ${cycle} ciclos!`);
      isComplete = true;
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

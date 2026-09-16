import { config } from "dotenv";
config({ path: ".env.local" });
process.env.IS_LOCAL_CLI = "true";
import { runMetaSyncSql } from "./lib/meta-sync-sql";
import prisma from "./lib/prisma";

async function runExhaustive(month: number, year: number, monthName: string, outputFile: string) {
  let isComplete = false;
  let cycle = 1;
  while (!isComplete) {
    console.log(`\n--- Iniciando ${monthName} (Ciclo ${cycle}) ---`);
    const result = await runMetaSyncSql("full", (msg, pct) => console.log(`[${monthName} ${pct}%] ${msg}`), month, year, outputFile);
    
    if (result.reachedLimit) {
      console.log(`\n⚠️ Limite de tempo atingido para ${monthName} no ciclo ${cycle}.`);
      console.log("Aguardando 60 segundos para resetar o limite da Meta...");
      await new Promise(r => setTimeout(r, 60000));
      cycle++;
    } else {
      console.log(`\n✅ ${monthName} concluído completamente em ${cycle} ciclos!`);
      isComplete = true;
    }
  }
}

async function main() {
  console.log("Iniciando geração do arquivo SQL (exportacao_meta.sql)...");
  
  const outputFile = "exportacao_meta.sql";
  const fs = require('fs');
  // Initialize file ONLY if progress does not exist (meaning it's a fresh start)
  if (!fs.existsSync("progress_sql.json")) {
    fs.writeFileSync(outputFile, "-- Arquivo de exportação Meta Insights\n-- Gerado em " + new Date().toISOString() + "\n\n", "utf8");
    if (fs.existsSync("insercoes_por_dia.log")) {
      fs.unlinkSync("insercoes_por_dia.log");
    }
  } else {
    fs.appendFileSync(outputFile, "\n-- [Script Reiniciado] Retomando de onde parou...\n\n", "utf8");
  }
  while (true) {
    try {
      await runExhaustive(7, 2026, "Julho", outputFile);
      
      console.log("\n====================================");
      console.log("Julho finalizado! Pausa de 30 segundos antes de Agosto...");
      console.log("====================================\n");
      await new Promise(r => setTimeout(r, 30000));

      await runExhaustive(8, 2026, "Agosto", outputFile);

      console.log("\n🎉 GERAÇÃO DO ARQUIVO SQL CONCLUÍDA COM SUCESSO!");
      console.log("-> O arquivo exportacao_meta.sql está pronto para ser importado no Navicat.");
      break; // Sai do loop se terminar com sucesso
    } catch (err: any) {
      console.error("\n❌ ERRO no processo de sincronização:", err.message || err);
      console.log("Tentando reiniciar em 30 segundos...");
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

main().finally(() => prisma.$disconnect());

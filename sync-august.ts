import { config } from "dotenv";
config({ path: ".env.local" });
import { runMetaSync } from "./lib/meta-sync";
import prisma from "./lib/prisma";

async function main() {
  console.log("Iniciando resincronização de Agosto...");
  await runMetaSync("full", (msg, pct) => console.log(`[Agosto ${pct}%] ${msg}`), 8, 2026);
  console.log("Sincronização de Agosto concluída!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

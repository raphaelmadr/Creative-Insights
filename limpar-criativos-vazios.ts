/**
 * Remove criativos sem nenhum dia de veiculação registrado e que não estão no ar.
 *
 * A enumeração de anúncios da Meta devolve todo o histórico da conta, incluindo
 * arquivados de anos anteriores. Uma versão anterior do sync criava registro
 * para todos eles: milhares de linhas sem uma única métrica, invisíveis na
 * interface (que exige métricas no período) e que só pesavam em cada execução.
 *
 * Anúncios ACTIVE são preservados mesmo sem métrica — podem ainda não ter
 * entregue. Nenhuma métrica é apagada: só saem criativos que não têm nenhuma.
 *
 * Uso:  npx tsx limpar-criativos-vazios.ts [--apply]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import prisma from "./lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const orfaos = await prisma.adCreative.findMany({
    where: { metrics: { none: {} }, status: { not: "ACTIVE" } },
    select: { id: true, adName: true, platform: true, status: true },
  });

  const porStatus = orfaos.reduce<Record<string, number>>((acc, ad) => {
    const chave = `${ad.platform}/${ad.status ?? "SEM STATUS"}`;
    acc[chave] = (acc[chave] || 0) + 1;
    return acc;
  }, {});

  console.log(`Criativos sem nenhuma métrica e fora do ar: ${orfaos.length}`);
  Object.entries(porStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([chave, n]) => console.log(`  ${chave.padEnd(22)} ${n}`));

  const preservados = await prisma.adCreative.count({
    where: { metrics: { none: {} }, status: "ACTIVE" },
  });
  console.log(`\nPreservados (sem métrica, mas ATIVOS): ${preservados}`);

  if (!APPLY) {
    console.log("\nSimulação. Rode com --apply para remover.");
    return;
  }

  const { count } = await prisma.adCreative.deleteMany({
    where: { metrics: { none: {} }, status: { not: "ACTIVE" } },
  });
  console.log(`\nRemovidos: ${count}`);

  const restante = await prisma.adCreative.groupBy({ by: ["platform"], _count: true });
  console.log("Total por canal após limpeza:", restante.map(r => `${r.platform}=${r._count}`).join(" | "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

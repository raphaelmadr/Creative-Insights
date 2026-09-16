/**
 * Reconstrói a equipe a partir das contas Google, preservando as siglas.
 *
 * A equipe era digitada à mão no painel — nome, sigla e URL de avatar coladas
 * uma a uma — enquanto as mesmas pessoas já existiam no sistema com nome e foto
 * oficiais, vindos do login com Google. Este script passa a tratar a conta como
 * a fonte do nome e da foto, e deixa para o painel apenas o que só o time sabe:
 * a sigla que aparece no nome do anúncio.
 *
 * A SIGLA NÃO PODE MUDAR. Ela é o que liga 2.019 criativos já sincronizados aos
 * seus donos: `AdCreative.designer` guarda a sigla canônica como texto, e
 * `lib/designer-match` casa as siglas contra o nome do anúncio. Trocar "RM" por
 * outra coisa não renomeia nada — desatribui 1.132 peças. Por isso a
 * reconstrução recria exatamente as mesmas siglas que existiam.
 *
 * Também consolida o balde de "sem atribuição" num único criador visível. Hoje
 * 11.449 criativos têm `designer` nulo: eles não aparecem em lugar nenhum da
 * página de equipe, e o volume que escapa da convenção de nomenclatura fica
 * invisível justamente para quem precisaria corrigi-la.
 *
 * Uso:  npx tsx reconstruir-equipe.ts [--apply]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import prisma from "./lib/prisma";

const APPLY = process.argv.includes("--apply");

/** A sigla reservada do balde. Ver RESERVED_ACRONYMS em lib/designer-match. */
const FALLBACK_ACRONYM = "UNKNOWN";

/**
 * O desenho da equipe.
 *
 * `acronym` é copiado do que já existia — é a chave da atribuição e não se
 * inventa. `userEmail` é a conta Google, quando a pessoa tem uma.
 */
const EQUIPE: {
  acronym: string;
  fallbackName: string;
  userEmail: string | null;
  isFallback?: boolean;
}[] = [
  { acronym: "RM, RAPHAELMADUREIRA", fallbackName: "Raphael Madureira", userEmail: "raphael.madureira@allugator.com" },
  { acronym: "EZ, EZEQUIEL", fallbackName: "Ezequiel Oliveira", userEmail: "ezequiel.oliveira@allugator.com" },
  { acronym: "PP, PEDROPIMENTA", fallbackName: "Pedro Pimenta", userEmail: "pedropimenta@allugator.com" },
  // Sem conta corporativa: a sigla é mantida porque 141 criativos dependem dela.
  { acronym: "PT, PEDROTEIXEIRA", fallbackName: "Pedro Teixeira", userEmail: null },
  // Origem identificável, não uma pessoa — some do balde para não se confundir
  // com "não identificado".
  { acronym: "INFLUENCIADORES, INFLUS", fallbackName: "Influenciadores & Parcerias", userEmail: null },
  // O balde único: recebe tudo que não casa com sigla nenhuma, e aparece na
  // página de equipe para que o volume não atribuído seja visível.
  { acronym: FALLBACK_ACRONYM, fallbackName: "Sem atribuição", userEmail: null, isFallback: true },
];

async function main() {
  console.log(APPLY ? "MODO: aplicando\n" : "MODO: simulação (use --apply para gravar)\n");

  const users = await prisma.user.findMany({ select: { email: true, name: true, image: true } });
  const userByEmail = new Map(users.map((u) => [u.email, u]));

  // --- 1. O que será apagado ---
  const [relatorios, entregas, criadores] = await Promise.all([
    prisma.creatorMonthlyReport.count(),
    prisma.delivery.count(),
    prisma.creator.count(),
  ]);

  console.log("Será apagado:");
  console.log(`  CreatorMonthlyReport : ${relatorios}  (cache derivado, recalculado na leitura)`);
  console.log(`  Delivery             : ${entregas}  (volta do Slack na ressincronização)`);
  console.log(`  Creator              : ${criadores}  (recriados abaixo, com as MESMAS siglas)`);

  // --- 2. A equipe que será criada ---
  console.log("\nEquipe reconstruída:");
  for (const membro of EQUIPE) {
    const user = membro.userEmail ? userByEmail.get(membro.userEmail) : null;
    const nome = user?.name || membro.fallbackName;
    const origem = user ? "Google" : "manual";
    const foto = user?.image ? "sim" : "não";
    const marca = membro.isFallback ? "  ← balde" : "";
    console.log(`  ${membro.acronym.padEnd(26)} ${nome.padEnd(34)} ${origem.padEnd(7)} foto:${foto}${marca}`);
    if (membro.userEmail && !user) {
      console.log(`     AVISO: conta ${membro.userEmail} não existe — entra sem vínculo.`);
    }
  }

  const semSigla = await prisma.user.findMany({
    where: { email: { notIn: EQUIPE.map((m) => m.userEmail).filter((e): e is string => !!e) } },
    select: { email: true, name: true },
  });
  console.log(`\nContas Google ainda sem sigla (${semSigla.length}) — vinculáveis pelo painel:`);
  semSigla.forEach((u) => console.log(`  ${u.email}`));

  if (!APPLY) {
    console.log("\nRode com --apply para executar.");
    await prisma.$disconnect();
    return;
  }

  // --- 3. Executa ---
  // Ordem importa: relatórios e entregas apontam para criadores por chave
  // estrangeira e precisam sair antes deles.
  await prisma.creatorMonthlyReport.deleteMany({});
  await prisma.delivery.deleteMany({});
  await prisma.creator.deleteMany({});
  console.log("\napagados.");

  for (const membro of EQUIPE) {
    const user = membro.userEmail ? userByEmail.get(membro.userEmail) : null;
    await prisma.creator.create({
      data: {
        name: user?.name || membro.fallbackName,
        acronym: membro.acronym,
        avatarUrl: user?.image || null,
        userEmail: user ? membro.userEmail : null,
        active: true,
      },
    });
  }

  const criados = await prisma.creator.findMany({ select: { acronym: true, name: true, userEmail: true } });
  console.log(`\n${criados.length} criadores recriados:`);
  criados.forEach((c) => console.log(`  ${c.acronym.padEnd(26)} ${c.name.padEnd(34)} ${c.userEmail || "(sem conta)"}`));

  console.log("\nPróximo passo: sincronizar (Meta/TikTok reatribui os designers, Slack traz as entregas).");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("\nFalhou:", e);
  process.exitCode = 1;
});

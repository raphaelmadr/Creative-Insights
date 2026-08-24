import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const analises = await prisma.campaignAnalysis.findMany();
  console.log(analises.map(a => ({ id: a.id, title: a.title, resolved: a.resolved })));
}
main().catch(console.error).finally(() => prisma.$disconnect());

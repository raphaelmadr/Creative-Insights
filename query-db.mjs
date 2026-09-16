import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const creatives = await prisma.adCreative.findMany({ take: 5, where: { imageUrl: { not: null } } });
  console.log(creatives.map(c => c.imageUrl));
}
main().catch(console.error).finally(() => prisma.$disconnect());

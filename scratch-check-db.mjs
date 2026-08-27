import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ads = await prisma.adCreative.findMany({ take: 5 });
  console.log(ads.map(a => a.imageUrl));
}
main().finally(() => prisma.$disconnect());

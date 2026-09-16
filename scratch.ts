import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ads = await prisma.adCreative.findMany({ where: { designer: 'RM' }, take: 1 });
  console.log(ads);
}
main();

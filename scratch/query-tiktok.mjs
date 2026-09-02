import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const creatives = await prisma.adCreative.findMany({ 
    take: 5, 
    where: { platform: 'TIKTOK' } 
  });
  console.log(JSON.stringify(creatives, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());

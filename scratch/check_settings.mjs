import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const settings = await prisma.systemSettings.findFirst();
  console.log("Settings:", settings);
  const ads = await prisma.adCreative.findMany({ take: 10, select: { id: true, imageUrl: true } });
  console.log("Ads Sample:", ads);
}
main().catch(console.error).finally(() => prisma.$disconnect());

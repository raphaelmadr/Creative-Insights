import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const idToDelete = "cmt7fi5zx00000u4u83yqukgk";
  
  // Reassign any deliveries if they exist
  const deliveries = await prisma.delivery.findMany({ where: { creatorId: idToDelete } });
  if (deliveries.length > 0) {
    const firstUnknown = "cmsqazjpr00280uceww0gguh6";
    await prisma.delivery.updateMany({
      where: { creatorId: idToDelete },
      data: { creatorId: firstUnknown }
    });
    console.log(`Reassigned ${deliveries.length} deliveries.`);
  }

  await prisma.creator.delete({ where: { id: idToDelete } });
  console.log("Deleted duplicate UNKNOWN creator.");
}

main().catch(console.error).finally(() => prisma.$disconnect());

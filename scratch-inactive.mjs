import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const deliveries = await prisma.delivery.findMany({
    where: {
      date: {
        gte: new Date(2026, 7, 1),
        lte: new Date(2026, 8, 0, 23, 59, 59, 999)
      }
    },
    include: { creator: true }
  });

  let activeTotal = 0;
  let inactiveTotal = 0;

  for (const d of deliveries) {
    if (d.creator.active || d.creator.acronym === 'UNKNOWN') {
      activeTotal += d.pieces;
    } else {
      inactiveTotal += d.pieces;
      console.log(`Inactive creator piece: ${d.pieces} by ${d.creator.name}`);
    }
  }

  console.log(`Active total: ${activeTotal}, Inactive total: ${inactiveTotal}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

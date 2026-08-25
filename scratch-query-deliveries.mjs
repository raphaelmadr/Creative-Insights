import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const deliveries = await prisma.delivery.findMany({
    where: {
      date: {
        gte: new Date(2026, 7, 1),
        lte: new Date(2026, 8, 0, 23, 59, 59, 999)
      }
    }
  });

  let total = 0;
  deliveries.forEach(d => total += d.pieces);
  console.log(`Total deliveries in DB for August: ${deliveries.length}, pieces: ${total}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

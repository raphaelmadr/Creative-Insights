import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  const deliveries = await prisma.delivery.findMany({
    where: {
      date: {
        gte: new Date(2026, 7, 1),
        lte: new Date(2026, 8, 0, 23, 59, 59, 999)
      }
    }
  });

  console.log(`DB has ${deliveries.length} deliveries, total pieces: ${deliveries.reduce((acc, d) => acc + d.pieces, 0)}`);

  const startDate = new Date(2026, 7, 1);
  const endDate = new Date(2026, 8, 1);
  const oldest = Math.floor(startDate.getTime() / 1000).toString();
  const latest = Math.floor(endDate.getTime() / 1000).toString();

  const slackUrl = `https://slack.com/api/conversations.history?channel=${settings.slackChannelId}&limit=500&oldest=${oldest}&latest=${latest}`;
  const slackRes = await fetch(slackUrl, {
    headers: {
      "Authorization": `Bearer ${settings.slackBotToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const slackData = await slackRes.json();
  const messages = slackData.messages.filter((m) => m.type === "message" && m.text && !m.subtype);
  
  let slackTotal = 0;
  for (const msg of messages) {
    const piecesMatch = (msg.text || "").match(/(\d+)\s*pe[cç]as?/i);
    if (piecesMatch) {
      slackTotal += Number(piecesMatch[1]);
      
      const inDb = deliveries.find(d => d.slackTs === msg.ts);
      if (!inDb) {
        console.log(`MISSING IN DB: ${msg.ts} - Pieces: ${piecesMatch[1]}`);
      } else if (inDb.pieces !== Number(piecesMatch[1])) {
        console.log(`MISMATCH: ${msg.ts} - DB: ${inDb.pieces}, Slack: ${piecesMatch[1]}`);
      }
    }
  }

  console.log(`Slack matched total: ${slackTotal}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

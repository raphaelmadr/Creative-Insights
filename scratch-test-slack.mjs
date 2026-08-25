import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings?.slackBotToken || !settings?.slackChannelId) {
    console.log("No slack credentials");
    return;
  }

  const startDate = new Date(2026, 7, 1);
  const endDate = new Date(2026, 8, 1);
  const oldest = Math.floor(startDate.getTime() / 1000).toString();
  const latest = Math.floor(endDate.getTime() / 1000).toString();

  let slackUrl = `https://slack.com/api/conversations.history?channel=${settings.slackChannelId}&limit=300&oldest=${oldest}&latest=${latest}`;
  const slackRes = await fetch(slackUrl, {
    headers: {
      "Authorization": `Bearer ${settings.slackBotToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const slackData = await slackRes.json();
  if (!slackData.ok) {
    console.log("Slack Error:", slackData.error);
    return;
  }

  const messages = slackData.messages.filter((m) => m.type === "message" && m.text && !m.subtype);
  console.log(`Fetched ${messages.length} valid messages.`);

  let matched = 0;
  let piecesCount = 0;

  for (const msg of messages) {
    const text = msg.text || "";
    const piecesMatch = text.match(/(\d+)\s*pe[cç]as?/i);
    
    if (piecesMatch) {
      matched++;
      piecesCount += Number(piecesMatch[1]);
    } else {
      // Print messages that might have been missed (containing numbers)
      if (/\d+/.test(text) && text.length < 500) {
        console.log("MISSED (has number):", text.replace(/\n/g, "\\n"));
      }
    }
  }

  console.log(`Matched ${matched} messages, total pieces: ${piecesCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

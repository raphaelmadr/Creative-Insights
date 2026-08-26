import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  console.log('Tavily API Key in DB:', settings?.tavilyApiKey ? 'Set' : 'Not set', settings?.tavilyApiKey);
}
main().catch(console.error).finally(() => prisma.$disconnect());

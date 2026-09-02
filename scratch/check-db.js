const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  console.log("DB Google Client ID:", settings?.googleClientId);
  console.log("DB Google Client Secret:", settings?.googleClientSecret);
}

main().catch(console.error).finally(() => prisma.$disconnect());

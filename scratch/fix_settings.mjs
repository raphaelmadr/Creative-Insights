import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.systemSettings.update({
    where: { id: 1 },
    data: {
      googleClientId: "",
      googleClientSecret: "",
      cpanelUploadUrl: "",
      cpanelUploadSecret: ""
    }
  });
  console.log("Settings fixed!");
}
main().catch(console.error).finally(() => prisma.$disconnect());

import { config } from "dotenv";
config({ path: ".env.local" });
import prisma from "./lib/prisma";

async function main() {
  console.log("Buscando siglas...");
  const creators = await prisma.creator.findMany({ select: { acronym: true } });
  const validAcronyms: string[] = [];
  creators.forEach(c => {
    if (c.acronym.toUpperCase() !== "UNKNOWN") {
      const split = c.acronym.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      validAcronyms.push(...split);
    }
  });

  console.log(`Siglas válidas: ${validAcronyms.join(", ")}`);

  console.log("Buscando criativos sem designer ou com necessidade de atualização...");
  const ads = await prisma.adCreative.findMany();
  
  let updatedCount = 0;

  for (const ad of ads) {
    let designer: string | null = null;
    const adNameLower = ad.adName.toLowerCase();
    for (const ac of validAcronyms) {
      // Regex com suporte ao PONTO antes da sigla
      const regex = new RegExp(`(^|[-_ .])${ac}(?:[-._ ]|\\b|$)`, "i");
      if (regex.test(adNameLower)) {
        designer = ac.toUpperCase();
        break;
      }
    }

    if (designer && ad.designer !== designer) {
      await prisma.adCreative.update({
        where: { id: ad.id },
        data: { designer }
      });
      console.log(`Atualizado: ${ad.adName} -> ${designer}`);
      updatedCount++;
    }
  }

  console.log(`\nFinalizado! ${updatedCount} criativos atualizados com as siglas corretas.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

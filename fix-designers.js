const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDesigners() {
  const creators = await prisma.creator.findMany({ select: { acronym: true } });
  const validAcronyms = [];
  creators.forEach(c => {
    if (c.acronym.toUpperCase() !== "UNKNOWN") {
      const split = c.acronym.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(s => s.toLowerCase());
      validAcronyms.push(...split);
    }
  });

  console.log("Valid acronyms:", validAcronyms);

  const ads = await prisma.adCreative.findMany();
  let updated = 0;
  
  for (const ad of ads) {
    if (!ad.adName) continue;
    
    let designer = null;
    const adNameLower = ad.adName.toLowerCase();
    
    for (const ac of validAcronyms) {
      const regex = new RegExp(`([_\\- ]${ac}(?:[\\._ \\-]|\\b|$)|${ac}(?:\\.[a-z0-9]{3,4})?$)`, "i");
      if (regex.test(adNameLower)) {
        designer = ac.toUpperCase();
        break;
      }
    }
    
    if (designer !== ad.designer) {
      await prisma.adCreative.update({
        where: { id: ad.id },
        data: { designer }
      });
      updated++;
    }
  }
  
  console.log(`Fixed ${updated} ads.`);
}

fixDesigners().catch(console.error).finally(() => prisma.$disconnect());

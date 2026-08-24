const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testRoute() {
  const targetYear = 2026;
  const targetMonth = 8;
  const startDate = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
  
  const creators = await prisma.creator.findMany({ where: { active: true } });
  creators.push({ id: "UNKNOWN", name: "Outros / Não Identificado", acronym: "UNKNOWN", active: true, monthlyGoal: 0 });
  
  const creatorStats = {};
  creators.forEach(c => {
    creatorStats[c.id] = { creatorId: c.id, name: c.name, acronym: c.acronym, spend: 0 };
  });
  
  const metrics = await prisma.adDailyMetrics.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    include: { creative: true }
  });
  
  let unmapped = 0;
  metrics.forEach(metric => {
    const metricAcronym = metric.creative?.designer?.toUpperCase() || "";
    let targetCreatorId = "UNKNOWN";
    
    if (metricAcronym) {
      const matchedCreator = creators.find(c => {
        const possibleAcronyms = c.acronym.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(s => s.toUpperCase());
        return possibleAcronyms.includes(metricAcronym);
      });
      if (matchedCreator) targetCreatorId = matchedCreator.id;
    }
    
    if (targetCreatorId === "UNKNOWN") unmapped++;
    creatorStats[targetCreatorId].spend += metric.spend;
  });
  
  console.log("Unmapped metrics:", unmapped);
  console.log(Object.values(creatorStats).map(s => `${s.name}: ${s.spend}`));
}
testRoute().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const goal = await prisma.monthlyGoal.upsert({
      where: {
        month_year: { month: 9, year: 2026 },
      },
      update: {
        spendGoal: 1000,
        revenueGoal: 5000,
        cpaGoal: 50,
      },
      create: {
        month: 9,
        year: 2026,
        spendGoal: 1000,
        revenueGoal: 5000,
        cpaGoal: 50,
      },
    });
    console.log(goal);
  } catch(e) {
    console.error(e)
  }
}
main()

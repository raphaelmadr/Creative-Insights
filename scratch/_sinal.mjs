import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const since = new Date(Date.now() - 30*24*3600*1000);

// 1. Quantas linhas têm cada métrica preenchida?
const total = await p.adDailyMetrics.count({ where: { date: { gte: since }, impressions: { gt: 0 } } });
for (const f of ['videoViews','videoViews25p','videoViews50p','videoViews100p','likes','shares','comments','reach']) {
  const n = await p.adDailyMetrics.count({ where: { date: { gte: since }, impressions: { gt: 0 }, [f]: { gt: 0 } } });
  console.log(`  ${f.padEnd(16)} preenchido em ${n}/${total} linhas (${(n/total*100).toFixed(1)}%)`);
}

// 2. Plausibilidade: shares > clicks?
const w = await p.adDailyMetrics.findMany({
  where: { date: { gte: since }, impressions: { gt: 1000 } },
  select: { impressions: true, clicks: true, shares: true, likes: true, videoViews: true, videoViews25p: true },
  take: 5, orderBy: { spend: 'desc' },
});
console.log('\n  amostra (maiores gastos):');
w.forEach(r => console.log(`   impr ${r.impressions} | clicks ${r.clicks} | shares ${r.shares} | likes ${r.likes} | views ${r.videoViews} | p25 ${r.videoViews25p}`));

// 3. Funil inferível da nomenclatura?
const ads = await p.adCreative.findMany({ where: { platform: 'META' }, select: { campaignName: true } });
const pat = { COMPRA:0, LEAD:0, CONVERSAO:0, LANCAMENTO:0, RMKT:0, PERENE:0, outros:0 };
for (const a of ads) {
  const n = (a.campaignName||'').toUpperCase();
  let hit = false;
  if (/RMKT|REMARKETING|RETARGET/.test(n)) { pat.RMKT++; hit=true; }
  if (/COMPRA|VENDAS|PURCHASE/.test(n)) { pat.COMPRA++; hit=true; }
  if (/LEAD|CADASTRO|QUIZ/.test(n)) { pat.LEAD++; hit=true; }
  if (/CONVERS/.test(n)) { pat.CONVERSAO++; hit=true; }
  if (/LAN[CÇ]AMENTO|CAP\b/.test(n)) { pat.LANCAMENTO++; hit=true; }
  if (/PERENE/.test(n)) { pat.PERENE++; hit=true; }
  if (!hit) pat.outros++;
}
console.log('\n  sinais de funil na nomenclatura (de', ads.length, 'peças):', pat);
await p.$disconnect();

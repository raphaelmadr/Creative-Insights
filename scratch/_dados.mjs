import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const since = new Date(Date.now() - 30*24*3600*1000);
const agg = await p.adDailyMetrics.aggregate({
  where: { date: { gte: since } },
  _sum: { spend: true, impressions: true, videoViews: true, videoViews25p: true, videoViews100p: true, likes: true, comments: true, shares: true, reach: true, clicks: true, purchases: true },
  _count: true,
});
console.log('linhas de métrica (30d):', agg._count);
console.log(agg._sum);
// quantas peças de vídeo têm retenção preenchida
const rows = await p.adDailyMetrics.groupBy({
  by: ['adCreativeId'],
  where: { date: { gte: since }, spend: { gt: 0 } },
  _sum: { videoViews: true, videoViews100p: true, impressions: true, spend: true },
});
const comVideo = rows.filter(r => (r._sum.videoViews||0) > 0).length;
console.log(`peças com gasto em 30d: ${rows.length} | com videoViews > 0: ${comVideo}`);
// plataformas
const plat = await p.adCreative.groupBy({ by: ['platform','mediaType'], _count: true });
console.log('por plataforma/mídia:', plat.map(x => `${x.platform}/${x.mediaType}: ${x._count}`).join(' | '));
// nomes de campanha: dá para inferir funil?
const camps = await p.adCreative.findMany({ where: { platform: 'META' }, select: { campaignName: true }, distinct: ['campaignName'], take: 25 });
console.log('\namostra de campanhas:'); camps.forEach(c => console.log('  ', c.campaignName));
await p.$disconnect();

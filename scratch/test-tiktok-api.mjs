import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.systemSettings.findFirst();
  const accessToken = settings?.tiktokAccessToken;
  const advertiserId = settings?.tiktokAdvertiserId;

  if (!accessToken || !advertiserId) {
    console.log("No credentials found");
    return;
  }

  // Get one ad from tiktok
  const ad = await prisma.adCreative.findFirst({
    where: { platform: 'TIKTOK' }
  });

  console.log("Testing Ad:", ad.id);

  // Fetch ad info
  const adUrl = `https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=${advertiserId}&filtering=${encodeURIComponent(JSON.stringify({ ad_ids: [ad.id] }))}`;
  
  const res = await fetch(adUrl, {
    headers: {
      "Access-Token": accessToken
    }
  });
  
  const data = await res.json();
  console.log("Ad Info:", JSON.stringify(data, null, 2));

  if (data.data?.list?.[0]) {
    const info = data.data.list[0];
    if (info.video_id) {
      console.log("Found video_id:", info.video_id);
      const videoRes = await fetch(`https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=${advertiserId}&video_ids=${encodeURIComponent(JSON.stringify([info.video_id]))}`, {
        headers: { "Access-Token": accessToken }
      });
      const videoData = await videoRes.json();
      console.log("Video Data:", JSON.stringify(videoData, null, 2));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

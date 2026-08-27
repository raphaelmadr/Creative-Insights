import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTest() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const uploadUrl = settings?.cpanelUploadUrl;
  const uploadSecret = settings?.cpanelUploadSecret;

  console.log("Upload URL:", uploadUrl);
  console.log("Upload Secret:", uploadSecret);

  const fbImageUrl = "https://scontent.frao7-1.fna.fbcdn.net/v/t45.1600-4/622027414_122219083202284315_5886136945237310391_n.png?_nc_cat=107&ccb=1-7&_nc_ohc=_wlEhQfWB0wQ7kNvwGhxnLD&_nc_oc=AdqOYxOypDLpocYdRCi7pXHjKibLoqQYbYYGOYxyc1ES_W5J2FZoiRoK1uqWlYUNJ-c&_nc_zt=1&_nc_ht=scontent.frao7-1.fna&edm=AAwGEdEEAAAA&_nc_gid=r2SWQ6Q2s43ngMqKxNrFPw&_nc_tpa=Q5bMBQKMqE8fd-G7bqNv-cI0jQ2JHTQLgmfUgmXCChEGw0dDMQq2ozsfVL5D_NkWJKwYZZxgiyEW1Oxp&stp=c0.5000x0.5000f_dst-emg0_p64x64_q75_tt6&ur=52f3c4&_nc_sid=58080a&oh=00_AQFKGeC06FIM4leytv_lBZYNEh-CVwr_GTAdnRJ_rACs6Q&oe=6A951274";

  console.log("Fetching image from FB...");
  const imgRes = await fetch(fbImageUrl);
  console.log("FB Image fetched:", imgRes.status);
  
  if (imgRes.ok) {
    const blob = await imgRes.blob();
    const filename = `test-upload-${Date.now()}.jpg`;

    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("filename", filename);

    console.log("Uploading to cPanel...");
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${uploadSecret}`
      },
      body: formData
    });

    console.log("Upload Res status:", uploadRes.status);
    const text = await uploadRes.text();
    console.log("Upload Res text:", text);
  }
}

runTest().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function uploadTikTokImageToCPanel(url, settings, fallbackFilename) {
  try {
    const uploadUrl = settings?.cpanelUploadUrl || process.env.CPANEL_UPLOAD_URL;
    const uploadSecret = settings?.cpanelUploadSecret || process.env.CPANEL_UPLOAD_SECRET;

    console.log("Fetching image from TikTok:", url);
    const imgFetch = await fetch(url);
    console.log("Fetch ok?", imgFetch.ok, imgFetch.status);
    if (!imgFetch.ok) return url;
    
    const blob = await imgFetch.blob();
    const ext = blob.type.split('/')[1] || 'jpg';
    const filename = `${fallbackFilename}.${ext}`;

    if (uploadUrl && uploadSecret) {
      console.log("Uploading to CPanel");
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("filename", filename);

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${uploadSecret}` },
        body: formData
      });
      
      console.log("Upload res ok?", uploadRes.ok, uploadRes.status);

      if (uploadRes.ok) {
        const result = await uploadRes.json();
        console.log("Upload result:", result);
        if (result.success && result.url) return result.url;
      }
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("Uploading to Vercel Blob");
      const { put } = await import('@vercel/blob');
      const uploadResult = await put(`ad-images/${filename}`, blob, { access: 'public', addRandomSuffix: false });
      return uploadResult.url;
    }
  } catch (e) {
    console.error("Error uploading TikTok image:", e);
  }
  return url;
}

async function main() {
  const settings = await prisma.systemSettings.findFirst();
  const testUrl = "http://p16-common-sign.tiktokcdn.com/tos-alisg-p-0051c001-sg/oYEZGkW1ivOiZkBIA4vTAzA1bYl0AEbnZxUJU~tplv-noop.image?dr=18692&refresh_token=aa1485ae&x-expires=1788394831&x-signature=PxyI7uMz1fdbOMtsI2VnR8ltgWE%3D&t=9276707c&ps=14f1eb3e&shp=9e36835a&shcp=623c3a84&idc=my2&VideoID=v10033g50000cp35m4nog65oq9tt959g";
  
  const finalUrl = await uploadTikTokImageToCPanel(testUrl, settings, "tiktok-test");
  console.log("Final URL:", finalUrl);
}

main().catch(console.error).finally(() => prisma.$disconnect());

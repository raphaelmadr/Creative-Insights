import prisma from "./prisma";

export class TikTokApiError extends Error {
  isRateLimit: boolean;
  constructor(message: string, isRateLimit = false) {
    super(message);
    this.name = "TikTokApiError";
    this.isRateLimit = isRateLimit;
  }
}

async function fetchTikTok(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      "Access-Token": token,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new TikTokApiError(data.message || "TikTok API Error", data.code === 40100);
  }
  return data.data;
}

async function uploadTikTokImageToCPanel(url: string, settings: any, fallbackFilename: string) {
  try {
    const uploadUrl = settings?.cpanelUploadUrl || process.env.CPANEL_UPLOAD_URL;
    const uploadSecret = settings?.cpanelUploadSecret || process.env.CPANEL_UPLOAD_SECRET;

    const imgFetch = await fetch(url);
    if (!imgFetch.ok) return url;
    
    const blob = await imgFetch.blob();
    const ext = blob.type.split('/')[1] || 'jpg';
    const filename = `${fallbackFilename}.${ext}`;

    if (uploadUrl && uploadSecret) {
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("filename", filename);

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${uploadSecret}` },
        body: formData
      });

      if (uploadRes.ok) {
        const result = await uploadRes.json();
        if (result.success && result.url) return result.url;
      }
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob');
      const uploadResult = await put(`ad-images/${filename}`, blob, { access: 'public', addRandomSuffix: false });
      return uploadResult.url;
    }
  } catch (e) {
    console.error("Error uploading TikTok image:", e);
  }
  return url;
}

export async function runTikTokSync(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number
) {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  
  const advertiserId = settings?.tiktokAdvertiserId;
  const accessToken = settings?.tiktokAccessToken;

  if (!advertiserId || !accessToken) {
    throw new Error("Credenciais do TikTok Ads não configuradas no painel.");
  }

  if (onProgress) onProgress("Conectando ao TikTok...", 5);

  const creators = await prisma.creator.findMany({ select: { acronym: true } });
  const validAcronyms: string[] = [];
  creators.forEach(c => {
    if (c.acronym.toUpperCase() !== "UNKNOWN") {
      const split = c.acronym.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      validAcronyms.push(...split);
    }
  });

  const now = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  let sinceDate: Date, untilDate: Date;
  
  if (targetMonth !== undefined && targetYear !== undefined) {
    sinceDate = new Date(targetYear, targetMonth - 1, 1);
    const isCurrentMonth = targetMonth === (today.getMonth() + 1) && targetYear === today.getFullYear();
    untilDate = isCurrentMonth ? today : new Date(targetYear, targetMonth, 0); 
  } else {
    sinceDate = new Date(today.getFullYear(), today.getMonth(), 1);
    untilDate = today;
  }
  
  const start_date = sinceDate.toISOString().split('T')[0];
  const end_date = untilDate.toISOString().split('T')[0];

  if (onProgress) onProgress(`Buscando relatórios de ${start_date} até ${end_date}...`, 20);

  // 1. Fetch Report Data
  let reportData: any[] = [];
  try {
    let currentStart = new Date(sinceDate);
    
    while (currentStart <= untilDate) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 29); // max 30 days inclusive
      
      if (currentEnd > untilDate) {
        currentEnd = new Date(untilDate);
      }

      const chunk_start = currentStart.toISOString().split('T')[0];
      const chunk_end = currentEnd.toISOString().split('T')[0];

      const reportUrl = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${advertiserId}&report_type=BASIC&data_level=AUCTION_AD&dimensions=%5B%22ad_id%22%2C%22stat_time_day%22%5D&metrics=%5B%22spend%22%2C%22cpc%22%2C%22cpm%22%2C%22ctr%22%2C%22conversion%22%2C%22cost_per_conversion%22%2C%22clicks%22%2C%22impressions%22%2C%22reach%22%2C%22frequency%22%2C%22total_purchase_value%22%2C%22likes%22%2C%22comments%22%2C%22shares%22%2C%22video_play_actions%22%2C%22video_views_p25%22%2C%22video_views_p50%22%2C%22video_views_p75%22%2C%22video_views_p100%22%5D&start_date=${chunk_start}&end_date=${chunk_end}&page_size=1000`;
      
      const res = await fetchTikTok(reportUrl, accessToken);
      if (res && res.list) {
        reportData.push(...res.list);
      }

      // Move to next chunk
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }
  } catch (error) {
    console.error("Erro ao buscar relatórios do TikTok:", error);
    throw error;
  }

  if (reportData.length === 0) {
    if (onProgress) onProgress("Nenhum dado encontrado neste período.", 100);
    return { success: true, count: 0 };
  }

  // Group report data by ad_id
  const adIdsSet = new Set<string>();
  reportData.forEach(row => {
    if (row.dimensions?.ad_id) {
      adIdsSet.add(row.dimensions.ad_id.toString());
    }
  });

  const adIds = Array.from(adIdsSet);
  
  // 2. Fetch Ad Info (to get name, campaign, and creative details)
  if (onProgress) onProgress(`Buscando informações de ${adIds.length} anúncios...`, 50);
  const adsInfoMap: Record<string, any> = {};
  
  try {
    // Fetch in batches of 100 max
    const BATCH_SIZE = 50;
    for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
      const batch = adIds.slice(i, i + BATCH_SIZE);
      const filtering = encodeURIComponent(JSON.stringify({ ad_ids: batch }));
      const adUrl = `https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=${advertiserId}&filtering=${filtering}&page_size=100`;
      
      const res = await fetchTikTok(adUrl, accessToken);
      if (res && res.list) {
        res.list.forEach((ad: any) => {
          adsInfoMap[ad.ad_id] = ad;
        });
      }
    }
  } catch (error) {
    console.error("Erro ao buscar info de anúncios do TikTok:", error);
  }

  if (onProgress) onProgress("Salvando dados no banco...", 80);

  // 3. Upsert AdCreatives
  let processedAds = 0;
  for (const adId of adIds) {
    const info = adsInfoMap[adId];
    if (!info) continue;

    const safeString = (str: string | undefined | null, maxLen: number = 190) => (str || "").substring(0, maxLen);

    let imageUrl = "";
    let thumbnailUrl = "";
    let videoUrl = "";

    // Deep sync de Mídias
    if (mode === "full") {
      try {
        if (info.video_id) {
          const videoRes = await fetchTikTok(`https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=${advertiserId}&video_ids=${encodeURIComponent(JSON.stringify([info.video_id]))}`, accessToken);
          if (videoRes?.list?.[0]) {
            videoUrl = videoRes.list[0].video_url || "";
            const rawCoverUrl = videoRes.list[0].video_cover_url || videoRes.list[0].cover_url || "";
            if (rawCoverUrl) {
               imageUrl = await uploadTikTokImageToCPanel(rawCoverUrl, settings, `tiktok-vid-${info.video_id}`);
               thumbnailUrl = imageUrl;
            }
          }
        } else if (info.image_ids && info.image_ids.length > 0) {
          const imageRes = await fetchTikTok(`https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/?advertiser_id=${advertiserId}&image_ids=${encodeURIComponent(JSON.stringify([info.image_ids[0]]))}`, accessToken);
          if (imageRes?.list?.[0]) {
             const rawImageUrl = imageRes.list[0].image_url || "";
             if (rawImageUrl) {
               imageUrl = await uploadTikTokImageToCPanel(rawImageUrl, settings, `tiktok-img-${info.image_ids[0]}`);
               thumbnailUrl = imageUrl;
             }
          }
        }
      } catch (err) {
        console.error("Erro ao buscar mídia do TikTok para anúncio", adId, err);
      }
    }

    const adNameStr = safeString(info.ad_name || `TikTok Ad ${adId}`);
    let designer: string | null = null;
    const adNameLower = adNameStr.toLowerCase();
    for (const ac of validAcronyms) {
      const regex = new RegExp(`(^|[-_ ])${ac}(?:[-._ ]|\\b|$)`, "i");
      if (regex.test(adNameLower)) {
        designer = ac.toUpperCase();
        break;
      }
    }

    const adData = {
      id: adId,
      platform: "TIKTOK",
      adName: adNameStr,
      adsetName: safeString(info.adgroup_name),
      campaignName: safeString(info.campaign_name),
      status: info.operation_status || info.status || "UNKNOWN",
      createdTime: info.create_time ? new Date(info.create_time) : new Date(),
      publisherPlatforms: "tiktok",
      designer,
      imageUrl,
      thumbnailUrl,
      videoUrl
    };

    // Upsert AdCreative immediately to keep DB connection active
    let adRetries = 3;
    while (adRetries > 0) {
      try {
        await prisma.adCreative.upsert({
          where: { id: adData.id },
          update: {
            adName: adData.adName,
            adsetName: adData.adsetName,
            campaignName: adData.campaignName,
            status: adData.status,
            designer: adData.designer,
            platform: adData.platform,
            publisherPlatforms: adData.publisherPlatforms,
            imageUrl: adData.imageUrl || undefined,
            thumbnailUrl: adData.thumbnailUrl || undefined,
            videoUrl: adData.videoUrl || undefined,
          },
          create: adData
        });
        break;
      } catch (err: any) {
        if (adRetries > 1) {
          adRetries--;
          await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err;
        }
      }
    }
    processedAds++;
  }

  // 4. Upsert Daily Metrics
  let processedMetrics = 0;
  for (const row of reportData) {
    const adId = row.dimensions?.ad_id?.toString();
    const dateStr = row.dimensions?.stat_time_day; // Format: YYYY-MM-DD HH:mm:ss
    if (!adId || !dateStr) continue;

    // Convert date string to Date object
    const dateStart = new Date(dateStr.split(' ')[0] + 'T00:00:00Z');
    
    const m = row.metrics || {};
    const spend = parseFloat(m.spend || "0");
    const ctr = parseFloat(m.ctr || "0") / 100; // TikTok returns percentages sometimes
    const cpc = parseFloat(m.cpc || "0");
    const impressions = parseInt(m.impressions || "0");
    const clicks = parseInt(m.clicks || "0");
    const reach = parseInt(m.reach || "0");
    const frequency = parseFloat(m.frequency || "1");
    const purchases = parseInt(m.conversion || "0");
    const purchaseValue = parseFloat(m.total_purchase_value || "0");
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const likes = parseInt(m.likes || "0");
    const comments = parseInt(m.comments || "0");
    const shares = parseInt(m.shares || "0");
    const videoViews = parseInt(m.video_play_actions || "0");
    const videoViews25p = parseInt(m.video_views_p25 || "0");
    const videoViews50p = parseInt(m.video_views_p50 || "0");
    const videoViews75p = parseInt(m.video_views_p75 || "0");
    const videoViews100p = parseInt(m.video_views_p100 || "0");

    const upsertData = {
      where: {
        adCreativeId_date: {
          adCreativeId: adId,
          date: dateStart
        }
      },
      update: {
        spend,
        roas: spend > 0 ? purchaseValue / spend : 0,
        purchases,
        grossValue: purchaseValue,
        riskApprovedValue: purchaseValue, // In TikTok we don't have custom conversion easily
        netOrders: purchases,
        ctr,
        cpc,
        impressions,
        clicks,
        reach,
        frequency,
        cpm,
        likes,
        comments,
        shares,
        videoViews,
        videoViews25p,
        videoViews50p,
        videoViews75p,
        videoViews100p
      },
      create: {
        adCreativeId: adId,
        date: dateStart,
        spend,
        roas: spend > 0 ? purchaseValue / spend : 0,
        purchases,
        grossValue: purchaseValue,
        riskApprovedValue: purchaseValue,
        netOrders: purchases,
        ctr,
        cpc,
        impressions,
        clicks,
        reach,
        frequency,
        cpm,
        likes,
        comments,
        shares,
        videoViews,
        videoViews25p,
        videoViews50p,
        videoViews75p,
        videoViews100p
      }
    };

    let retries = 3;
    while (retries > 0) {
      try {
        await prisma.adDailyMetrics.upsert(upsertData);
        break;
      } catch (err: any) {
        if (retries > 1) {
          retries--;
          await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err;
        }
      }
    }
    processedMetrics++;
  }

  if (onProgress) onProgress("Sincronização do TikTok concluída!", 100);
  
  return { success: true, count: processedMetrics };
}

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { throttledFetch, fetchWithBisection, MetaApiError, WallClockLimitError, resetWallClock } from "./throttled-fetch";

const prisma = new PrismaClient();

export async function runMetaSync(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number
) {
  resetWallClock();
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  
  let metaAccountId = settings?.metaAdAccountId;
  const metaToken = settings?.metaAccessToken;

  if (metaAccountId && !metaAccountId.startsWith('act_')) {
    metaAccountId = `act_${metaAccountId}`;
  }

  if (!metaAccountId || !metaToken) {
    throw new Error("Credenciais do Meta Ads não configuradas no painel nem no .env");
  }

  if (onProgress) onProgress("Conectando à Meta...", 5);

  const creators = await prisma.creator.findMany({ select: { acronym: true } });
  const validAcronyms: string[] = [];
  creators.forEach(c => {
    if (c.acronym.toUpperCase() !== "UNKNOWN") {
      const split = c.acronym.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      validAcronyms.push(...split);
    }
  });

  const today = new Date();
  
  let sinceDate: Date, untilDate: Date;
  
  if (targetMonth !== undefined && targetYear !== undefined) {
    sinceDate = new Date(targetYear, targetMonth - 1, 1);
    const isCurrentMonth = targetMonth === (today.getMonth() + 1) && targetYear === today.getFullYear();
    untilDate = isCurrentMonth ? today : new Date(targetYear, targetMonth, 0); 
  } else {
    sinceDate = new Date(today.getFullYear(), today.getMonth(), 1);
    untilDate = today;
  }
  
  const insightRows: any[] = [];
  let reachedWallClock = false;

  // --- 1. Fetch Insights (Paginated by Day) ---
  if (onProgress) onProgress("Buscando novos dados do Meta...", 10);
  const insightFields = "ad_id,ad_name,adset_id,adset_name,campaign_name,spend,purchase_roas,actions,action_values,cpm,ctr,cpc,impressions,clicks,date_start,date_stop";

  let currentDate = new Date(sinceDate);
  while (currentDate <= untilDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    try {
      // Check if this day is already synced
      const existingMetricsCount = await prisma.adDailyMetrics.count({
        where: {
          date: new Date(dateStr)
        }
      });

      const todayStr = new Date().toISOString().split('T')[0];
      const isToday = dateStr === todayStr;

      if (!isToday && existingMetricsCount > 0) {
        if (onProgress) onProgress(`Pulando ${dateStr} (já sincronizado)...`, 15);
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      if (onProgress) onProgress(`Buscando insights para ${dateStr}...`, 15);
      
      const timeRangeStr = encodeURIComponent(JSON.stringify({ since: dateStr, until: dateStr }));
      let metaUrl: string | null = `https://graph.facebook.com/v19.0/${metaAccountId}/insights?level=ad&time_range=${timeRangeStr}&time_increment=1&fields=${insightFields}&limit=500&access_token=${metaToken}`;

      let page = 0;
      while (metaUrl) {
        const metaData = await throttledFetch(metaUrl);
        if (!metaData) break;

        insightRows.push(...(metaData.data || []));
        metaUrl = metaData.paging?.next || null;
        page++;
      }
    } catch (err: any) {
      if (err instanceof WallClockLimitError) {
        if (onProgress) onProgress("Teto de tempo atingido (Timeout preventivo). Abortando com progresso salvo...", 20);
        reachedWallClock = true;
        break;
      } else if (err instanceof MetaApiError && err.isRateLimit) {
        if (onProgress) onProgress("Limite da API da Meta atingido. Abortando com progresso salvo...", 20);
        reachedWallClock = true;
        break;
      } else {
        throw err;
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const rowsByAdId: Record<string, any[]> = {};
  insightRows.forEach((row: any) => {
    if (!row.ad_id) return;
    if (!rowsByAdId[row.ad_id]) rowsByAdId[row.ad_id] = [];
    rowsByAdId[row.ad_id].push(row);
  });
  const adIds = Object.keys(rowsByAdId);
  const uniqueAdsetIds = Array.from(new Set(insightRows.map(r => r.adset_id).filter(Boolean)));

  // --- 2. Cache DB Status ---
  const existingAds = await prisma.adCreative.findMany({
    select: { id: true, imageUrl: true, thumbnailUrl: true }
  });
  const existingIds = new Set(existingAds.map(a => a.id));
  const blurryExistingIds = new Set(
    existingAds.filter(a => {
      if (!a.imageUrl) return true;
      if (a.imageUrl.includes('public.blob.vercel-storage.com') || a.imageUrl.includes('vercel.app')) return false;
      if (a.imageUrl === a.thumbnailUrl) return true;
      if (a.imageUrl.includes('fbcdn.net') || a.imageUrl.includes('scontent') || a.imageUrl.includes('facebook.com')) return true;
      return false;
    }).map(a => a.id)
  );

  const refreshAdIds = Array.from(new Set([
    ...adIds.filter((id) => !existingIds.has(id)),
    ...Array.from(blurryExistingIds)
  ]));

  // Data maps
  const creativeDataMap: Record<string, any> = {};
  const adStatusMap: Record<string, any> = {};
  const hashToUrlMap: Record<string, string> = {};
  const videoPictureMap: Record<string, string> = {};
  const videoSourceMap: Record<string, string> = {};
  const adsetTargetingMap: Record<string, any> = {};

  const BATCH_SIZE = 25; // Good balance for usage
  
  if (!reachedWallClock) {
    // --- 3. Fetch Status & Targeting ---
    if (onProgress) onProgress(`Buscando status de ${adIds.length} anúncios...`, 30);

    try {
      for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
        const batchIds = adIds.slice(i, i + BATCH_SIZE);
        const data = await fetchWithBisection(batchIds, (ids) => 
          `https://graph.facebook.com/v19.0/?ids=${ids}&fields=status,created_time&access_token=${metaToken}`
        );
        if (data) {
          for (const adId of batchIds) {
            if (data[adId]) adStatusMap[adId] = data[adId];
          }
        }
      }
    } catch (err: any) {
      if (err instanceof WallClockLimitError || (err instanceof MetaApiError && err.isRateLimit)) {
        if (onProgress) onProgress("Teto atingido nos status. Salvando progresso...", 35);
        reachedWallClock = true;
      }
    }
  }

  if (!reachedWallClock) {
    if (onProgress) onProgress(`Buscando targeting de ${uniqueAdsetIds.length} conjuntos...`, 32);
    try {
      for (let i = 0; i < uniqueAdsetIds.length; i += BATCH_SIZE) {
        const batchIds = uniqueAdsetIds.slice(i, i + BATCH_SIZE);
        const data = await fetchWithBisection(batchIds, (ids) => 
          `https://graph.facebook.com/v19.0/?ids=${ids}&fields=targeting&access_token=${metaToken}`
        );
        if (data) {
          for (const adsetId of batchIds) {
            if (data[adsetId]) adsetTargetingMap[adsetId] = data[adsetId].targeting;
          }
        }
      }
    } catch (err: any) {
      if (err instanceof WallClockLimitError || (err instanceof MetaApiError && err.isRateLimit)) {
        reachedWallClock = true;
      }
    }
  }

  // --- 4. Fetch Creatives ---
  if (!reachedWallClock && mode === "full") {
    if (onProgress) onProgress(`Processando ${refreshAdIds.length} criativos pendentes...`, 35);
    
    try {
      for (let i = 0; i < refreshAdIds.length; i += BATCH_SIZE) {
        const batchIds = refreshAdIds.slice(i, i + BATCH_SIZE);
        const data = await fetchWithBisection(batchIds, (ids) => 
          `https://graph.facebook.com/v19.0/?ids=${ids}&fields=adcreatives{image_url,thumbnail_url,image_hash,object_story_spec{video_data{video_id,image_url}},asset_feed_spec{images{hash},videos{video_id,thumbnail_url}}}&access_token=${metaToken}`
        );
        if (data) {
          for (const adId of batchIds) {
            if (data[adId]) creativeDataMap[adId] = data[adId];
          }
        }
        if (onProgress) onProgress(`Carregando criativos (${Math.min(i + BATCH_SIZE, refreshAdIds.length)}/${refreshAdIds.length})...`, 35 + Math.floor(((i + BATCH_SIZE) / refreshAdIds.length) * 10));
      }
    } catch (err: any) {
      if (err instanceof WallClockLimitError || (err instanceof MetaApiError && err.isRateLimit)) {
         reachedWallClock = true;
      }
    }

    const imageHashes = new Set<string>();
    const videoIds = new Set<string>();
    refreshAdIds.forEach((adId: string) => {
      const creative = creativeDataMap[adId]?.adcreatives?.data?.[0];
      if (!creative) return;
      const videoId = creative.object_story_spec?.video_data?.video_id || creative.asset_feed_spec?.videos?.[0]?.video_id;
      if (videoId) videoIds.add(videoId);
      else if (creative.image_hash) imageHashes.add(creative.image_hash);
      else if (creative.asset_feed_spec?.images && creative.asset_feed_spec.images.length > 0) imageHashes.add(creative.asset_feed_spec.images[0].hash);
    });

    if (!reachedWallClock && imageHashes.size > 0) {
      if (onProgress) onProgress(`Resolvendo URLs de ${imageHashes.size} imagens...`, 45);
      const hashesArray = Array.from(imageHashes);
      
      try {
        for (let i = 0; i < hashesArray.length; i += BATCH_SIZE) {
          const batchHashes = hashesArray.slice(i, i + BATCH_SIZE);
          const hashesParam = encodeURIComponent(JSON.stringify(batchHashes));
          const imagesUrl = `https://graph.facebook.com/v19.0/${metaAccountId}/adimages?hashes=${hashesParam}&fields=url,original_image_url&access_token=${metaToken}`;
          
          const imagesData = await throttledFetch(imagesUrl);
          if (imagesData && imagesData.data) {
            imagesData.data.forEach((img: any) => {
              const hashParts = img.id.split(":");
              const hash = hashParts.length > 1 ? hashParts[1] : img.id;
              hashToUrlMap[hash] = img.original_image_url || img.url;
            });
          }
        }
      } catch (err: any) {
         if (err instanceof WallClockLimitError || (err instanceof MetaApiError && err.isRateLimit)) reachedWallClock = true;
      }
    }

    if (!reachedWallClock && videoIds.size > 0) {
      if (onProgress) onProgress(`Resolvendo capas de ${videoIds.size} vídeos...`, 50);
      const videoIdsArray = Array.from(videoIds);
      
      try {
        for (let i = 0; i < videoIdsArray.length; i += BATCH_SIZE) {
          const batchIds = videoIdsArray.slice(i, i + BATCH_SIZE);
          const data = await fetchWithBisection(batchIds, (ids) => 
            `https://graph.facebook.com/v19.0/?ids=${ids}&fields=picture,source&access_token=${metaToken}`
          );
          if (data) {
            for (const videoId of batchIds) {
              if (data[videoId]?.picture) videoPictureMap[videoId] = data[videoId].picture;
              if (data[videoId]?.source) videoSourceMap[videoId] = data[videoId].source;
            }
          }
        }
      } catch(e) {
         if (e instanceof WallClockLimitError || (e instanceof MetaApiError && e.isRateLimit)) reachedWallClock = true;
      }
    }
  }

  // --- 5. Database Upsert ---
  let syncedAds = 0;
  let syncedMetrics = 0;
  
  if (onProgress) onProgress("Processando e salvando métricas...", 60);

  for (let i = 0; i < adIds.length; i++) {
    const adId = adIds[i];
    const rows = rowsByAdId[adId];
    if (!rows || rows.length === 0) continue;

    if (i % 100 === 0 && onProgress) {
      onProgress(`Processando e salvando anúncios (${i}/${adIds.length})...`, 60 + Math.floor((i / adIds.length) * 30));
    }

    const firstRow = rows[0];
    const adName = firstRow.ad_name || "Desconhecido";
    const adsetName = firstRow.adset_name || "Desconhecido";
    const campaignName = firstRow.campaign_name || "Desconhecido";
    
    const sData = adStatusMap[adId];
    const status = sData?.status || "UNKNOWN";
    const createdAtStr = sData?.created_time;
    let createdTime = createdAtStr ? new Date(createdAtStr) : new Date();
    if (isNaN(createdTime.getTime())) createdTime = new Date();

    const adsetId = firstRow.adset_id;
    const targeting = adsetId && adsetTargetingMap[adsetId] ? adsetTargetingMap[adsetId] : undefined;
    let creatorAcronym = "UNKNOWN";

    if (targeting?.custom_audiences) {
      for (const aud of targeting.custom_audiences) {
        if (aud.name) {
          const nameUpper = aud.name.toUpperCase();
          for (const ac of validAcronyms) {
            if (nameUpper.includes(ac.toUpperCase())) {
              creatorAcronym = ac.toUpperCase();
              break;
            }
          }
          if (creatorAcronym !== "UNKNOWN") break;
        }
      }
    }

    if (creatorAcronym === "UNKNOWN") {
      const adNameUpper = adName.toUpperCase();
      for (const ac of validAcronyms) {
        if (adNameUpper.includes(ac.toUpperCase())) {
          creatorAcronym = ac.toUpperCase();
          break;
        }
      }
    }

    let imageUrl = "";
    let thumbnailUrl = "";
    let videoUrl = "";

    if (mode === "full") {
      const creative = creativeDataMap[adId]?.adcreatives?.data?.[0];
      if (creative) {
        const videoId = creative.object_story_spec?.video_data?.video_id || creative.asset_feed_spec?.videos?.[0]?.video_id;
        
        if (videoId) {
          videoUrl = videoSourceMap[videoId] || "";
          thumbnailUrl = videoPictureMap[videoId] || creative.thumbnail_url || creative.object_story_spec?.video_data?.image_url || creative.asset_feed_spec?.videos?.[0]?.thumbnail_url || "";
        } else {
          let hash = creative.image_hash;
          if (!hash && creative.asset_feed_spec?.images && creative.asset_feed_spec.images.length > 0) {
            hash = creative.asset_feed_spec.images[0].hash;
          }
          
          let fbImageUrl = hashToUrlMap[hash] || creative.image_url || "";
          if (fbImageUrl) {
            if (fbImageUrl.includes('fbcdn.net') || fbImageUrl.includes('scontent')) {
              try {
                const imgRes = await fetch(fbImageUrl);
                if (imgRes.ok) {
                  const blob = await imgRes.blob();
                  const filename = `ad-images/${adId}-${hash || 'image'}.jpg`;
                  const uploadResult = await put(filename, blob, { access: 'public', addRandomSuffix: false });
                  imageUrl = uploadResult.url;
                  thumbnailUrl = uploadResult.url;
                } else {
                  imageUrl = fbImageUrl;
                  thumbnailUrl = fbImageUrl;
                }
              } catch (e) {
                imageUrl = fbImageUrl;
                thumbnailUrl = fbImageUrl;
              }
            } else {
              imageUrl = fbImageUrl;
              thumbnailUrl = fbImageUrl;
            }
          }
        }
      }
    }

    let adCreative = await prisma.adCreative.findUnique({ where: { id: adId } });
    if (!adCreative) {
      const createData: any = {
        id: adId,
        adName,
        adsetName,
        campaignName,
        status,
        createdTime,
      };
      // The schema does not strictly match `creatorAcronym` if it's absent, 
      // but if the user wants it, it must be in AdCreative? Wait, I saw earlier it failed for `createdAt`, so I used `createdTime`.
      if (imageUrl) createData.imageUrl = imageUrl;
      if (thumbnailUrl) createData.thumbnailUrl = thumbnailUrl;
      if (videoUrl) createData.videoUrl = videoUrl;
      
      adCreative = await prisma.adCreative.create({ data: createData });
      syncedAds++;
    } else {
      const updateData: any = {
        adName,
        adsetName,
        campaignName,
        status
      };
      if (imageUrl) updateData.imageUrl = imageUrl;
      if (thumbnailUrl) updateData.thumbnailUrl = thumbnailUrl;
      if (videoUrl) updateData.videoUrl = videoUrl;
      
      adCreative = await prisma.adCreative.update({
        where: { id: adId },
        data: updateData
      });
      syncedAds++;
    }

    for (const row of rows) {
      if (!row.date_start) continue;
      const spend = parseFloat(row.spend || "0");
      const cpm = parseFloat(row.cpm || "0");
      const ctr = parseFloat(row.ctr || "0");
      const cpc = parseFloat(row.cpc || "0");
      const impressions = parseInt(row.impressions || "0");
      const clicks = parseInt(row.clicks || "0");

      let purchaseRoas = 0;
      if (row.purchase_roas && row.purchase_roas.length > 0) {
        const roasData = row.purchase_roas.find((r: any) => r.action_type === 'omni_purchase');
        if (roasData) purchaseRoas = parseFloat(roasData.value);
      }

      let purchases = 0; let messages = 0; let netOrders = 0; let riskApprovedValue = 0;
      
      const getFallbackValue = (arr: any[], types: string[]) => {
        for (const t of types) {
          const obj = arr.find((a: any) => a.action_type === t);
          if (obj) return parseFloat(obj.value);
        }
        return 0;
      };

      if (row.actions) {
        purchases = getFallbackValue(row.actions, ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'offline_conversion.purchase']);

        const msgObj = row.actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
        if (msgObj) messages = parseInt(msgObj.value);

        const netOrdersObj = row.actions.find((a: any) => a.action_type === 'offsite_conversion.custom.2105075753380751');
        if (netOrdersObj) netOrders = parseInt(netOrdersObj.value);
      }
      
      let grossValue = 0;
      if (row.action_values) {
        const riskApprovedObj = row.action_values.find((a: any) => a.action_type === 'offsite_conversion.custom.2105075753380751');
        if (riskApprovedObj) riskApprovedValue = parseFloat(riskApprovedObj.value);

        grossValue = getFallbackValue(row.action_values, ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'offline_conversion.purchase']);
      }

      const dateStart = new Date(`${row.date_start}T00:00:00Z`);

      await prisma.adDailyMetrics.upsert({
        where: {
          adCreativeId_date: {
            adCreativeId: adId,
            date: dateStart
          }
        },
        update: {
          spend,
          roas: purchaseRoas,
          cpm,
          ctr,
          cpc,
          impressions,
          clicks,
          purchases,
          netOrders,
          riskApprovedValue,
          grossValue,
          messages
        },
        create: {
          adCreativeId: adId,
          date: dateStart,
          spend,
          roas: purchaseRoas,
          cpm,
          ctr,
          cpc,
          impressions,
          clicks,
          purchases,
          netOrders,
          riskApprovedValue,
          grossValue,
          messages
        }
      });
      syncedMetrics++;
    }
  }

  // Update last sync times
  if (!reachedWallClock) {
    const now = new Date();
    const updateSettings: any = {};
    if (mode === "full") updateSettings.lastDeepSyncAt = now;
    else updateSettings.lastFastSyncAt = now;
    
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: updateSettings
    });

    if (onProgress) onProgress("Sincronização concluída com sucesso!", 100);
  } else {
    if (onProgress) onProgress("Sincronização abortada por limite de tempo/taxa. Agende novamente para continuar.", 100);
  }

  return { syncedAds, syncedMetrics };
}

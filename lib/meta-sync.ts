import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";

const prisma = new PrismaClient();

export async function runMetaSync(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number
) {
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
      const split = c.acronym.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(s => s.toLowerCase());
      validAcronyms.push(...split);
    }
  });

  const today = new Date();
  
  let since, until;
  
  if (targetMonth !== undefined && targetYear !== undefined) {
    // Buscar do dia 1 do mês alvo até o último dia do mês alvo (ou hoje, se for o mês atual)
    const firstDay = new Date(targetYear, targetMonth - 1, 1);
    
    // Se o mês alvo for o mês e ano atual, vai até hoje. Se não, vai até o último dia do mês.
    const isCurrentMonth = targetMonth === (today.getMonth() + 1) && targetYear === today.getFullYear();
    const lastDay = isCurrentMonth ? today : new Date(targetYear, targetMonth, 0); // 0 = último dia do mês anterior
    
    since = firstDay.toISOString().split('T')[0];
    until = lastDay.toISOString().split('T')[0];
  } else {
    // Comportamento padrão (mês vigente: do dia 1 do mês atual até hoje)
    const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    since = firstDayOfCurrentMonth.toISOString().split('T')[0];
    until = today.toISOString().split('T')[0];
  }
  
  const timeRangeStr = encodeURIComponent(JSON.stringify({ since, until }));

  const existingAds = await prisma.adCreative.findMany({
    select: { id: true, imageUrl: true, thumbnailUrl: true }
  });
  const existingIds = new Set(existingAds.map(a => a.id));
  const blurryExistingIds = new Set(
    existingAds.filter(a => {
      if (!a.imageUrl || a.imageUrl === a.thumbnailUrl) return true;
      if (a.imageUrl.includes('fbcdn.net') || a.imageUrl.includes('scontent') || a.imageUrl.includes('facebook.com')) return true;
      return false;
    }).map(a => a.id)
  );

  if (onProgress) onProgress("Buscando novos dados do Meta...", 10);

  const insightFields = "ad_id,ad_name,adset_name,campaign_name,spend,purchase_roas,actions,action_values,cpm,ctr,cpc,impressions,clicks,date_start,date_stop";
  let metaUrl: string | null = `https://graph.facebook.com/v19.0/${metaAccountId}/insights?level=ad&time_range=${timeRangeStr}&time_increment=1&fields=${insightFields}&limit=500&access_token=${metaToken}`;

  const insightRows: any[] = [];
  const MAX_PAGES = 150;
  let page = 0;

  while (metaUrl && page < MAX_PAGES) {
    const metaResponse: Response = await fetch(metaUrl);
    const metaData: any = await metaResponse.json();

    if (metaData.error) {
      throw new Error(metaData.error.message);
    }

    insightRows.push(...(metaData.data || []));
    metaUrl = metaData.paging?.next || null;
    page++;
    
    if (page % 5 === 0 && onProgress) {
      onProgress(`Buscando novos dados do Meta (pág ${page})...`, 10 + Math.min(page, 20));
    }
  }

  const rowsByAdId: Record<string, any[]> = {};
  insightRows.forEach((row: any) => {
    if (!row.ad_id) return;
    if (!rowsByAdId[row.ad_id]) rowsByAdId[row.ad_id] = [];
    rowsByAdId[row.ad_id].push(row);
  });
  const adIds = Object.keys(rowsByAdId);

  const refreshAdIds = adIds.filter((id) => !existingIds.has(id) || blurryExistingIds.has(id));
  
  const creativeDataMap: Record<string, any> = {};
  const hashToUrlMap: Record<string, string> = {};
  const videoPictureMap: Record<string, string> = {};
  const videoSourceMap: Record<string, string> = {};
  const adStatusMap: Record<string, any> = {};

  if (onProgress) onProgress(`Buscando status de ${adIds.length} anúncios...`, 30);
  const STATUS_BATCH_SIZE = 50;
  for (let i = 0; i < adIds.length; i += STATUS_BATCH_SIZE) {
    const batchIds = adIds.slice(i, i + STATUS_BATCH_SIZE);
    const idsParam = batchIds.join(",");
    const statusUrl = `https://graph.facebook.com/v19.0/?ids=${idsParam}&fields=status,created_time,adset{targeting}&access_token=${metaToken}`;
    try {
      const res = await fetch(statusUrl);
      const data = await res.json();
      if (!data.error) {
        for (const adId of batchIds) {
          if (data[adId]) adStatusMap[adId] = data[adId];
        }
      } else {
        // Fallback: se o lote falhar por 1 ID inválido, tenta 1 a 1 sequencialmente
        for (const adId of batchIds) {
          try {
            const singleUrl = `https://graph.facebook.com/v19.0/${adId}?fields=status,created_time,adset{targeting}&access_token=${metaToken}`;
            const sRes = await fetch(singleUrl);
            const sData = await sRes.json();
            if (sData.error && (sData.error.code === 4 || sData.error.code === 17 || sData.error.code === 80004)) {
              if (onProgress) onProgress("Limite da API da Meta atingido. Salvando dados já coletados...", 30);
              break; // Sai do fallback
            }
            if (!sData.error) {
              adStatusMap[adId] = sData;
            }
          } catch(e) {}
          await new Promise(r => setTimeout(r, 100)); // Delay para proteger API
        }
      }
    } catch (err) {}
  }

  if (mode === "full") {
    if (onProgress) onProgress(`Processando ${refreshAdIds.length} criativos pendentes...`, 35);
    const CREATIVE_BATCH_SIZE = 50;

    for (let i = 0; i < refreshAdIds.length; i += CREATIVE_BATCH_SIZE) {
      const batchIds = refreshAdIds.slice(i, i + CREATIVE_BATCH_SIZE);
      const idsParam = batchIds.join(",");
      const creativeUrl = `https://graph.facebook.com/v19.0/?ids=${idsParam}&fields=adcreatives{image_url,thumbnail_url,image_hash,object_story_spec{video_data{video_id,image_url}},asset_feed_spec{images{hash},videos{video_id,thumbnail_url}}}&access_token=${metaToken}`;
      try {
        const res = await fetch(creativeUrl);
        const data = await res.json();
        if (!data.error) {
          for (const adId of batchIds) {
            if (data[adId]) creativeDataMap[adId] = data[adId];
          }
        } else {
           for (const adId of batchIds) {
             try {
               const singleUrl = `https://graph.facebook.com/v19.0/${adId}?fields=adcreatives{image_url,thumbnail_url,image_hash,object_story_spec{video_data{video_id,image_url}},asset_feed_spec{images{hash},videos{video_id,thumbnail_url}}}&access_token=${metaToken}`;
               const sRes = await fetch(singleUrl);
               const sData = await sRes.json();
               if (sData.error && (sData.error.code === 4 || sData.error.code === 17 || sData.error.code === 80004)) {
                 break;
               }
               if (!sData.error) {
                 creativeDataMap[adId] = sData;
               }
             } catch(e) {}
             await new Promise(r => setTimeout(r, 100)); // Delay para proteger API
           }
        }
      } catch (err) {}
      if (onProgress) onProgress(`Carregando criativos (${i + batchIds.length}/${refreshAdIds.length})...`, 35 + Math.floor(((i + batchIds.length) / refreshAdIds.length) * 10));
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

    if (imageHashes.size > 0) {
      if (onProgress) onProgress(`Resolvendo URLs de ${imageHashes.size} imagens...`, 45);
      const hashesArray = Array.from(imageHashes);
      const HASH_BATCH_SIZE = 50;
      for (let i = 0; i < hashesArray.length; i += HASH_BATCH_SIZE) {
        const batchHashes = hashesArray.slice(i, i + HASH_BATCH_SIZE);
        const hashesParam = encodeURIComponent(JSON.stringify(batchHashes));
        const imagesUrl = `https://graph.facebook.com/v19.0/${metaAccountId}/adimages?hashes=${hashesParam}&fields=url,original_image_url&access_token=${metaToken}`;
        try {
          const imagesRes = await fetch(imagesUrl);
          const imagesData = await imagesRes.json();
          if (imagesData && imagesData.data) {
            imagesData.data.forEach((img: any) => {
              const hashParts = img.id.split(":");
              const hash = hashParts.length > 1 ? hashParts[1] : img.id;
              hashToUrlMap[hash] = img.original_image_url || img.url;
            });
          }
        } catch (err) {}
      }
    }

    if (videoIds.size > 0) {
      if (onProgress) onProgress(`Resolvendo capas de ${videoIds.size} vídeos...`, 50);
      const videoIdsArray = Array.from(videoIds);
      for (let i = 0; i < videoIdsArray.length; i += CREATIVE_BATCH_SIZE) {
        const batchIds = videoIdsArray.slice(i, i + CREATIVE_BATCH_SIZE);
        const idsParam = batchIds.join(",");
        const videosUrl = `https://graph.facebook.com/v19.0/?ids=${idsParam}&fields=picture,source&access_token=${metaToken}`;
        try {
          const res = await fetch(videosUrl);
          const data = await res.json();
          for (const videoId of batchIds) {
            if (data[videoId]?.picture) videoPictureMap[videoId] = data[videoId].picture;
            if (data[videoId]?.source) videoSourceMap[videoId] = data[videoId].source;
          }
        } catch (err) {}
      }
    }
  }

  let syncedAds = 0;
  let syncedMetrics = 0;

  const creativeUpdates = [];
  const UPLOAD_BATCH_SIZE = 10;
  
  for (let i = 0; i < adIds.length; i += UPLOAD_BATCH_SIZE) {
    const batch = adIds.slice(i, i + UPLOAD_BATCH_SIZE);
    const perc = 50 + Math.floor((i / adIds.length) * 20);
    if (onProgress) onProgress(mode === "full" ? `Analisando mídias (${i}/${adIds.length})...` : `Organizando dados de anúncios...`, perc);
    
    const batchPromises = batch.map(async (adId) => {
      const rows = rowsByAdId[adId];
      const firstRow = rows[0];
      const needsCreativeRefresh = mode === "full" && (!existingIds.has(adId) || blurryExistingIds.has(adId));
      let imageUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      let videoUrl: string | null = null;
      let mediaType: string = "image";
      
      if (needsCreativeRefresh) {
        const creative = creativeDataMap[adId]?.adcreatives?.data?.[0];
        if (creative) {
          const videoId = creative.object_story_spec?.video_data?.video_id || creative.asset_feed_spec?.videos?.[0]?.video_id;
          const videoHiRes = creative.object_story_spec?.video_data?.image_url;
          const assetFeedVideoThumb = creative.asset_feed_spec?.videos?.[0]?.thumbnail_url;
          const videoPicture = videoId ? videoPictureMap[videoId] : null;
          thumbnailUrl = creative.thumbnail_url || null;

          const hash = creative.image_hash || creative.asset_feed_spec?.images?.[0]?.hash;
          const resolvedStaticHiRes = hash && hashToUrlMap[hash] ? hashToUrlMap[hash] : null;
          const bestUrl = videoHiRes || assetFeedVideoThumb || videoPicture || resolvedStaticHiRes || creative.image_url || thumbnailUrl || null;

          if (videoId && videoSourceMap[videoId]) {
            videoUrl = videoSourceMap[videoId];
            mediaType = "video";
          }

          if (bestUrl) {
            if (process.env.BLOB_READ_WRITE_TOKEN) {
              try {
                const imgRes = await fetch(bestUrl);
                if (imgRes.ok) {
                  const blob = await imgRes.blob();
                  const filename = `ads/${adId}.jpg`;
                  const { url } = await put(filename, blob, { access: 'public', addRandomSuffix: false });
                  imageUrl = url;
                  thumbnailUrl = url;
                } else {
                  imageUrl = bestUrl;
                  thumbnailUrl = bestUrl;
                }
              } catch (e) {
                imageUrl = bestUrl;
                thumbnailUrl = bestUrl;
              }
            } else {
              imageUrl = bestUrl;
              thumbnailUrl = bestUrl;
            }
          }
        }
      }

      let designer = null;
      if (firstRow.ad_name) {
        const adNameLower = firstRow.ad_name.toLowerCase();
        for (const ac of validAcronyms) {
          // Procura por _sigla, -sigla, espaço sigla (com delimitadores após) 
          // OU a sigla no final exato do arquivo (com ou sem extensão)
          const regex = new RegExp(`([_\\- ]${ac}(?:[\\._ \\-]|\\b|$)|${ac}(?:\\.[a-z0-9]{3,4})?$)`, "i");
          if (regex.test(adNameLower)) {
            designer = ac.toUpperCase();
            break;
          }
        }
      }

      let status = adStatusMap[adId]?.status || null;
      let createdTimeStr = adStatusMap[adId]?.created_time || null;
      let createdTime = createdTimeStr ? new Date(createdTimeStr) : null;

      let publisherPlatforms: string | null = null;
      const targeting = adStatusMap[adId]?.adset?.targeting;
      if (targeting) {
        if (targeting.publisher_platforms && targeting.publisher_platforms.length > 0) {
          publisherPlatforms = targeting.publisher_platforms.join(",");
        } else {
          // Se publisher_platforms não estiver presente, é "Posicionamento Advantage+" (Automático), que abrange todos os canais
          publisherPlatforms = "facebook,instagram,messenger,audience_network";
        }
      }

      return { adId, designer, imageUrl, thumbnailUrl, videoUrl, mediaType, publisherPlatforms, needsCreativeRefresh: (needsCreativeRefresh || !existingIds.has(adId)), adName: firstRow.ad_name, adsetName: firstRow.adset_name, campaignName: firstRow.campaign_name, status, createdTime };
    });
    
    const results = await Promise.all(batchPromises);
    creativeUpdates.push(...results);
  }

  if (onProgress) onProgress(`Preparando dados para o banco...`, 75);
  const dbOperations: any[] = [];

  for (const data of creativeUpdates) {
    const { adId, designer, imageUrl, thumbnailUrl, videoUrl, mediaType, publisherPlatforms, needsCreativeRefresh, adName, adsetName, campaignName, status, createdTime } = data;
    
    dbOperations.push(prisma.adCreative.upsert({
      where: { id: adId },
      update: {
        adName: adName || "Sem nome",
        adsetName: adsetName || "Desconhecido",
        campaignName: campaignName || "Desconhecido",
        designer,
        ...(needsCreativeRefresh && (imageUrl || videoUrl) ? { imageUrl, thumbnailUrl, videoUrl, mediaType } : {}),
        publisherPlatforms,
        status,
        createdTime
      },
      create: {
        id: adId,
        adName: adName || "Sem nome",
        adsetName: adsetName || "Desconhecido",
        campaignName: campaignName || "Desconhecido",
        designer,
        imageUrl,
        thumbnailUrl,
        videoUrl,
        mediaType,
        publisherPlatforms,
        status,
        createdTime
      }
    }));
    syncedAds++;

    const rows = rowsByAdId[adId];
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
      if (row.actions) {
        const purchasesObj = row.actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
        if (purchasesObj) purchases = parseInt(purchasesObj.value);

        const msgObj = row.actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
        if (msgObj) messages = parseInt(msgObj.value);

        const netOrdersObj = row.actions.find((a: any) => a.action_type === 'offsite_conversion.custom.2105075753380751');
        if (netOrdersObj) netOrders = parseInt(netOrdersObj.value);
      }
      let grossValue = 0;
      if (row.action_values) {
        const riskApprovedObj = row.action_values.find((a: any) => a.action_type === 'offsite_conversion.custom.2105075753380751');
        if (riskApprovedObj) riskApprovedValue = parseFloat(riskApprovedObj.value);

        const grossObj = row.action_values.find((a: any) => a.action_type === 'omni_purchase');
        if (grossObj) grossValue = parseFloat(grossObj.value);
      }

      const date = new Date(`${row.date_start}T00:00:00Z`);

      dbOperations.push(prisma.adDailyMetrics.upsert({
        where: { adCreativeId_date: { adCreativeId: adId, date: date } },
        update: { spend, roas: purchaseRoas, cpm, ctr, cpc, impressions, clicks, purchases, netOrders, riskApprovedValue, grossValue, messages },
        create: { adCreativeId: adId, date: date, spend, roas: purchaseRoas, cpm, ctr, cpc, impressions, clicks, purchases, netOrders, riskApprovedValue, grossValue, messages }
      }));
      syncedMetrics++;
    }
  }

  const DB_BATCH_SIZE = 500;
  for (let i = 0; i < dbOperations.length; i += DB_BATCH_SIZE) {
    const batchOps = dbOperations.slice(i, i + DB_BATCH_SIZE);
    const perc = 75 + Math.floor((i / dbOperations.length) * 25);
    if (onProgress) onProgress(`Gravando no banco de dados (${i}/${dbOperations.length})...`, perc);
    await prisma.$transaction(batchOps);
  }

  const updateData: any = { lastSyncAt: new Date() };
  if (mode === "full") {
    updateData.lastDeepSyncAt = new Date();
  } else {
    updateData.lastFastSyncAt = new Date();
  }

  await prisma.systemSettings.update({
    where: { id: 1 },
    data: updateData
  });

  return { syncedAds, syncedMetrics };
}

import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import prisma from "./prisma";
import { throttledFetch, fetchWithBisection, MetaApiError, WallClockLimitError, resetWallClock } from "./throttled-fetch";
import { loadAliasIndex, resolveDesigner } from "./designer-match";

function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

const PROGRESS_FILE = "progress_sql.json";

function getProgressDate(month: number, year: number): Date | null {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      const key = `${year}-${month}`;
      if (data[key]) {
        return new Date(data[key]);
      }
    } catch (e) {}
  }
  return null;
}

function saveProgressDate(month: number, year: number, date: Date) {
  let data: any = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch (e) {}
  }
  const key = `${year}-${month}`;
  data[key] = date.toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function runMetaSyncSql(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number,
  sqlOutputFile: string = "exportacao_meta.sql"
) {
  resetWallClock();
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  
  // Painel apenas: este CLI lê o mesmo banco que a aplicação.
  let metaAccountId = settings?.metaAdAccountId || undefined;
  const metaToken = settings?.metaAccessToken || undefined;

  if (metaAccountId && !metaAccountId.startsWith('act_')) {
    metaAccountId = `act_${metaAccountId}`;
  }

  if (!metaAccountId || !metaToken) {
    throw new Error("Credenciais do Meta Ads não configuradas no painel nem no .env");
  }

  if (onProgress) onProgress("Conectando à Meta...", 5);

  const aliases = await loadAliasIndex();

  const now = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  let sinceDate: Date, untilDate: Date;
  
  if (targetMonth !== undefined && targetYear !== undefined) {
    const savedDate = getProgressDate(targetMonth, targetYear);
    if (savedDate) {
      sinceDate = savedDate;
    } else {
      sinceDate = new Date(targetYear, targetMonth - 1, 1);
    }
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
  const insightFields = "ad_id,ad_name,adset_id,adset_name,campaign_name,spend,purchase_roas,actions,action_values,cpm,ctr,cpc,impressions,clicks,reach,frequency,date_start,date_stop,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_play_actions";

  let currentDate = new Date(sinceDate);
  let daysProcessed = 0;
  while (currentDate <= untilDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    const timeRange = {
      since: currentDate.toISOString().split('T')[0],
      until: currentDate.toISOString().split('T')[0]
    };

    const timeRangeStr = encodeURIComponent(JSON.stringify(timeRange));
    if (onProgress) onProgress(`Buscando insights para ${timeRange.since}...`, 15);
    
    try {
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
    
    if (targetMonth !== undefined && targetYear !== undefined) {
      saveProgressDate(targetMonth, targetYear, new Date(currentDate));
    }
    
    daysProcessed++;
    if (daysProcessed >= 1 && currentDate <= untilDate) {
      if (onProgress) onProgress("Forçando salvamento diário para exibir ao vivo...", 20);
      reachedWallClock = true;
      break;
    }
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
    select: { id: true, imageUrl: true, thumbnailUrl: true, videoUrl: true }
  });
  const existingIds = new Set(existingAds.map(a => a.id));
  if (fs.existsSync("ad_creatives_processed.json")) {
    try {
      const processed = JSON.parse(fs.readFileSync("ad_creatives_processed.json", "utf8"));
      processed.forEach((id: string) => existingIds.add(id));
    } catch (e) {}
  }
  const settingsData = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const globalCpanelUrl = settingsData?.cpanelUploadUrl || undefined;

  const refreshAdIds = Array.from(new Set([
    ...adIds.filter((id) => !existingIds.has(id))
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

  // --- 5. Process Creatives & Database Upsert ---
  let syncedAds = 0;
  const creativeOperations: any[] = [];
  let syncedMetrics = 0;
  
  if (onProgress) onProgress("Processando e salvando criativos...", 60);

  const allAdsToProcess = Array.from(new Set([...adIds, ...refreshAdIds]));

  for (let i = 0; i < allAdsToProcess.length; i++) {
    const adId = allAdsToProcess[i];
    const rows = rowsByAdId[adId];
    
    if (i % 100 === 0 && onProgress) {
      onProgress(`Processando criativos (${i}/${allAdsToProcess.length})...`, 60 + Math.floor((i / allAdsToProcess.length) * 15));
    }

    let adName = "Desconhecido";
    let adsetName = "Desconhecido";
    let campaignName = "Desconhecido";
    let status = "UNKNOWN";
    let createdTime = new Date();

    if (rows && rows.length > 0) {
      const firstRow = rows[0];
      adName = firstRow.ad_name || "Desconhecido";
      adsetName = firstRow.adset_name || "Desconhecido";
      campaignName = firstRow.campaign_name || "Desconhecido";
      
      const sData = adStatusMap[adId];
      status = sData?.status || "UNKNOWN";
      const createdAtStr = sData?.created_time;
      if (createdAtStr) {
        createdTime = new Date(createdAtStr);
        if (isNaN(createdTime.getTime())) createdTime = new Date();
      }
    } else {
      const sData = adStatusMap[adId];
      if (sData) {
        status = sData.status || "UNKNOWN";
      }
    }

    const designer = resolveDesigner(adName, aliases);

    let imageUrl = "";
    let thumbnailUrl = "";
    let videoUrl = "";

    if (mode === "full") {
      const creative = creativeDataMap[adId]?.adcreatives?.data?.[0];
      if (creative) {
        const videoId = creative.object_story_spec?.video_data?.video_id || creative.asset_feed_spec?.videos?.[0]?.video_id;
        
        let fbImageUrl = "";
        if (videoId) {
          videoUrl = videoSourceMap[videoId] || "";
          fbImageUrl = videoPictureMap[videoId] || creative.thumbnail_url || creative.object_story_spec?.video_data?.image_url || creative.asset_feed_spec?.videos?.[0]?.thumbnail_url || "";
        } else {
          let hash = creative.image_hash;
          if (!hash && creative.asset_feed_spec?.images && creative.asset_feed_spec.images.length > 0) {
            hash = creative.asset_feed_spec.images[0].hash;
          }
          fbImageUrl = hashToUrlMap[hash] || creative.image_url || "";
        }

        if (fbImageUrl) {
          if (fbImageUrl.includes('fbcdn.net') || fbImageUrl.includes('scontent')) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);
              const imgRes = await fetch(fbImageUrl, { signal: controller.signal });
              clearTimeout(timeoutId);
              
              if (imgRes.ok) {
                const blob = await imgRes.blob();
                const filename = `${adId}-${videoId || creative.image_hash || 'image'}.jpg`;
                
                const uploadUrl = settingsData?.cpanelUploadUrl || undefined;
                const uploadSecret = settingsData?.cpanelUploadSecret || undefined;

                if (uploadUrl && uploadSecret) {
                  const formData = new FormData();
                  formData.append("file", blob, filename);
                  formData.append("filename", filename);

                  try {
                    const uploadRes = await fetch(uploadUrl, {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${uploadSecret}`
                      },
                      body: formData
                    });

                    if (uploadRes.ok) {
                      const result = await uploadRes.json();
                      if (result.success && result.url) {
                        imageUrl = result.url;
                        thumbnailUrl = result.url;
                      } else {
                        imageUrl = fbImageUrl;
                        thumbnailUrl = fbImageUrl;
                      }
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

    if (rows && rows.length > 0) {
      const data: any = {
        adName,
        adsetName,
        campaignName,
        status,
        createdTime,
      };
      if (designer) data.designer = designer;
      if (imageUrl) data.imageUrl = imageUrl;
      if (thumbnailUrl) data.thumbnailUrl = thumbnailUrl;
      if (videoUrl) {
        data.videoUrl = videoUrl;
        data.mediaType = "video";
      } else {
        data.mediaType = "image";
      }
      
      creativeOperations.push({ type: "upsert", adId, data });
    } else if (status !== "UNKNOWN") {
      const updateData: any = { status };
      if (designer) updateData.designer = designer;
      if (imageUrl) updateData.imageUrl = imageUrl;
      if (thumbnailUrl) updateData.thumbnailUrl = thumbnailUrl;
      if (videoUrl) {
        updateData.videoUrl = videoUrl;
        updateData.mediaType = "video";
      }
      creativeOperations.push({ type: "updateMany", adId, data: updateData });
    }
  }

  if (creativeOperations.length > 0) {
    if (onProgress) onProgress("Escrevendo criativos no arquivo SQL...", 70);
    let sqlContent = "";
    for (const op of creativeOperations) {
      if (op.type === "upsert") {
        const d = op.data;
        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const createdTimeStr = d.createdTime ? new Date(d.createdTime).toISOString().slice(0, 19).replace('T', ' ') : nowStr;
        sqlContent += `INSERT INTO \`AdCreative\` (\`id\`, \`adName\`, \`adsetName\`, \`campaignName\`, \`status\`, \`createdTime\`, \`designer\`, \`imageUrl\`, \`thumbnailUrl\`, \`videoUrl\`, \`mediaType\`, \`updatedAt\`) VALUES (${escapeSql(op.adId)}, ${escapeSql(d.adName)}, ${escapeSql(d.adsetName)}, ${escapeSql(d.campaignName)}, ${escapeSql(d.status)}, ${escapeSql(createdTimeStr)}, ${escapeSql(d.designer)}, ${escapeSql(d.imageUrl)}, ${escapeSql(d.thumbnailUrl)}, ${escapeSql(d.videoUrl)}, ${escapeSql(d.mediaType || 'image')}, '${nowStr}') ON DUPLICATE KEY UPDATE \`adName\` = COALESCE(VALUES(\`adName\`), \`adName\`), \`adsetName\` = COALESCE(VALUES(\`adsetName\`), \`adsetName\`), \`campaignName\` = COALESCE(VALUES(\`campaignName\`), \`campaignName\`), \`status\` = COALESCE(VALUES(\`status\`), \`status\`), \`designer\` = COALESCE(VALUES(\`designer\`), \`designer\`), \`imageUrl\` = COALESCE(VALUES(\`imageUrl\`), \`imageUrl\`), \`thumbnailUrl\` = COALESCE(VALUES(\`thumbnailUrl\`), \`thumbnailUrl\`), \`videoUrl\` = COALESCE(VALUES(\`videoUrl\`), \`videoUrl\`), \`mediaType\` = COALESCE(VALUES(\`mediaType\`), \`mediaType\`), \`updatedAt\` = '${nowStr}';\n`;
      } else {
        const d = op.data;
        let sets = [];
        if (d.status !== undefined) sets.push(`\`status\` = ${escapeSql(d.status)}`);
        if (d.designer !== undefined) sets.push(`\`designer\` = ${escapeSql(d.designer)}`);
        if (d.imageUrl !== undefined) sets.push(`\`imageUrl\` = ${escapeSql(d.imageUrl)}`);
        if (d.thumbnailUrl !== undefined) sets.push(`\`thumbnailUrl\` = ${escapeSql(d.thumbnailUrl)}`);
        if (d.videoUrl !== undefined) sets.push(`\`videoUrl\` = ${escapeSql(d.videoUrl)}`);
        if (d.mediaType !== undefined) sets.push(`\`mediaType\` = ${escapeSql(d.mediaType)}`);
        
        if (sets.length > 0) {
          sqlContent += `UPDATE \`AdCreative\` SET ${sets.join(", ")} WHERE \`id\` = ${escapeSql(op.adId)};\n`;
        }
      }
    }
    fs.appendFileSync(sqlOutputFile, sqlContent, "utf8");
    syncedAds += creativeOperations.length;
  }

  if (onProgress) onProgress("Processando e salvando métricas...", 75);

  const metricOperations: any[] = [];

  for (let i = 0; i < adIds.length; i++) {
    const adId = adIds[i];
    const rows = rowsByAdId[adId];
    if (!rows || rows.length === 0) continue;

    if (i % 100 === 0 && onProgress) {
      onProgress(`Processando métricas (${i}/${adIds.length})...`, 75 + Math.floor((i / adIds.length) * 20));
    }

    for (const row of rows) {
      if (!row.date_start) continue;
      const spend = parseFloat(row.spend || "0");
      const cpm = parseFloat(row.cpm || "0");
      const ctr = parseFloat(row.ctr || "0");
      const cpc = parseFloat(row.cpc || "0");
      const impressions = parseInt(row.impressions || "0");
      const clicks = parseInt(row.clicks || "0");
      const reach = row.reach ? parseInt(row.reach) : 0;
      const frequency = row.frequency ? parseFloat(row.frequency) : 0;

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
      
      let likes = 0; let comments = 0; let shares = 0; let videoViews = 0;
      let videoViews25p = 0; let videoViews50p = 0; let videoViews75p = 0; let videoViews100p = 0;

      if (row.actions) {
        likes = getFallbackValue(row.actions, ['post_reaction', 'like']);
        comments = getFallbackValue(row.actions, ['post_comment', 'comment']);
        shares = getFallbackValue(row.actions, ['post_engagement', 'post', 'share']);
      }
      
      if (row.video_play_actions) videoViews = getFallbackValue(row.video_play_actions, ['video_view']);
      else if (row.actions) videoViews = getFallbackValue(row.actions, ['video_view']);
      
      if (row.video_p25_watched_actions) videoViews25p = getFallbackValue(row.video_p25_watched_actions, ['video_p25_watched_actions']);
      if (row.video_p50_watched_actions) videoViews50p = getFallbackValue(row.video_p50_watched_actions, ['video_p50_watched_actions']);
      if (row.video_p75_watched_actions) videoViews75p = getFallbackValue(row.video_p75_watched_actions, ['video_p75_watched_actions']);
      if (row.video_p100_watched_actions) videoViews100p = getFallbackValue(row.video_p100_watched_actions, ['video_p100_watched_actions']);
      
      let grossValue = 0;
      if (row.action_values) {
        const riskApprovedObj = row.action_values.find((a: any) => a.action_type === 'offsite_conversion.custom.2105075753380751');
        if (riskApprovedObj) riskApprovedValue = parseFloat(riskApprovedObj.value);

        grossValue = getFallbackValue(row.action_values, ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'offline_conversion.purchase']);
      }

      const dateStart = new Date(`${row.date_start}T00:00:00Z`);

      metricOperations.push({
        adCreativeId: adId,
        dateStart,
        data: {
          spend, roas: purchaseRoas, cpm, ctr, cpc, impressions, reach, frequency, clicks,
          purchases, netOrders, riskApprovedValue, grossValue, messages, likes, comments,
          shares, videoViews, videoViews25p, videoViews50p, videoViews75p, videoViews100p
        }
      });
    }
  }

  if (metricOperations.length > 0) {
    if (onProgress) onProgress("Escrevendo métricas no arquivo SQL...", 95);
    let sqlContent = "";
    
    // -- LOGGING POR DIA --
    let logContent = `\n=======================================================\n`;
    logContent += `Lote processado em: ${new Date().toLocaleString('pt-BR')}\n`;
    logContent += `=======================================================\n\n`;

    const metricsByDay: Record<string, number> = {};

    for (const op of metricOperations) {
      const d = op.data;
      const dateStr = op.dateStart.toISOString().slice(0, 19).replace('T', ' ');
      const justDate = op.dateStart.toISOString().split('T')[0];
      
      if (!metricsByDay[justDate]) metricsByDay[justDate] = 0;
      metricsByDay[justDate]++;
      
      sqlContent += `INSERT INTO \`AdDailyMetrics\` (\`id\`, \`adCreativeId\`, \`date\`, \`spend\`, \`roas\`, \`cpm\`, \`ctr\`, \`cpc\`, \`impressions\`, \`reach\`, \`frequency\`, \`clicks\`, \`purchases\`, \`netOrders\`, \`riskApprovedValue\`, \`grossValue\`, \`messages\`, \`likes\`, \`comments\`, \`shares\`, \`videoViews\`, \`videoViews25p\`, \`videoViews50p\`, \`videoViews75p\`, \`videoViews100p\`) VALUES ('${uuidv4()}', ${escapeSql(op.adCreativeId)}, ${escapeSql(dateStr)}, ${d.spend}, ${d.roas}, ${d.cpm}, ${d.ctr}, ${d.cpc}, ${d.impressions}, ${d.reach}, ${d.frequency}, ${d.clicks}, ${d.purchases}, ${d.netOrders}, ${d.riskApprovedValue}, ${d.grossValue}, ${d.messages}, ${d.likes}, ${d.comments}, ${d.shares}, ${d.videoViews}, ${d.videoViews25p}, ${d.videoViews50p}, ${d.videoViews75p}, ${d.videoViews100p}) ON DUPLICATE KEY UPDATE \`spend\` = VALUES(\`spend\`), \`roas\` = VALUES(\`roas\`), \`cpm\` = VALUES(\`cpm\`), \`ctr\` = VALUES(\`ctr\`), \`cpc\` = VALUES(\`cpc\`), \`impressions\` = VALUES(\`impressions\`), \`reach\` = VALUES(\`reach\`), \`frequency\` = VALUES(\`frequency\`), \`clicks\` = VALUES(\`clicks\`), \`purchases\` = VALUES(\`purchases\`), \`netOrders\` = VALUES(\`netOrders\`), \`riskApprovedValue\` = VALUES(\`riskApprovedValue\`), \`grossValue\` = VALUES(\`grossValue\`), \`messages\` = VALUES(\`messages\`), \`likes\` = VALUES(\`likes\`), \`comments\` = VALUES(\`comments\`), \`shares\` = VALUES(\`shares\`), \`videoViews\` = VALUES(\`videoViews\`), \`videoViews25p\` = VALUES(\`videoViews25p\`), \`videoViews50p\` = VALUES(\`videoViews50p\`), \`videoViews75p\` = VALUES(\`videoViews75p\`), \`videoViews100p\` = VALUES(\`videoViews100p\`);\n`;
    }

    logContent += `[MÉTRICAS POR DIA]\n`;
    for (const d of Object.keys(metricsByDay).sort()) {
      logContent += `- Dia ${d}: ${metricsByDay[d]} linhas de métricas geradas.\n`;
    }

    logContent += `\n[CRIATIVOS (ANÚNCIOS)]\n`;
    let newAdsCount = 0;
    for (const op of creativeOperations) {
      if (op.type === "upsert") {
        newAdsCount++;
        logContent += `- Novo: ${op.data.adName} (ID: ${op.adId})\n`;
      }
    }
    if (newAdsCount === 0) logContent += `- Nenhum criativo novo neste lote (apenas atualizações de status).\n`;

    // Save processed ads to avoid reprocessing them in local DB export mode
    try {
      const processed = fs.existsSync("ad_creatives_processed.json") ? JSON.parse(fs.readFileSync("ad_creatives_processed.json", "utf8")) : [];
      const updatedProcessed = Array.from(new Set([...processed, ...allAdsToProcess]));
      fs.writeFileSync("ad_creatives_processed.json", JSON.stringify(updatedProcessed), "utf8");
    } catch (e) {}

    fs.appendFileSync(sqlOutputFile, sqlContent, "utf8");
    fs.appendFileSync("insercoes_por_dia.log", logContent, "utf8");
    syncedMetrics += metricOperations.length;
  }

  // Update last sync times
  if (!reachedWallClock) {
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const field = mode === "full" ? "lastMetaSyncFull" : "lastMetaSyncMetrics";
    const sqlContent = `UPDATE \`SystemSettings\` SET \`${field}\` = '${nowStr}' WHERE \`id\` = 1;\n`;
    fs.appendFileSync(sqlOutputFile, sqlContent, "utf8");
    if (onProgress) onProgress("Sincronização concluída com sucesso!", 100);
  } else {
    if (onProgress) onProgress("Sincronização abortada por limite de tempo/taxa. Agende novamente para continuar.", 100);
  }

  return { syncedAds, syncedMetrics, reachedLimit: reachedWallClock };
}

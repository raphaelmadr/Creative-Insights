import prisma from "./prisma";
import {
  throttledFetch,
  fetchWithBisection,
  MetaApiError,
  WallClockLimitError,
  resetWallClock,
  wallClockRemainingMs,
} from "./throttled-fetch";
import { loadAliasIndex, resolveDesigner } from "./designer-match";
import { normalizeMetaStatus } from "./ad-status";
import {
  PAYMENT_APPROVED_ACTION,
  RISK_APPROVED_ACTION,
  GROSS_VALUE_FALLBACK_ACTIONS,
} from "./meta-conversions";
import {
  resolveStorageConfig,
  isStorageConfigured,
  isPermanentMediaUrl,
  persistRemoteMedia,
  runWithConcurrency,
} from "./media-upload";
import {
  resolveSyncWindow,
  eachDayYmd,
  ymdToUtcDate,
  addDaysYmd,
} from "./date-utils";

/**
 * Nenhum dia do mês corrente é considerado fechado.
 *
 * `risk_approved_cc` (receita líquida) só é registrado quando o pedido passa na
 * análise de risco, o que acontece dias depois do clique. Medido em 08/09, os
 * dias 01 a 06 continuavam ganhando receita: o dia 03, por exemplo, tinha
 * R$ 27.582 gravados contra R$ 44.423 já reportados pela API.
 *
 * Como o mês inteiro cabe em no máximo 31 chamadas, rebuscamos tudo. O pulo de
 * dias já sincronizados vale apenas para meses passados (backfill).
 */
const REATTRIBUTION_WINDOW_DAYS = 7;

/** Uploads simultâneos de mídia. Equilibra vazão e educação com o cPanel. */
const MEDIA_UPLOAD_CONCURRENCY = 4;

/** Margem de tempo reservada para as escritas no banco no fim da execução. */
const DB_WRITE_RESERVE_MS = 25000;

const BATCH_SIZE = 25;

/** Escritas simultâneas no banco. Abaixo do pool padrão do Prisma. */
const DB_WRITE_CONCURRENCY = 5;

async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Prisma query timeout (15s)")), 15000))
      ]);
    } catch (error: any) {
      if (attempt >= maxRetries) throw error;
      console.warn(`[withDbRetry] Falha no banco (tentativa ${attempt}/${maxRetries}). Esperando ${initialDelay * attempt}ms... Erro: ${error.message}`);
      await new Promise(r => setTimeout(r, initialDelay * attempt));
      attempt++;
    }
  }
}

function isRateOrTimeLimit(error: unknown): boolean {
  return (
    error instanceof WallClockLimitError ||
    (error instanceof MetaApiError && error.isRateLimit)
  );
}

interface ExistingAd {
  id: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  designer: string | null;
  status: string | null;
  createdTime: Date | null;
  publisherPlatforms: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  mediaType: string;
}

/**
 * A listagem `/ads` omite arquivados e removidos por padrão. Sem este filtro,
 * criativos antigos nunca recebem status — ficam presos em "UNKNOWN" para sempre.
 */
const ALL_EFFECTIVE_STATUSES = [
  "ACTIVE", "PAUSED", "DELETED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED",
  "PENDING_BILLING_INFO", "CAMPAIGN_PAUSED", "ARCHIVED", "ADSET_PAUSED",
  "IN_PROCESS", "WITH_ISSUES",
];

export async function runMetaSync(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number
) {
  resetWallClock();

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  let metaAccountId = settings?.metaAdAccountId || process.env.META_AD_ACCOUNT_ID;
  const metaToken = settings?.metaAccessToken || process.env.META_ACCESS_TOKEN;

  if (metaAccountId && !metaAccountId.startsWith("act_")) {
    metaAccountId = `act_${metaAccountId}`;
  }

  if (!metaAccountId || !metaToken) {
    throw new Error("Credenciais do Meta Ads não configuradas no painel nem no .env");
  }

  const storage = resolveStorageConfig(settings);
  if (mode === "full" && !isStorageConfigured(storage)) {
    console.warn(
      "[Meta Sync] Armazenamento de mídia não configurado (cpanelUploadUrl/cpanelUploadSecret). " +
      "Criativos estáticos não serão persistidos e as URLs da Meta expirariam — o passo será pulado."
    );
  }

  if (onProgress) onProgress("Conectando à Meta...", 3);

  const aliases = await loadAliasIndex();
  const { sinceYmd, untilYmd, todayYmd } = resolveSyncWindow(targetMonth, targetYear);

  // O mês corrente é sempre rebuscado por inteiro; meses passados respeitam a
  // janela de reatribuição e podem pular dias já gravados.
  const isCurrentMonth = sinceYmd.slice(0, 7) === todayYmd.slice(0, 7);
  const reattributionCutoffYmd = isCurrentMonth
    ? sinceYmd
    : addDaysYmd(todayYmd, -REATTRIBUTION_WINDOW_DAYS);

  const insightRows: any[] = [];
  let reachedWallClock = false;

  // --- 1. Insights (um dia por vez) ---
  if (onProgress) onProgress(`Buscando dados de ${sinceYmd} a ${untilYmd}...`, 6);

  const insightFields = "ad_id,ad_name,adset_id,adset_name,campaign_name,spend,purchase_roas,actions,action_values,cpm,ctr,cpc,impressions,clicks,reach,frequency,date_start,date_stop,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_play_actions";

  const days = eachDayYmd(sinceYmd, untilYmd);

  /**
   * Quais dias já têm métricas DESTE canal.
   *
   * Antes isso era uma contagem por dia sem filtrar plataforma: bastava o
   * TikTok gravar a data primeiro para o Meta pular aquele dia permanentemente.
   * Também era uma query por dia; agora é uma só.
   */
  const daysWithData = new Set<string>();
  if (days.length > 0) {
    const grouped = await withDbRetry(() => prisma.adDailyMetrics.groupBy({
      by: ["date"],
      where: {
        date: { gte: ymdToUtcDate(sinceYmd), lte: ymdToUtcDate(untilYmd) },
        creative: { platform: "META" },
      },
      _count: { _all: true },
    }));
    grouped.forEach((row: any) => {
      if (row._count._all > 0) daysWithData.add(row.date.toISOString().slice(0, 10));
    });
  }

  let skippedDays = 0;

  for (const dayYmd of days) {
    const isWithinReattribution = isCurrentMonth || dayYmd > reattributionCutoffYmd;

    if (!isWithinReattribution && daysWithData.has(dayYmd)) {
      skippedDays++;
      continue;
    }

    try {
      if (onProgress) {
        onProgress(`Buscando insights de ${dayYmd}...`, 6 + Math.floor((days.indexOf(dayYmd) / days.length) * 20));
      }

      const timeRangeStr = encodeURIComponent(JSON.stringify({ since: dayYmd, until: dayYmd }));
      let metaUrl: string | null = `https://graph.facebook.com/v19.0/${metaAccountId}/insights?level=ad&time_range=${timeRangeStr}&time_increment=1&fields=${insightFields}&limit=500&access_token=${metaToken}`;

      while (metaUrl) {
        const metaData = await throttledFetch(metaUrl);
        if (!metaData) break;
        insightRows.push(...(metaData.data || []));
        metaUrl = metaData.paging?.next || null;
      }
    } catch (err: any) {
      if (isRateOrTimeLimit(err)) {
        if (onProgress) onProgress("Teto de tempo/taxa atingido. Salvando o progresso obtido...", 26);
        reachedWallClock = true;
        break;
      }
      throw err;
    }
  }

  if (skippedDays > 0) {
    console.log(`[Meta Sync] ${skippedDays} dia(s) fechados fora da janela de reatribuição foram pulados.`);
  }

  const rowsByAdId: Record<string, any[]> = {};
  insightRows.forEach((row: any) => {
    if (!row.ad_id) return;
    (rowsByAdId[row.ad_id] ||= []).push(row);
  });
  const adIdsWithInsights = Object.keys(rowsByAdId);

  // --- 2. Estado atual no banco ---
  const existingAds: ExistingAd[] = await withDbRetry(() => prisma.adCreative.findMany({
    where: { platform: "META" },
    select: {
      id: true, adName: true, adsetName: true, campaignName: true, designer: true,
      status: true, createdTime: true, publisherPlatforms: true,
      imageUrl: true, thumbnailUrl: true, videoUrl: true, mediaType: true,
    },
  }));
  const existingById = new Map(existingAds.map(ad => [ad.id, ad]));

  /**
   * Um criativo precisa que sua mídia seja reprocessada quando:
   *  - é novo;
   *  - não tem imagem, ou a imagem ainda está num domínio de plataforma (expira);
   *  - é vídeo e o link do vídeo não é permanente — links de `source` da Meta são
   *    assinados e expiram, então precisam ser renovados a cada sync profundo.
   *
   * A ordem importa: a versão anterior retornava cedo assim que a CAPA estava no
   * cPanel, e por isso a verificação do vídeo era inalcançável. 452 criativos de
   * vídeo ficaram presos com link morto por causa disso.
   */
  const needsMediaRefresh = (ad: ExistingAd | undefined): boolean => {
    if (!ad) return true;

    const isVideo = ad.mediaType === "video" || !!ad.videoUrl;
    if (isVideo && !isPermanentMediaUrl(ad.videoUrl, storage)) return true;

    if (!ad.imageUrl) return true;
    if (!isPermanentMediaUrl(ad.imageUrl, storage)) return true;

    return false;
  };


  // Mapas de dados
  const creativeDataMap: Record<string, any> = {};
  const adMetaMap: Record<string, any> = {};
  const hashToUrlMap: Record<string, string> = {};
  const videoPictureMap: Record<string, string> = {};
  const videoSourceMap: Record<string, string> = {};
  const adsetPlatformsMap: Record<string, string> = {};

  // --- 3. Enumeração de anúncios (ativos E inativos) ---
  //
  // Antes o status vinha de chamadas em lote por ID, restritas aos anúncios com
  // entrega no mês — anúncios sem entrega nunca tinham status atualizado e 1721
  // criativos ficaram gravados como "UNKNOWN". Percorrer /ads da conta custa uma
  // chamada por 500 anúncios e cobre a conta inteira.
  if (!reachedWallClock) {
    if (onProgress) onProgress("Enumerando anúncios da conta (ativos e inativos)...", 28);

    try {
      const statusFilter = encodeURIComponent(JSON.stringify([
        { field: "ad.effective_status", operator: "IN", value: ALL_EFFECTIVE_STATUSES },
      ]));
      let adsUrl: string | null = `https://graph.facebook.com/v19.0/${metaAccountId}/ads?fields=id,name,status,effective_status,created_time,adset{id,name},campaign{id,name}&filtering=${statusFilter}&limit=500&access_token=${metaToken}`;
      let pages = 0;

      while (adsUrl && pages < 60) {
        const page = await throttledFetch(adsUrl);
        if (!page) break;

        if (page.error) {
          console.warn(`[Meta Sync] Enumeração de anúncios indisponível: ${page.error.message}`);
          break;
        }

        for (const ad of page.data || []) {
          adMetaMap[ad.id] = ad;
        }

        adsUrl = page.paging?.next || null;
        pages++;
        if (onProgress) onProgress(`Enumerando anúncios (${Object.keys(adMetaMap).length})...`, 28);
      }
    } catch (err: any) {
      if (isRateOrTimeLimit(err)) {
        reachedWallClock = true;
      } else {
        console.warn(`[Meta Sync] Falha ao enumerar anúncios: ${err.message}`);
      }
    }
  }

  // Cobre anúncios com insights que não vieram na enumeração (raro, mas possível).
  const missingMeta = adIdsWithInsights.filter(id => !adMetaMap[id]);
  if (!reachedWallClock && missingMeta.length > 0) {
    if (onProgress) onProgress(`Completando status de ${missingMeta.length} anúncios...`, 32);
    try {
      for (let i = 0; i < missingMeta.length; i += BATCH_SIZE) {
        const batchIds = missingMeta.slice(i, i + BATCH_SIZE);
        const data = await fetchWithBisection(batchIds, (ids) =>
          `https://graph.facebook.com/v19.0/?ids=${ids}&fields=id,name,status,effective_status,created_time&access_token=${metaToken}`
        );
        if (data) {
          for (const adId of batchIds) {
            if (data[adId]) adMetaMap[adId] = data[adId];
          }
        }
      }
    } catch (err: any) {
      if (isRateOrTimeLimit(err)) reachedWallClock = true;
    }
  }

  // --- 4. Criativos e mídias ---
  //
  // A fila é montada só agora porque também inclui criativos descobertos pela
  // enumeração, que ainda não existem no banco e por isso não têm mídia alguma.
  // Anúncios com entrega no mês vêm primeiro; os demais entram com um teto por
  // execução, para a fila convergir em alguns ciclos em vez de estourar o tempo.
  const NEW_WITHOUT_INSIGHTS_BUDGET = 500;

  const refreshAdIds = mode === "full"
    ? [
        ...adIdsWithInsights.filter(id => needsMediaRefresh(existingById.get(id))),
        // Sem entrega na janela, só vale buscar mídia dos que estão no ar —
        // são os únicos que viram registro novo.
        ...Object.keys(adMetaMap)
          .filter(id =>
            !existingById.has(id) &&
            !rowsByAdId[id] &&
            normalizeMetaStatus(adMetaMap[id]?.status, adMetaMap[id]?.effective_status) === "ACTIVE"
          )
          .slice(0, NEW_WITHOUT_INSIGHTS_BUDGET),
      ]
    : [];

  if (!reachedWallClock && mode === "full" && refreshAdIds.length > 0) {
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
        if (onProgress) {
          onProgress(
            `Carregando criativos (${Math.min(i + BATCH_SIZE, refreshAdIds.length)}/${refreshAdIds.length})...`,
            35 + Math.floor((i / refreshAdIds.length) * 8)
          );
        }
      }
    } catch (err: any) {
      if (isRateOrTimeLimit(err)) reachedWallClock = true;
    }

    // Targeting apenas dos conjuntos que interessam.
    //
    // Este mapa era montado para TODOS os conjuntos e depois nunca lido — puro
    // desperdício de orçamento de rate limit. Agora alimenta publisherPlatforms,
    // que é o que a UI usa para mostrar os ícones de canal.
    const adsetIdsToResolve = Array.from(new Set(
      refreshAdIds
        .map(id => rowsByAdId[id]?.[0]?.adset_id || adMetaMap[id]?.adset?.id)
        .filter(Boolean)
    ));

    if (!reachedWallClock && adsetIdsToResolve.length > 0) {
      if (onProgress) onProgress(`Resolvendo posicionamentos de ${adsetIdsToResolve.length} conjuntos...`, 44);
      try {
        for (let i = 0; i < adsetIdsToResolve.length; i += BATCH_SIZE) {
          const batchIds = adsetIdsToResolve.slice(i, i + BATCH_SIZE);
          const data = await fetchWithBisection(batchIds, (ids) =>
            `https://graph.facebook.com/v19.0/?ids=${ids}&fields=targeting{publisher_platforms}&access_token=${metaToken}`
          );
          if (data) {
            for (const adsetId of batchIds) {
              const platforms = data[adsetId]?.targeting?.publisher_platforms;
              if (Array.isArray(platforms) && platforms.length > 0) {
                adsetPlatformsMap[adsetId] = platforms.join(",");
              }
            }
          }
        }
      } catch (err: any) {
        if (isRateOrTimeLimit(err)) reachedWallClock = true;
      }
    }

    // Resolve hashes de imagem e ids de vídeo do lote pendente.
    const imageHashes = new Set<string>();
    const videoIds = new Set<string>();
    refreshAdIds.forEach((adId: string) => {
      const creative = creativeDataMap[adId]?.adcreatives?.data?.[0];
      if (!creative) return;
      const videoId = creative.object_story_spec?.video_data?.video_id || creative.asset_feed_spec?.videos?.[0]?.video_id;
      if (videoId) videoIds.add(videoId);
      else if (creative.image_hash) imageHashes.add(creative.image_hash);
      else if (creative.asset_feed_spec?.images?.length > 0) imageHashes.add(creative.asset_feed_spec.images[0].hash);
    });

    if (!reachedWallClock && imageHashes.size > 0) {
      if (onProgress) onProgress(`Resolvendo URLs de ${imageHashes.size} imagens...`, 48);
      const hashesArray = Array.from(imageHashes);
      try {
        for (let i = 0; i < hashesArray.length; i += BATCH_SIZE) {
          const batchHashes = hashesArray.slice(i, i + BATCH_SIZE);
          const hashesParam = encodeURIComponent(JSON.stringify(batchHashes));
          const imagesUrl = `https://graph.facebook.com/v19.0/${metaAccountId}/adimages?hashes=${hashesParam}&fields=url,original_image_url&access_token=${metaToken}`;

          const imagesData = await throttledFetch(imagesUrl);
          if (imagesData?.data) {
            imagesData.data.forEach((img: any) => {
              const hashParts = img.id.split(":");
              const hash = hashParts.length > 1 ? hashParts[1] : img.id;
              hashToUrlMap[hash] = img.original_image_url || img.url;
            });
          }
        }
      } catch (err: any) {
        if (isRateOrTimeLimit(err)) reachedWallClock = true;
      }
    }

    if (!reachedWallClock && videoIds.size > 0) {
      if (onProgress) onProgress(`Renovando links de ${videoIds.size} vídeos...`, 52);
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
      } catch (err: any) {
        if (isRateOrTimeLimit(err)) reachedWallClock = true;
      }
    }
  }

  // --- 5. Montagem dos registros ---
  if (onProgress) onProgress("Processando criativos...", 58);

  interface PendingCreative {
    adId: string;
    hasInsights: boolean;
    adName: string | null;
    adsetName: string | null;
    campaignName: string | null;
    status: string | null;
    createdTime: Date | null;
    designer: string | null;
    publisherPlatforms: string | null;
    videoUrl: string;
    /** URL na Meta a ser persistida; permanece vazia se nada precisa mudar. */
    sourceImageUrl: string;
    imageBaseName: string;
    /** Preenchida na fase de upload. */
    persistedImageUrl: string;
  }

  const allAdIds = Array.from(new Set([...adIdsWithInsights, ...Object.keys(adMetaMap)]));
  const pending: PendingCreative[] = [];

  for (const adId of allAdIds) {
    const rows = rowsByAdId[adId];
    const hasInsights = !!rows?.length;
    const apiMeta = adMetaMap[adId];
    const firstRow = rows?.[0];

    const adName = firstRow?.ad_name || apiMeta?.name || null;
    const adsetName = firstRow?.adset_name || apiMeta?.adset?.name || null;
    const campaignName = firstRow?.campaign_name || apiMeta?.campaign?.name || null;

    /**
     * `null` significa "não sei" e faz o campo ser omitido da escrita.
     *
     * Antes, uma falha na busca de status gravava "UNKNOWN" por cima de um valor
     * bom, e `createdTime` caía para `new Date()` — foi assim que 1526 criativos
     * ficaram com data de criação igual à data de um sync.
     */
    const status = apiMeta
      ? normalizeMetaStatus(apiMeta.status, apiMeta.effective_status)
      : null;

    let createdTime: Date | null = null;
    if (apiMeta?.created_time) {
      const parsed = new Date(apiMeta.created_time);
      if (!isNaN(parsed.getTime())) createdTime = parsed;
    }

    const adsetId = firstRow?.adset_id || apiMeta?.adset?.id;
    const publisherPlatforms = adsetId ? adsetPlatformsMap[adsetId] || null : null;

    let videoUrl = "";
    let sourceImageUrl = "";
    let imageBaseName = adId;

    if (mode === "full") {
      const creative = creativeDataMap[adId]?.adcreatives?.data?.[0];
      if (creative) {
        const videoId = creative.object_story_spec?.video_data?.video_id || creative.asset_feed_spec?.videos?.[0]?.video_id;

        if (videoId) {
          videoUrl = videoSourceMap[videoId] || "";
          sourceImageUrl =
            videoPictureMap[videoId] ||
            creative.thumbnail_url ||
            creative.object_story_spec?.video_data?.image_url ||
            creative.asset_feed_spec?.videos?.[0]?.thumbnail_url ||
            "";
          imageBaseName = `${adId}-${videoId}`;
        } else {
          const hash = creative.image_hash || creative.asset_feed_spec?.images?.[0]?.hash;
          sourceImageUrl = hashToUrlMap[hash] || creative.image_url || "";
          imageBaseName = `${adId}-${hash || "image"}`;
        }
      }
    }

    pending.push({
      adId,
      hasInsights,
      adName,
      adsetName,
      campaignName,
      status,
      createdTime,
      designer: resolveDesigner(adName, aliases),
      publisherPlatforms,
      videoUrl,
      sourceImageUrl,
      imageBaseName,
      persistedImageUrl: "",
    });
  }

  // --- 6. Persistência das mídias estáticas ---
  //
  // Fase própria e paralela: antes o download+upload acontecia em série dentro do
  // laço principal, e a fila de pendências nunca cabia no teto de tempo.
  if (mode === "full" && isStorageConfigured(storage)) {
    const uploadTargets = pending.filter(item => {
      if (!item.sourceImageUrl) return false;
      // Já é uma URL nossa (pode acontecer em reprocessamentos) — nada a fazer.
      if (isPermanentMediaUrl(item.sourceImageUrl, storage)) {
        item.persistedImageUrl = item.sourceImageUrl;
        return false;
      }
      return true;
    });

    if (uploadTargets.length > 0) {
      if (onProgress) onProgress(`Salvando ${uploadTargets.length} criativos estáticos no servidor externo...`, 62);

      let completed = 0;
      let failed = 0;
      let budgetExhausted = false;

      await runWithConcurrency(
        uploadTargets.map(item => async () => {
          if (budgetExhausted || wallClockRemainingMs() < DB_WRITE_RESERVE_MS) {
            budgetExhausted = true;
            return;
          }

          const persisted = await persistRemoteMedia(item.sourceImageUrl, item.imageBaseName, storage);
          // `null` = não conseguimos persistir. Deixamos o campo de fora da escrita
          // para não gravar uma URL da Meta que vai expirar.
          if (persisted) item.persistedImageUrl = persisted;
          else failed++;

          completed++;
          if (onProgress && completed % 10 === 0) {
            onProgress(
              `Salvando estáticos (${completed}/${uploadTargets.length})...`,
              62 + Math.floor((completed / uploadTargets.length) * 10)
            );
          }
        }),
        MEDIA_UPLOAD_CONCURRENCY
      );

      if (budgetExhausted) {
        reachedWallClock = true;
        console.log(`[Meta Sync] Orçamento de tempo esgotado nos uploads. ${completed}/${uploadTargets.length} processados; o restante continua na próxima execução.`);
      }
      if (failed > 0) {
        console.warn(`[Meta Sync] ${failed} mídia(s) não puderam ser persistidas; os valores atuais no banco foram preservados.`);
      }
    }
  }

  // --- 7. Escrita dos criativos ---
  let syncedAds = 0;
  const creativeOperations: { type: "upsert" | "updateMany"; adId: string; data: any }[] = [];

  for (const item of pending) {
    const data: any = {};

    if (item.adName) data.adName = item.adName;
    if (item.adsetName) data.adsetName = item.adsetName;
    if (item.campaignName) data.campaignName = item.campaignName;
    if (item.status) data.status = item.status;
    if (item.createdTime) data.createdTime = item.createdTime;
    if (item.designer) data.designer = item.designer;
    if (item.publisherPlatforms) data.publisherPlatforms = item.publisherPlatforms;

    if (item.persistedImageUrl) {
      data.imageUrl = item.persistedImageUrl;
      data.thumbnailUrl = item.persistedImageUrl;
    }

    // mediaType só é afirmado quando de fato inspecionamos o criativo neste ciclo,
    // para não rebaixar um vídeo conhecido a "image" num sync de métricas.
    if (item.videoUrl) {
      data.videoUrl = item.videoUrl;
      data.mediaType = "video";
    } else if (mode === "full" && creativeDataMap[item.adId]) {
      data.mediaType = "image";
    }

    const existing = existingById.get(item.adId);

    if (existing) {
      /**
       * Só grava o que de fato mudou.
       *
       * Sem isto, toda execução dispara um UPDATE por criativo da conta (3.4k),
       * consumindo o teto de tempo em escritas que não alteram nada — era esse o
       * gargalo que impedia a enumeração de status de terminar num único ciclo.
       */
      const changed: any = {};
      for (const [key, value] of Object.entries(data)) {
        const current = (existing as any)[key];
        const isSame =
          value instanceof Date && current instanceof Date
            ? value.getTime() === current.getTime()
            : current === value;
        if (!isSame) changed[key] = value;
      }

      if (Object.keys(changed).length > 0) {
        creativeOperations.push({ type: "updateMany", adId: item.adId, data: changed });
      }
      continue;
    }

    /**
     * Criamos registro novo apenas para anúncios que entregaram na janela ou que
     * estão no ar agora.
     *
     * A enumeração devolve todo o histórico da conta, incluindo arquivados. Criar
     * linha para cada um encheu a tabela com 4.5 mil criativos sem uma única
     * métrica — invisíveis na interface e um peso morto em toda sincronização.
     * Os que já existem no banco continuam recebendo status atualizado acima.
     */
    if (!item.hasInsights && item.status !== "ACTIVE") continue;
    if (!item.adName && !item.hasInsights) continue;

    creativeOperations.push({
      type: "upsert",
      adId: item.adId,
      data: {
        ...data,
        platform: "META",
        adName: item.adName || `Anúncio ${item.adId}`,
        adsetName: item.adsetName || "Desconhecido",
        campaignName: item.campaignName || "Desconhecido",
        status: item.status || "UNKNOWN",
        mediaType: data.mediaType || (item.videoUrl ? "video" : "image"),
      },
    });
  }

  if (creativeOperations.length > 0) {
    if (onProgress) onProgress(`Salvando ${creativeOperations.length} criativos...`, 74);

    // Paralelismo controlado e progresso a cada 100 — antes esta fase era serial
    // e completamente silenciosa, o que a fazia parecer travada por minutos.
    await runWithConcurrency(
      creativeOperations.map(op => async () => {
        await withDbRetry(async () => {
          if (op.type === "upsert") {
            const { platform, ...updatable } = op.data;
            await prisma.adCreative.upsert({
              where: { id: op.adId },
              update: updatable,
              create: { id: op.adId, ...op.data },
            });
          } else {
            await prisma.adCreative.updateMany({ where: { id: op.adId }, data: op.data });
          }
        });
        syncedAds++;
        if (onProgress && syncedAds % 100 === 0) {
          onProgress(
            `Salvando criativos (${syncedAds}/${creativeOperations.length})...`,
            74 + Math.floor((syncedAds / creativeOperations.length) * 5)
          );
        }
      }),
      DB_WRITE_CONCURRENCY
    );
  }

  // --- 8. Métricas ---
  if (onProgress) onProgress("Processando métricas...", 80);

  const metricOperations: any[] = [];

  for (const adId of adIdsWithInsights) {
    const rows = rowsByAdId[adId];
    if (!rows?.length) continue;

    for (const row of rows) {
      if (!row.date_start) continue;

      const spend = parseFloat(row.spend || "0");
      const cpm = parseFloat(row.cpm || "0");
      const ctr = parseFloat(row.ctr || "0"); // Meta já devolve em pontos percentuais
      const cpc = parseFloat(row.cpc || "0");
      const impressions = parseInt(row.impressions || "0");
      const clicks = parseInt(row.clicks || "0");
      const reach = row.reach ? parseInt(row.reach) : 0;
      const frequency = row.frequency ? parseFloat(row.frequency) : 0;

      let purchaseRoas = 0;
      if (row.purchase_roas?.length > 0) {
        const roasData = row.purchase_roas.find((r: any) => r.action_type === "omni_purchase");
        if (roasData) purchaseRoas = parseFloat(roasData.value);
      }

      const getFallbackValue = (arr: any[], types: string[]) => {
        for (const t of types) {
          const obj = arr.find((a: any) => a.action_type === t);
          if (obj) return parseFloat(obj.value);
        }
        return 0;
      };

      let purchases = 0, messages = 0, netOrders = 0, riskApprovedValue = 0;
      let likes = 0, comments = 0, shares = 0, videoViews = 0;
      let videoViews25p = 0, videoViews50p = 0, videoViews75p = 0, videoViews100p = 0;

      if (row.actions) {
        // Pedidos = pagamentos aprovados (payment_approved_cc). O evento
        // `purchase` do pixel conta o checkout, não o pedido aprovado.
        purchases = getFallbackValue(row.actions, [
          PAYMENT_APPROVED_ACTION,
          ...GROSS_VALUE_FALLBACK_ACTIONS,
        ]);

        const msgObj = row.actions.find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d");
        if (msgObj) messages = parseInt(msgObj.value);

        // Pedidos líquidos = aprovados na análise de risco (risk_approved_cc).
        const netOrdersObj = row.actions.find((a: any) => a.action_type === RISK_APPROVED_ACTION);
        if (netOrdersObj) netOrders = parseInt(netOrdersObj.value);

        likes = getFallbackValue(row.actions, ["post_reaction", "like"]);
        comments = getFallbackValue(row.actions, ["post_comment", "comment"]);
        shares = getFallbackValue(row.actions, ["post_engagement", "post", "share"]);
      }

      if (row.video_play_actions) videoViews = getFallbackValue(row.video_play_actions, ["video_view"]);
      else if (row.actions) videoViews = getFallbackValue(row.actions, ["video_view"]);

      if (row.video_p25_watched_actions) videoViews25p = getFallbackValue(row.video_p25_watched_actions, ["video_p25_watched_actions"]);
      if (row.video_p50_watched_actions) videoViews50p = getFallbackValue(row.video_p50_watched_actions, ["video_p50_watched_actions"]);
      if (row.video_p75_watched_actions) videoViews75p = getFallbackValue(row.video_p75_watched_actions, ["video_p75_watched_actions"]);
      if (row.video_p100_watched_actions) videoViews100p = getFallbackValue(row.video_p100_watched_actions, ["video_p100_watched_actions"]);

      let grossValue = 0;
      if (row.action_values) {
        // Receita LÍQUIDA — aprovado na análise de risco. É a métrica central
        // do negócio e a que alimenta metas e categorização de winners.
        const riskApprovedObj = row.action_values.find((a: any) => a.action_type === RISK_APPROVED_ACTION);
        if (riskApprovedObj) riskApprovedValue = parseFloat(riskApprovedObj.value);

        /**
         * Receita BRUTA — pagamento aprovado.
         *
         * Antes vinha de `omni_purchase`, que é o valor do checkout: no período
         * de 01-08/09 isso reportava R$ 680 mil no lugar de R$ 3,36 milhões.
         */
        grossValue = getFallbackValue(row.action_values, [
          PAYMENT_APPROVED_ACTION,
          ...GROSS_VALUE_FALLBACK_ACTIONS,
        ]);
      }

      metricOperations.push({
        adCreativeId: adId,
        dateStart: ymdToUtcDate(row.date_start),
        data: {
          spend, roas: purchaseRoas, cpm, ctr, cpc, impressions, reach, frequency, clicks,
          purchases, netOrders, riskApprovedValue, grossValue, messages, likes, comments,
          shares, videoViews, videoViews25p, videoViews50p, videoViews75p, videoViews100p,
        },
      });
    }
  }

  let syncedMetrics = 0;
  if (metricOperations.length > 0) {
    if (onProgress) onProgress(`Salvando ${metricOperations.length} métricas...`, 90);

    // Upserts em paralelo controlado. Um a um contra o MySQL remoto, alguns
    // milhares de linhas levavam minutos e não cabiam no teto do serverless.
    await runWithConcurrency(
      metricOperations.map(op => async () => {
        await withDbRetry(() => prisma.adDailyMetrics.upsert({
          where: { adCreativeId_date: { adCreativeId: op.adCreativeId, date: op.dateStart } },
          update: op.data,
          create: { adCreativeId: op.adCreativeId, date: op.dateStart, ...op.data },
        }));
        syncedMetrics++;
        if (onProgress && syncedMetrics % 200 === 0) {
          onProgress(
            `Salvando métricas (${syncedMetrics}/${metricOperations.length})...`,
            90 + Math.floor((syncedMetrics / metricOperations.length) * 9)
          );
        }
      }),
      DB_WRITE_CONCURRENCY
    );
  }

  // --- 9. Carimbo de execução ---
  if (!reachedWallClock) {
    const finishedAt = new Date();
    await withDbRetry(() => prisma.systemSettings.update({
      where: { id: 1 },
      data: {
        lastSyncAt: finishedAt,
        ...(mode === "full" ? { lastDeepSyncAt: finishedAt } : { lastFastSyncAt: finishedAt }),
      },
    }));
    if (onProgress) onProgress("Sincronização da Meta concluída!", 100);
  } else {
    if (onProgress) onProgress("Meta: teto de tempo/taxa atingido. O progresso foi salvo; rode novamente para continuar.", 100);
  }

  return { syncedAds, syncedMetrics, reachedLimit: reachedWallClock };
}

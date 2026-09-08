import prisma from "./prisma";
import { loadAliasIndex, resolveDesigner } from "./designer-match";
import { normalizeTikTokStatus } from "./ad-status";
import {
  resolveStorageConfig,
  isStorageConfigured,
  isPermanentMediaUrl,
  persistRemoteMedia,
  runWithConcurrency,
} from "./media-upload";
import { resolveSyncWindow, ymdToUtcDate, parseApiTimestampUtc } from "./date-utils";

const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

/** Teto preventivo, alinhado ao do Meta, para não estourar o limite do serverless. */
const WALL_CLOCK_LIMIT_MS = process.env.IS_LOCAL_CLI === "true" ? 36_000_000 : 180_000;
const DB_WRITE_RESERVE_MS = 25_000;
const MEDIA_UPLOAD_CONCURRENCY = 4;
const DB_WRITE_CONCURRENCY = 5;
const REPORT_PAGE_SIZE = 1000;
const AD_INFO_PAGE_SIZE = 100;

export class TikTokApiError extends Error {
  isRateLimit: boolean;
  constructor(message: string, isRateLimit = false) {
    super(message);
    this.name = "TikTokApiError";
    this.isRateLimit = isRateLimit;
  }
}

export class TikTokWallClockError extends Error {
  constructor() {
    super("Teto de tempo atingido na sincronização do TikTok.");
    this.name = "TikTokWallClockError";
  }
}

async function fetchTikTok(url: string, token: string, attempt = 1): Promise<any> {
  const response = await fetch(url, {
    headers: { "Access-Token": token, "Content-Type": "application/json" },
  });

  const data = await response.json();

  if (data.code !== 0) {
    // 40100 = rate limit; 50000 = erro interno transitório.
    const isRateLimit = data.code === 40100;
    if ((isRateLimit || data.code === 50000) && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
      return fetchTikTok(url, token, attempt + 1);
    }
    throw new TikTokApiError(`${data.message || "TikTok API Error"} (code ${data.code})`, isRateLimit);
  }

  return data.data;
}

async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt >= maxRetries) throw error;
      console.warn(`[TikTok Sync] Falha no banco (tentativa ${attempt}/${maxRetries}): ${error.message}`);
      await new Promise(r => setTimeout(r, initialDelay * attempt));
      attempt++;
    }
  }
}

export async function runTikTokSync(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number
) {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(0, WALL_CLOCK_LIMIT_MS - (Date.now() - startedAt));

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  const advertiserId = settings?.tiktokAdvertiserId;
  const accessToken = settings?.tiktokAccessToken;

  if (!advertiserId || !accessToken) {
    throw new Error("Credenciais do TikTok Ads não configuradas no painel.");
  }

  const storage = resolveStorageConfig(settings);
  if (mode === "full" && !isStorageConfigured(storage)) {
    console.warn(
      "[TikTok Sync] Armazenamento de mídia não configurado. As capas do TikTok são URLs assinadas " +
      "e expiram — o passo de persistência será pulado em vez de gravar links quebrados."
    );
  }

  if (onProgress) onProgress("Conectando ao TikTok...", 3);

  const aliases = await loadAliasIndex();
  const { sinceYmd, untilYmd } = resolveSyncWindow(targetMonth, targetYear);

  let reachedWallClock = false;

  // --- 1. Relatório diário por anúncio ---
  if (onProgress) onProgress(`Buscando relatórios de ${sinceYmd} até ${untilYmd}...`, 8);

  /**
   * `complete_payment` é o evento de receita desta conta; `purchase` /
   * `total_purchase_value` voltam zerados. Apesar do nome, o valor total dos
   * pagamentos vem em `total_complete_payment_rate` — conferido contra
   * `value_per_complete_payment × complete_payment`, que bate exatamente.
   */
  const metricsList = [
    "spend", "cpc", "cpm", "ctr", "conversion", "cost_per_conversion", "clicks",
    "impressions", "reach", "frequency", "likes", "comments", "shares",
    "complete_payment", "total_complete_payment_rate", "total_purchase_value",
    "video_play_actions", "video_views_p25", "video_views_p50",
    "video_views_p75", "video_views_p100",
  ];

  const reportData: any[] = [];

  // A API aceita no máximo 30 dias por consulta.
  const chunks: { start: string; end: string }[] = [];
  {
    let cursorStart = sinceYmd;
    while (cursorStart <= untilYmd) {
      const startDate = new Date(`${cursorStart}T00:00:00Z`);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 29);
      const chunkEnd = endDate.toISOString().slice(0, 10);
      chunks.push({ start: cursorStart, end: chunkEnd > untilYmd ? untilYmd : chunkEnd });

      const next = new Date(endDate);
      next.setUTCDate(next.getUTCDate() + 1);
      cursorStart = next.toISOString().slice(0, 10);
    }
  }

  for (const chunk of chunks) {
    /**
     * Paginação.
     *
     * A versão anterior pedia page_size=1000 e lia só a primeira página, ignorando
     * `page_info.total_page`. Em 8 dias de setembro isso já descartava 626 das
     * 1626 linhas — 38% das métricas do canal sumiam em silêncio.
     */
    let page = 1;
    let totalPages = 1;

    do {
      if (remainingMs() < DB_WRITE_RESERVE_MS) {
        reachedWallClock = true;
        break;
      }

      const reportUrl =
        `${API_BASE}/report/integrated/get/?advertiser_id=${advertiserId}` +
        `&report_type=BASIC&data_level=AUCTION_AD` +
        `&dimensions=${encodeURIComponent(JSON.stringify(["ad_id", "stat_time_day"]))}` +
        `&metrics=${encodeURIComponent(JSON.stringify(metricsList))}` +
        `&start_date=${chunk.start}&end_date=${chunk.end}` +
        `&page=${page}&page_size=${REPORT_PAGE_SIZE}`;

      const res = await fetchTikTok(reportUrl, accessToken);
      if (res?.list) reportData.push(...res.list);

      totalPages = res?.page_info?.total_page || 1;
      if (onProgress) {
        onProgress(`Relatório TikTok ${chunk.start} (página ${page}/${totalPages})...`, 8 + Math.floor((page / Math.max(totalPages, 1)) * 20));
      }
      page++;
    } while (page <= totalPages);

    if (reachedWallClock) break;
  }

  if (reportData.length === 0) {
    if (onProgress) onProgress("TikTok: nenhum dado encontrado neste período.", 100);
    return { success: true, syncedAds: 0, syncedMetrics: 0, reachedLimit: reachedWallClock };
  }

  const adIds = Array.from(new Set(
    reportData.map(row => row.dimensions?.ad_id?.toString()).filter(Boolean)
  )) as string[];

  // --- 2. Informações dos anúncios ---
  if (onProgress) onProgress(`Buscando informações de ${adIds.length} anúncios...`, 32);

  const adsInfoMap: Record<string, any> = {};
  const AD_ID_BATCH = 50;

  for (let i = 0; i < adIds.length; i += AD_ID_BATCH) {
    if (remainingMs() < DB_WRITE_RESERVE_MS) { reachedWallClock = true; break; }

    const batch = adIds.slice(i, i + AD_ID_BATCH);
    const filtering = encodeURIComponent(JSON.stringify({ ad_ids: batch }));

    let page = 1;
    let totalPages = 1;

    try {
      do {
        const adUrl = `${API_BASE}/ad/get/?advertiser_id=${advertiserId}&filtering=${filtering}&page=${page}&page_size=${AD_INFO_PAGE_SIZE}`;
        const res = await fetchTikTok(adUrl, accessToken);
        if (res?.list) {
          res.list.forEach((ad: any) => { adsInfoMap[ad.ad_id] = ad; });
        }
        totalPages = res?.page_info?.total_page || 1;
        page++;
      } while (page <= totalPages);
    } catch (error: any) {
      console.error(`[TikTok Sync] Falha ao buscar info do lote ${i / AD_ID_BATCH}: ${error.message}`);
      if (error instanceof TikTokApiError && error.isRateLimit) { reachedWallClock = true; break; }
    }
  }

  // --- 3. Estado atual no banco ---
  const existingAds = await withDbRetry(() => prisma.adCreative.findMany({
    where: { platform: "TIKTOK" },
    select: { id: true, imageUrl: true, videoUrl: true, mediaType: true },
  }));
  const existingById = new Map(existingAds.map(ad => [ad.id, ad]));

  interface PendingTikTokAd {
    adId: string;
    info: any;
    adName: string;
    designer: string | null;
    status: string;
    createdTime: Date | null;
    videoId: string | null;
    imageId: string | null;
    videoUrl: string;
    sourceCoverUrl: string;
    persistedImageUrl: string;
    mediaType: "video" | "image" | null;
  }

  const safeString = (value: string | undefined | null, maxLen = 190) => (value || "").substring(0, maxLen);

  const pending: PendingTikTokAd[] = [];

  for (const adId of adIds) {
    const info = adsInfoMap[adId];
    if (!info) continue;

    const adName = safeString(info.ad_name) || `TikTok Ad ${adId}`;
    const videoId = info.video_id || null;
    const imageId = Array.isArray(info.image_ids) && info.image_ids.length > 0 ? info.image_ids[0] : null;

    pending.push({
      adId,
      info,
      adName,
      designer: resolveDesigner(adName, aliases),
      // operation_status sozinho devolve ENABLE mesmo com a campanha desligada.
      status: normalizeTikTokStatus(info.operation_status, info.secondary_status),
      // A TikTok devolve "2024-05-16 19:15:08" em UTC, sem indicador de fuso.
      createdTime: parseApiTimestampUtc(info.create_time),
      videoId,
      imageId,
      videoUrl: "",
      sourceCoverUrl: "",
      persistedImageUrl: "",
      mediaType: videoId ? "video" : imageId ? "image" : null,
    });
  }

  // --- 4. Mídias ---
  if (mode === "full") {
    if (onProgress) onProgress("Renovando mídias do TikTok...", 45);

    /**
     * Vídeos são sempre renovados: `preview_url` traz `preview_url_expire_time`
     * de poucas horas. Capas só são rebuscadas quando ainda não estão no nosso
     * armazenamento.
     */
    const mediaTargets = pending.filter(item => {
      const existing = existingById.get(item.adId);
      if (item.videoId) return true;
      if (!item.imageId) return false;
      return !existing || !isPermanentMediaUrl(existing.imageUrl, storage);
    });

    /**
     * As duas rotas de mídia aceitam listas de ids. A versão anterior fazia uma
     * chamada por criativo (283 chamadas sequenciais); em lotes são ~6.
     */
    const MEDIA_ID_BATCH = 50;
    const videoInfoMap: Record<string, any> = {};
    const imageInfoMap: Record<string, any> = {};

    const videoIds = Array.from(new Set(mediaTargets.map(i => i.videoId).filter(Boolean))) as string[];
    const imageIds = Array.from(new Set(
      mediaTargets.filter(i => !i.videoId).map(i => i.imageId).filter(Boolean)
    )) as string[];

    const fetchInfoBatches = async (
      ids: string[],
      path: string,
      param: string,
      key: string,
      target: Record<string, any>,
      label: string
    ) => {
      for (let i = 0; i < ids.length; i += MEDIA_ID_BATCH) {
        if (remainingMs() < DB_WRITE_RESERVE_MS) { reachedWallClock = true; return; }

        const batch = ids.slice(i, i + MEDIA_ID_BATCH);
        try {
          const res = await fetchTikTok(
            `${API_BASE}${path}?advertiser_id=${advertiserId}&${param}=${encodeURIComponent(JSON.stringify(batch))}`,
            accessToken
          );
          for (const entry of res?.list || []) {
            if (entry?.[key]) target[entry[key]] = entry;
          }
        } catch (error: any) {
          console.error(`[TikTok Sync] Falha no lote de ${label}: ${error.message}`);
          if (error instanceof TikTokApiError && error.isRateLimit) { reachedWallClock = true; return; }
        }

        if (onProgress) {
          onProgress(
            `Renovando ${label} (${Math.min(i + MEDIA_ID_BATCH, ids.length)}/${ids.length})...`,
            45 + Math.floor((i / Math.max(ids.length, 1)) * 15)
          );
        }
      }
    };

    await fetchInfoBatches(videoIds, "/file/video/ad/info/", "video_ids", "video_id", videoInfoMap, "vídeos");
    await fetchInfoBatches(imageIds, "/file/image/ad/info/", "image_ids", "image_id", imageInfoMap, "imagens");

    for (const item of mediaTargets) {
      if (item.videoId) {
        const video = videoInfoMap[item.videoId];
        if (video) {
          /**
           * O campo é `preview_url` — não existe `video_url` nesta API.
           * Ler o nome errado é o motivo de nenhum dos 283 criativos do TikTok
           * ter link de vídeo gravado.
           */
          item.videoUrl = video.preview_url || "";
          item.sourceCoverUrl = video.video_cover_url || video.cover_url || "";
        }
      } else if (item.imageId) {
        item.sourceCoverUrl = imageInfoMap[item.imageId]?.image_url || "";
      }
    }

    // Persistência dos estáticos/capas no servidor externo, em paralelo.
    if (isStorageConfigured(storage)) {
      const uploadTargets = pending.filter(item => item.sourceCoverUrl);

      if (uploadTargets.length > 0) {
        if (onProgress) onProgress(`Salvando ${uploadTargets.length} mídias no servidor externo...`, 62);

        let failed = 0;
        let budgetExhausted = false;

        await runWithConcurrency(
          uploadTargets.map(item => async () => {
            if (budgetExhausted || remainingMs() < DB_WRITE_RESERVE_MS) {
              budgetExhausted = true;
              return;
            }
            const base = item.videoId ? `tiktok-vid-${item.videoId}` : `tiktok-img-${item.imageId}`;
            const persisted = await persistRemoteMedia(item.sourceCoverUrl, base, storage);
            // Em caso de falha, deixamos o campo de fora — a URL de origem expira.
            if (persisted) item.persistedImageUrl = persisted;
            else failed++;
          }),
          MEDIA_UPLOAD_CONCURRENCY
        );

        if (budgetExhausted) reachedWallClock = true;
        if (failed > 0) {
          console.warn(`[TikTok Sync] ${failed} mídia(s) não puderam ser persistidas; os valores atuais foram preservados.`);
        }
      }
    }
  }

  // --- 5. Escrita dos criativos ---
  if (onProgress) onProgress("Salvando criativos do TikTok...", 74);

  let syncedAds = 0;
  const CHUNK = 10;

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    await withDbRetry(async () => {
      for (const item of chunk) {
        const update: any = {
          adName: item.adName,
          adsetName: safeString(item.info.adgroup_name) || "Desconhecido",
          campaignName: safeString(item.info.campaign_name) || "Desconhecido",
          platform: "TIKTOK",
          publisherPlatforms: "tiktok",
        };

        if (item.status !== "UNKNOWN") update.status = item.status;
        if (item.createdTime) update.createdTime = item.createdTime;
        if (item.designer) update.designer = item.designer;
        if (item.persistedImageUrl) {
          update.imageUrl = item.persistedImageUrl;
          update.thumbnailUrl = item.persistedImageUrl;
        }
        if (item.videoUrl) update.videoUrl = item.videoUrl;
        // mediaType nunca era gravado — todos os 283 criativos do TikTok ficaram
        // como "image", inclusive os de vídeo.
        if (item.mediaType) update.mediaType = item.mediaType;

        await prisma.adCreative.upsert({
          where: { id: item.adId },
          update,
          create: {
            id: item.adId,
            ...update,
            status: item.status,
            mediaType: item.mediaType || "image",
          },
        });
      }
    });
    syncedAds += chunk.length;
  }

  // --- 6. Métricas ---
  if (onProgress) onProgress("Salvando métricas do TikTok...", 86);

  const metricOperations: any[] = [];

  for (const row of reportData) {
    const adId = row.dimensions?.ad_id?.toString();
    const dayStr = row.dimensions?.stat_time_day?.split(" ")[0];
    if (!adId || !dayStr) continue;

    const m = row.metrics || {};
    const num = (value: any) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const int = (value: any) => {
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const spend = num(m.spend);
    const impressions = int(m.impressions);

    // Receita: pagamentos concluídos, com o evento de compra como reserva
    // para contas que usem o outro funil.
    const purchaseValue = num(m.total_complete_payment_rate) || num(m.total_purchase_value);
    const payments = int(m.complete_payment);
    const conversions = payments || int(m.conversion);

    metricOperations.push({
      adCreativeId: adId,
      dateStart: ymdToUtcDate(dayStr),
      data: {
        spend,
        roas: spend > 0 ? purchaseValue / spend : 0,
        // A TikTok já devolve CTR em pontos percentuais, igual à Meta.
        // A divisão por 100 que existia aqui deixava a mesma coluna com duas unidades.
        ctr: num(m.ctr),
        cpc: num(m.cpc),
        cpm: num(m.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0),
        impressions,
        clicks: int(m.clicks),
        reach: int(m.reach),
        // Sem valor reportado, grava 0 — antes assumia 1, inventando frequência.
        frequency: num(m.frequency),
        purchases: conversions,
        netOrders: conversions,
        grossValue: purchaseValue,
        /**
         * A análise de risco é um funil próprio da Allugator, rodando sobre o
         * pixel da Meta (`risk_approved_cc`). A TikTok não tem equivalente, então
         * a receita líquida fica em zero em vez de repetir a bruta — que era o
         * que inflava a receita aprovada do canal.
         */
        riskApprovedValue: 0,
        likes: int(m.likes),
        comments: int(m.comments),
        shares: int(m.shares),
        videoViews: int(m.video_play_actions),
        videoViews25p: int(m.video_views_p25),
        videoViews50p: int(m.video_views_p50),
        videoViews75p: int(m.video_views_p75),
        videoViews100p: int(m.video_views_p100),
      },
    });
  }

  let syncedMetrics = 0;
  const knownAdIds = new Set(pending.map(p => p.adId));

  // Sem o criativo o upsert viola a FK, então filtramos antes de escrever.
  const writableMetrics = metricOperations.filter(
    op => knownAdIds.has(op.adCreativeId) || existingById.has(op.adCreativeId)
  );
  const orphanCount = metricOperations.length - writableMetrics.length;
  if (orphanCount > 0) {
    console.warn(`[TikTok Sync] ${orphanCount} linha(s) de métrica ignoradas: o anúncio não existe mais na conta.`);
  }

  await runWithConcurrency(
    writableMetrics.map(op => async () => {
      await withDbRetry(() => prisma.adDailyMetrics.upsert({
        where: { adCreativeId_date: { adCreativeId: op.adCreativeId, date: op.dateStart } },
        update: op.data,
        create: { adCreativeId: op.adCreativeId, date: op.dateStart, ...op.data },
      }));
      syncedMetrics++;
      if (onProgress && syncedMetrics % 200 === 0) {
        onProgress(
          `Salvando métricas (${syncedMetrics}/${writableMetrics.length})...`,
          86 + Math.floor((syncedMetrics / writableMetrics.length) * 13)
        );
      }
    }),
    DB_WRITE_CONCURRENCY
  );

  if (!reachedWallClock) {
    if (onProgress) onProgress("Sincronização do TikTok concluída!", 100);
  } else {
    if (onProgress) onProgress("TikTok: teto de tempo/taxa atingido. O progresso foi salvo.", 100);
  }

  return { success: true, syncedAds, syncedMetrics, reachedLimit: reachedWallClock };
}

import prisma from "./prisma";
import { logExternalFailure } from "./external-log";
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
  resolveConversions,
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
  META_CREATIVE_MEDIA_FIELDS,
  META_VIDEO_MEDIA_FIELDS,
  creativeVideoId,
  pickVideoCover,
  staticImageHash,
  staticImageSource,
  videoCoverFallback,
} from "./meta-media-source";
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

/**
 * Quantos dias recentes são lidos em TODA passada, antes de qualquer outro.
 *
 * Dois: hoje e ontem. Hoje porque é o número que a tela mostra e o que o
 * operador confere; ontem porque ainda recebe receita aprovada com atraso de
 * horas. Os demais dias do mês entram por rodízio — ver a montagem da ordem de
 * leitura na fase 1.
 */
const HEAD_DAYS = 2;

/** Uploads simultâneos de mídia. Equilibra vazão e educação com o cPanel. */
const MEDIA_UPLOAD_CONCURRENCY = 4;

/** Margem de tempo reservada para as escritas no banco no fim da execução. */
const DB_WRITE_RESERVE_MS = 25000;

/**
 * Piso de tempo reservado para o upload das artes.
 *
 * A fase de mídia é a última antes das escritas e só perguntava "sobrou
 * tempo?". Como as fases anteriores — enumeração da conta inteira, busca de
 * criativos, resolução de hashes e vídeos — consomem o orçamento todo, ela
 * encontrava zero e TODA tarefa de upload retornava sem fazer nada. Era por
 * isso que 179 criativos ativos seguiam sem arte por meses: o passo nunca
 * rodava de fato, em nenhuma execução.
 *
 * Com o piso, as fases de leitura param mais cedo e devolvem o chão para o
 * upload. Ler menos criativos numa execução é recuperável no ciclo seguinte;
 * anúncio ativo sem imagem no painel, não.
 */
const MEDIA_BUDGET_MS = 60000;

/** Tempo mínimo que as fases de leitura devem deixar para trás. */
const READ_PHASE_FLOOR_MS = MEDIA_BUDGET_MS + DB_WRITE_RESERVE_MS;

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
/**
 * O único status que interessa: o que está no ar AGORA.
 *
 * Antes a enumeração pedia os doze status da conta, o que trazia o histórico
 * inteiro — 13 mil anúncios, dos quais 8,6% ativos — e consumia o orçamento de
 * tempo antes de qualquer coisa útil acontecer.
 *
 * Tudo que não está no ar fica de fora, inclusive os status de análise: um
 * anúncio em revisão vira ACTIVE em horas e entra no ciclo seguinte, sem que
 * seja preciso criar uma linha para algo que ainda não existe de fato.
 *
 * O que já foi sincronizado dos pausados continua gravado, para consulta. Sair
 * desta lista é o que marca a pausa — ver a reconciliação após a leitura.
 */
const LIVE_EFFECTIVE_STATUSES = ["ACTIVE"];

export async function runMetaSync(
  mode: "full" | "metrics" = "full",
  onProgress?: (message: string, percentage: number) => void,
  targetMonth?: number,
  targetYear?: number
) {
  resetWallClock();

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  // Os eventos de conversão vêm do painel; resolvidos uma vez, aqui, porque o
  // laço de métricas abaixo os consulta por linha.
  const conversions = resolveConversions(settings);
  const RISK_APPROVED_ACTION = conversions.riskApproved.actionType;
  const PAYMENT_APPROVED_ACTION = conversions.paymentApproved.actionType;

  // Painel apenas: credencial é configuração de sistema, não de ambiente.
  let metaAccountId = settings?.metaAdAccountId || undefined;
  const metaToken = settings?.metaAccessToken || undefined;

  if (metaAccountId && !metaAccountId.startsWith("act_")) {
    metaAccountId = `act_${metaAccountId}`;
  }

  if (!metaAccountId || !metaToken) {
    throw new Error("Credenciais do Meta Ads não configuradas em Configurações › API.");
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

  const allDays = eachDayYmd(sinceYmd, untilYmd);

  /**
   * Quais dias já têm métricas DESTE canal.
   *
   * Antes isso era uma contagem por dia sem filtrar plataforma: bastava o
   * TikTok gravar a data primeiro para o Meta pular aquele dia permanentemente.
   * Também era uma query por dia; agora é uma só.
   */
  const daysWithData = new Set<string>();
  if (allDays.length > 0) {
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

  /*
   * A ordem de leitura — e por que o mês inteiro não cabe mais numa passada.
   *
   * O laço lia do dia 1º para frente e parava quando o relógio estourava, de
   * modo que o sacrificado era sempre o fim da fila: o dia corrente. Medido em
   * 16/09/2026, ler o mês custou 187,9s contra um teto de 180s — e o custo
   * cresce ~11s por dia que passa no calendário, então o corte chega mais cedo
   * a cada dia do mês e desaparece sozinho no dia 1º seguinte. Era por isso que
   * o painel ficava sem os números de hoje enquanto ontem estava inteiro.
   *
   * Reordenar não resolve o estouro, só escolhe quem perde. Então a leitura
   * passa a ser dividida, como já são métricas e mídia:
   *
   *   - CABEÇA: os dias mais recentes, lidos em TODA passada. São os que a tela
   *     mostra e os únicos que ainda mudam de hora em hora.
   *   - CAUDA: o resto do mês, em fatias que revezam entre as passadas,
   *     retomando de onde a anterior parou (`lastBackfillDayYmd`).
   *
   * O mês continua sendo relido por inteiro — exigência da reatribuição
   * documentada no topo deste arquivo —, só que ao longo de algumas passadas em
   * vez de uma. Com as métricas rodando a cada 30 min, a cauda fecha um ciclo a
   * cada ~1h30, folgado para um atraso que se mede em dias.
   */
  const newestFirst = [...allDays].reverse();
  const head = newestFirst.slice(0, HEAD_DAYS);
  const tail = newestFirst.slice(HEAD_DAYS);

  const resumeAt = tail.indexOf(settings?.lastBackfillDayYmd || "");
  const rotatedTail = resumeAt > 0 ? [...tail.slice(resumeAt), ...tail.slice(0, resumeAt)] : tail;

  const orderedDays = [...head, ...rotatedTail];

  let skippedDays = 0;
  let tailProcessed = 0;
  let daysRead = 0;

  for (let i = 0; i < orderedDays.length; i++) {
    const dayYmd = orderedDays[i];
    const isTail = i >= head.length;

    const isWithinReattribution = isCurrentMonth || dayYmd > reattributionCutoffYmd;

    if (!isWithinReattribution && daysWithData.has(dayYmd)) {
      skippedDays++;
      if (isTail) tailProcessed++;
      continue;
    }

    /*
     * O piso de tempo, que existia em todas as fases de leitura menos nesta.
     *
     * Sem ele, esta fase só parava quando a própria chamada à Meta estourava os
     * 180s — ou seja, consumia o orçamento inteiro e não sobrava chão para
     * enumerar os anúncios no ar, resolver vídeos e subir as artes. Esses
     * passos vinham sendo pulados em silêncio, a cada execução.
     */
    if (wallClockRemainingMs() < READ_PHASE_FLOOR_MS) {
      if (onProgress) {
        onProgress("Fatia de dias concluída; o resto do mês entra na próxima passada.", 26);
      }
      break;
    }

    try {
      if (onProgress) {
        onProgress(`Buscando insights de ${dayYmd}...`, 6 + Math.floor((i / orderedDays.length) * 20));
      }

      const timeRangeStr = encodeURIComponent(JSON.stringify({ since: dayYmd, until: dayYmd }));
      let metaUrl: string | null = `https://graph.facebook.com/v19.0/${metaAccountId}/insights?level=ad&time_range=${timeRangeStr}&time_increment=1&fields=${insightFields}&limit=500&access_token=${metaToken}`;

      while (metaUrl) {
        const metaData = await throttledFetch(metaUrl);
        if (!metaData) break;
        insightRows.push(...(metaData.data || []));
        metaUrl = metaData.paging?.next || null;
      }

      daysRead++;
      if (isTail) tailProcessed++;
    } catch (err: any) {
      if (isRateOrTimeLimit(err)) {
        if (onProgress) onProgress("Teto de tempo/taxa atingido. Salvando o progresso obtido...", 26);
        reachedWallClock = true;
        break;
      }
      throw err;
    }
  }

  /*
   * Onde a cauda retoma na próxima passada.
   *
   * Gravado só para o mês corrente: um backfill de mês passado passa por aqui
   * com outra janela e deixaria o cursor apontando para um dia que o ciclo
   * normal nem enxerga.
   */
  if (isCurrentMonth && rotatedTail.length > 0) {
    const nextTailDay = rotatedTail[tailProcessed % rotatedTail.length];

    /*
     * Uma tentativa só, de propósito — sem `withDbRetry`.
     *
     * Perder o cursor custa repetir uma fatia na passada seguinte, não a
     * corretude. Retentar cinco vezes gastaria até 20s da reserva que existe
     * para a mídia e as escritas, isto é, trocaria algo descartável por algo
     * que não é.
     */
    await prisma.systemSettings
      .update({ where: { id: 1 }, data: { lastBackfillDayYmd: nextTailDay } })
      .catch((err: any) => {
        console.warn("[Meta Sync] Cursor da cauda não gravado; a próxima passada recomeça pelo dia mais recente:", err?.message);
      });
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
  const videoCoverMap: Record<string, string> = {};
  const videoSourceMap: Record<string, string> = {};
  const adsetPlatformsMap: Record<string, string> = {};

  // --- 3. Enumeração dos anúncios no ar ---
  //
  // O status vem daqui, e não de chamadas em lote por ID: aquelas eram restritas
  // aos anúncios com entrega no mês, então anúncios sem entrega nunca tinham
  // status atualizado e 1721 criativos ficaram gravados como "UNKNOWN".
  //
  // `enumerationComplete` existe para a reconciliação: marcar como pausado quem
  // não apareceu só é correto se a leitura foi até o fim. Cortada no meio por
  // tempo ou erro, a ausência não prova nada — e agir sobre ela pausaria em
  // massa anúncios que estão no ar.
  let enumerationComplete = false;

  if (!reachedWallClock) {
    if (onProgress) onProgress("Enumerando anúncios no ar...", 28);

    try {
      const statusFilter = encodeURIComponent(JSON.stringify([
        { field: "ad.effective_status", operator: "IN", value: LIVE_EFFECTIVE_STATUSES },
      ]));
      let adsUrl: string | null = `https://graph.facebook.com/v19.0/${metaAccountId}/ads?fields=id,name,status,effective_status,created_time,adset{id,name},campaign{id,name}&filtering=${statusFilter}&limit=500&access_token=${metaToken}`;
      let pages = 0;

      while (adsUrl && pages < 60) {
        // Cede o chão reservado para o upload das artes.
        if (wallClockRemainingMs() < READ_PHASE_FLOOR_MS) { reachedWallClock = true; break; }

        const page = await throttledFetch(adsUrl);
        if (!page) break;

        if (page.error) {
          console.warn(`[Meta Sync] Enumeração de anúncios indisponível: ${page.error.message}`);
          await logExternalFailure({
            service: "Meta Ads",
            operation: "enumerar anúncios da conta",
            error: page.error,
            endpoint: adsUrl,
            context: { conta: metaAccountId, paginasLidas: pages },
          });
          break;
        }

        for (const ad of page.data || []) {
          adMetaMap[ad.id] = ad;
        }

        adsUrl = page.paging?.next || null;
        pages++;
        if (onProgress) onProgress(`Enumerando anúncios no ar (${Object.keys(adMetaMap).length})...`, 28);
      }

      // Sem próxima página e sem erro: a lista do que está no ar está completa.
      if (!adsUrl) enumerationComplete = true;
    } catch (err: any) {
      /*
       * Limite de taxa também é declarado — como WARNING, porque a próxima
       * execução resolve. Antes ele só marcava `reachedWallClock` em silêncio,
       * e uma sync que parou no meio por rate limit ficava indistinguível de
       * uma que terminou.
       */
      await logExternalFailure({
        service: "Meta Ads",
        operation: "enumerar anúncios da conta",
        error: err,
        context: { conta: metaAccountId, anunciosLidos: Object.keys(adMetaMap).length },
      });

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

  /*
   * Reconciliação: quem saiu do ar.
   *
   * A enumeração agora traz só o que está no ar, então a ausência de um anúncio
   * passa a ser informação — é o único sinal de que ele foi pausado. Sem este
   * passo, todo anúncio pausado desde a mudança ficaria gravado como ACTIVE
   * para sempre, e o painel mostraria como ativa uma estrutura que não existe.
   *
   * Só roda com a leitura completa: cortada no meio, a ausência não prova nada.
   */
  if (enumerationComplete && mode === "full") {
    const wentOffAir = existingAds
      .filter(ad => (ad.status === "ACTIVE" || ad.status === "REVIEW") && !adMetaMap[ad.id])
      .map(ad => ad.id);

    if (wentOffAir.length > 0) {
      if (onProgress) onProgress(`Marcando ${wentOffAir.length} anúncios que saíram do ar...`, 33);

      // Em lotes: um IN com milhares de ids trava o planejador do MySQL.
      for (let i = 0; i < wentOffAir.length; i += 500) {
        await withDbRetry(() => prisma.adCreative.updateMany({
          where: { id: { in: wentOffAir.slice(i, i + 500) } },
          data: { status: "PAUSED" },
        }));
      }

      console.log(`[Meta Sync] ${wentOffAir.length} anúncio(s) saíram do ar e foram marcados como pausados.`);
    }
  }

  // --- 4. Criativos e mídias ---
  //
  // A fila é montada só agora porque também inclui criativos descobertos pela
  // enumeração, que ainda não existem no banco e por isso não têm mídia alguma.
  /*
   * A fila de mídia, em três origens — e sem repetição.
   *
   * A terceira origem existia como furo: um criativo JÁ GRAVADO, ativo e sem
   * entrega na janela não entrava em lista nenhuma. Não estava em
   * `adIdsWithInsights` (não tem insights) e a segunda origem exige
   * `!existingById.has(id)`. Anúncio ativo, sem arte no painel, que nenhum sync
   * jamais tentava buscar.
   */
  /*
   * A fila de criativos: só o que está no ar.
   *
   * `adMetaMap` já contém apenas anúncios no ar, então estar nele é o critério.
   * A origem antiga "teve entrega na janela" saiu como porta de entrada
   * independente: um anúncio que gastou no dia 3 e foi pausado no dia 4 não
   * precisa de arte nova — ele continua no banco com a arte que já tinha, e suas
   * métricas seguem sendo gravadas normalmente mais adiante.
   *
   * O teto por execução some junto: sem o passivo histórico, a fila é da ordem
   * de centenas, não de milhares, e cabe inteira num ciclo.
   */
  const refreshAdIds = mode === "full"
    ? Object.keys(adMetaMap).filter(id => needsMediaRefresh(existingById.get(id)))
    : [];

  if (!reachedWallClock && mode === "full" && refreshAdIds.length > 0) {
    if (onProgress) onProgress(`Processando ${refreshAdIds.length} criativos pendentes...`, 35);

    try {
      for (let i = 0; i < refreshAdIds.length; i += BATCH_SIZE) {
        // Cede o chão reservado para o upload das artes.
        if (wallClockRemainingMs() < READ_PHASE_FLOOR_MS) { reachedWallClock = true; break; }

        const batchIds = refreshAdIds.slice(i, i + BATCH_SIZE);
        const data = await fetchWithBisection(batchIds, (ids) =>
          `https://graph.facebook.com/v19.0/?ids=${ids}&fields=${META_CREATIVE_MEDIA_FIELDS}&access_token=${metaToken}`
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
      const videoId = creativeVideoId(creative);
      if (videoId) videoIds.add(videoId);
      else {
        const hash = staticImageHash(creative);
        if (hash) imageHashes.add(hash);
      }
    });

    if (!reachedWallClock && imageHashes.size > 0) {
      if (onProgress) onProgress(`Resolvendo URLs de ${imageHashes.size} imagens...`, 48);
      const hashesArray = Array.from(imageHashes);
      try {
        for (let i = 0; i < hashesArray.length; i += BATCH_SIZE) {
        // Cede o chão reservado para o upload das artes.
        if (wallClockRemainingMs() < READ_PHASE_FLOOR_MS) { reachedWallClock = true; break; }

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
          // Cede o chão reservado para o upload das artes.
          if (wallClockRemainingMs() < READ_PHASE_FLOOR_MS) { reachedWallClock = true; break; }

          const batchIds = videoIdsArray.slice(i, i + BATCH_SIZE);
          const data = await fetchWithBisection(batchIds, (ids) =>
            `https://graph.facebook.com/v19.0/?ids=${ids}&fields=${META_VIDEO_MEDIA_FIELDS}&access_token=${metaToken}`
          );
          if (data) {
            for (const videoId of batchIds) {
              const cover = pickVideoCover(data[videoId]?.thumbnails?.data);
              if (cover) videoCoverMap[videoId] = cover;
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
        const videoId = creativeVideoId(creative);

        if (videoId) {
          videoUrl = videoSourceMap[videoId] || "";
          /*
           * A capa do vídeo, em ordem de tamanho real. Tanto `thumbnail_url` do
           * criativo (64x64) quanto o campo `picture` do vídeo (160x284, medido)
           * saíram da lista: os dois são miniaturas, e qualquer um deles na
           * cadeia bastava para a capa da peça ser gravada como permanente e
           * nunca mais renovada — ilegível para a leitura visual da IA.
           *
           * `thumbnails` é a única fonte que devolve o quadro em resolução
           * cheia (1080x1920 na conta). O que sobra atrás dela é fallback, e
           * `persistRemoteMedia` recusa o que ainda assim vier pequeno.
           */
          sourceImageUrl = videoCoverMap[videoId] || videoCoverFallback(creative);
          imageBaseName = `${adId}-${videoId}`;
        } else {
          sourceImageUrl = staticImageSource(creative, hashToUrlMap);
          imageBaseName = `${adId}-${staticImageHash(creative) || "image"}`;
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
  // O painel precisa saber o que aconteceu com as artes: uma sync "concluída"
  // que deixou 150 peças sem imagem não é uma sync bem-sucedida.
  let mediaReport = { uploaded: 0, failed: 0, withoutSource: 0, pending: 0 };

  //
  // Fase própria e paralela: antes o download+upload acontecia em série dentro do
  // laço principal, e a fila de pendências nunca cabia no teto de tempo.
  if (mode === "full" && isStorageConfigured(storage)) {
    // Sem URL de origem não há o que subir. Contado e reportado em vez de
    // descartado em silêncio: era assim que os carrosséis desapareciam.
    const withoutSource: string[] = [];

    const uploadTargets = pending.filter(item => {
      if (!item.sourceImageUrl) {
        // Só conta quem a API respondeu: sem creative não houve o que resolver.
        if (creativeDataMap[item.adId]) withoutSource.push(item.adId);
        return false;
      }
      // Já é uma URL nossa (pode acontecer em reprocessamentos) — nada a fazer.
      if (isPermanentMediaUrl(item.sourceImageUrl, storage)) {
        item.persistedImageUrl = item.sourceImageUrl;
        return false;
      }
      return true;
    });

    if (withoutSource.length > 0) {
      console.warn(
        `[Meta Sync] ${withoutSource.length} criativo(s) sem URL de imagem resolvível — ficarão sem arte no painel. ` +
        `Primeiros: ${withoutSource.slice(0, 10).join(", ")}`
      );
    }

    /*
     * Ordem da fila por urgência, e não pela ordem em que os anúncios apareceram.
     *
     * O orçamento de tempo interrompe a fila no meio, e antes o corte caía
     * sempre nos anúncios novos: eles entram no fim da lista de pendentes,
     * depois de todo o passivo de renovação. Resultado: peça recém-lançada,
     * ativa e gastando, sem arte nenhuma no painel — enquanto o tempo era gasto
     * renovando a URL de quem já estava visível.
     *
     * Quem não tem imagem alguma no banco está invisível AGORA; quem tem uma
     * URL de plataforma ainda aparece e só expira depois; quem já está no nosso
     * servidor é o menos urgente de todos.
     */
    const uploadPriority = (adId: string): number => {
      const existing = existingById.get(adId);
      if (!existing?.imageUrl) return 0;
      if (!isPermanentMediaUrl(existing.imageUrl, storage)) return 1;
      return 2;
    };

    uploadTargets.sort((a, b) => uploadPriority(a.adId) - uploadPriority(b.adId));

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
        // Quantas das que ficaram para trás estão invisíveis no painel: é o
        // número que diz se o corte doeu ou se só adiou uma renovação.
        const pendingInvisible = uploadTargets
          .slice(completed)
          .filter(item => uploadPriority(item.adId) === 0).length;

        console.warn(
          `[Meta Sync] Orçamento de tempo esgotado nos uploads: ${completed}/${uploadTargets.length} processados. ` +
          `${pendingInvisible} criativo(s) ainda sem arte alguma continuam na fila da próxima execução ` +
          `(as prioridades vão primeiro, então este número cai a cada ciclo).`
        );
      }
      if (failed > 0) {
        console.warn(`[Meta Sync] ${failed} mídia(s) não puderam ser persistidas; os valores atuais no banco foram preservados.`);
      }

      mediaReport = {
        uploaded: completed - failed,
        failed,
        withoutSource: withoutSource.length,
        pending: budgetExhausted ? uploadTargets.length - completed : 0,
      };
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
     * Linha nova SÓ para anúncio no ar.
     *
     * Antes bastava ter entregado na janela, o que criava registro para peça já
     * pausada — exatamente o que enchia a tabela de passado. Quem já tem linha
     * continua sendo atualizado acima, com métricas e tudo; o que não existe
     * não passa a existir por causa de um gasto antigo.
     *
     * Consequência assumida: um anúncio que estreou e foi pausado entre duas
     * execuções nunca ganha linha, e como `AdDailyMetrics` depende dela por
     * chave estrangeira, o gasto desse intervalo não é registrado. Com o ciclo
     * de 30 minutos a janela é estreita, e a alternativa — gravar todo pausado
     * que já gastou — é o passivo que se decidiu não ter.
     */
    if (item.status !== "ACTIVE") continue;
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

  /*
   * Só métricas de anúncio que tem linha.
   *
   * `AdDailyMetrics.adCreativeId` é chave estrangeira para `AdCreative`, então
   * uma métrica de anúncio sem linha não é "um dado a menos": é uma violação
   * que derruba a gravação inteira. Como agora só criamos linha para o que está
   * no ar, o gasto de um pausado que nunca teve linha simplesmente não entra —
   * de propósito, e sem levar junto as métricas de todo o resto.
   */
  const knownCreativeIds = new Set<string>([
    ...existingById.keys(),
    ...creativeOperations.filter(op => op.type === "upsert").map(op => op.adId),
  ]);
  let metricsSkipped = 0;

  for (const adId of adIdsWithInsights) {
    const rows = rowsByAdId[adId];
    if (!rows?.length) continue;

    if (!knownCreativeIds.has(adId)) {
      metricsSkipped++;
      continue;
    }

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

  if (metricsSkipped > 0) {
    console.log(
      `[Meta Sync] ${metricsSkipped} anúncio(s) com entrega na janela não têm linha de criativo ` +
      `(pausados antes de serem vistos) — suas métricas não foram gravadas.`
    );
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

  // --- 9. Relato final ---
  // O carimbo de `lastSyncAt` não é feito aqui: quem grava é `runSync()`, uma
  // vez por execução, depois de todas as fontes. Dois escritores para o mesmo
  // campo já produziram estado incoerente no banco.
  if (!reachedWallClock) {
    if (onProgress) onProgress("Sincronização da Meta concluída!", 100);
  } else {
    if (onProgress) onProgress("Meta: teto de tempo/taxa atingido. O progresso foi salvo; rode novamente para continuar.", 100);
  }

  return {
    syncedAds,
    syncedMetrics,
    reachedLimit: reachedWallClock,
    media: mediaReport,
    // Quantos dias do mês esta passada leu, de quantos existem. A leitura é
    // fatiada de propósito, então `daysRead < daysTotal` é o estado normal —
    // e o resumo precisa dizer isso, senão parece dado faltando.
    daysRead,
    daysTotal: allDays.length,
  };
}

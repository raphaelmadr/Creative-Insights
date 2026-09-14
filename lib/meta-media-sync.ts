/**
 * A passada de mídia da Meta, separada do sync de métricas.
 *
 * Existe porque a mídia nunca chegava a rodar. Medido em 14/09/2026: de 100
 * sincronizações iniciadas, 2 concluíram — e as duas relataram "Meta: 0
 * criativos". Meta e TikTok reservam 180s cada e rodam em sequência dentro de
 * uma rota de `maxDuration = 300`, então os 180s da Meta eram consumidos
 * inteiros pelas fases de leitura (insights do mês e enumeração dos 13 mil
 * anúncios da conta) e as fases de criativo e mídia nunca começavam. 89 vídeos
 * ficaram sem capa alguma — 78 deles no ar — embora a API oferecesse quadros de
 * 1080x1920 para todos eles.
 *
 * Aqui não há insights nem enumeração da conta: a fila sai do banco, e o tempo
 * todo é da mídia. A regra de qual arte usar não é reescrita — vem de
 * `meta-media-source`, a mesma que o sync e a correção do passivo usam.
 *
 * O que cada peça precisa ter, em ordem: a arte estática em resolução real, ou
 * a capa do vídeo em resolução real, ou o link do vídeo no servidor da própria
 * rede. O arquivo de vídeo NÃO é copiado para o nosso servidor — é pesado e
 * estouraria a cota da hospedagem —, então seu link é renovado a cada passada.
 */

import prisma from "./prisma";
import { throttledFetch, resetWallClock } from "./throttled-fetch";
import {
  isPermanentMediaUrl,
  isStorageConfigured,
  persistRemoteMedia,
  resolveStorageConfig,
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

/** Teto próprio, abaixo do `maxDuration = 300` da rota. */
const ROUTE_BUDGET_MS = 270_000;

/**
 * Chão que as leituras devem deixar para o upload e as escritas.
 *
 * 100s não é folga: é o que faz as leituras pararem por volta dos 170s, antes
 * do teto de 180s que o próprio `throttledFetch` impõe e que faria a fase
 * seguinte morrer com exceção em vez de terminar o que já estava na mão.
 */
const READ_FLOOR_MS = 100_000;
const DB_WRITE_RESERVE_MS = 25_000;

/** Teto do endpoint `?ids=` da Graph API. */
const BATCH_SIZE = 50;
const UPLOAD_CONCURRENCY = 6;

/**
 * Quantas peças uma passada tenta resolver.
 *
 * O passivo é grande (milhares de peças pausadas e antigas) e não cabe num
 * ciclo. Com a fila ordenada por urgência, o teto por execução faz o passivo
 * cair a cada 30 minutos sem que uma execução tente abraçar tudo e não termine
 * nada.
 */
const MAX_TARGETS_PER_RUN = 1200;

/**
 * O criativo como a Graph API o devolve.
 *
 * Deliberadamente frouxo: a forma muda conforme o tipo da peça (estático,
 * vídeo, carrossel), e quem sabe ler cada uma é `meta-media-source` — não este
 * módulo, que só repassa o objeto.
 */
type MetaCreative = Record<string, unknown>;

/** Uma imagem resolvida por hash em `/adimages`. */
interface MetaAdImage {
  id: string;
  url?: string;
  original_image_url?: string;
}

export interface MediaSyncReport {
  candidates: number;
  attempted: number;
  coversUploaded: number;
  videoLinksRenewed: number;
  withoutSource: number;
  failed: number;
  remaining: number;
  reachedLimit: boolean;
}

/**
 * O relatório da mídia em português, para quem não conhece o código.
 *
 * Mora aqui, e não em cada chamador, porque eram três textos independentes — o
 * cron, a rota manual e o aviso na tela — e eles divergiam. O resultado era uma
 * frase como "0 artes salvas, 184 links de vídeo renovados, 601 falharam", que
 * empilha números sem dizer o que cada um é nem o que fazer com eles.
 *
 * `ok` é falso quando houve falha de gravação: o aviso não pode exibir um ✅
 * verde em cima de 601 imagens que não foram salvas.
 */
export function describeMediaReport(report: MediaSyncReport): { text: string; ok: boolean } {
  const n = (value: number) => value.toLocaleString("pt-BR");

  if (report.attempted === 0) {
    return { text: "Artes: nada pendente.", ok: true };
  }

  const feitos: string[] = [];
  if (report.coversUploaded > 0) feitos.push(`${n(report.coversUploaded)} imagens salvas no servidor`);
  if (report.videoLinksRenewed > 0) feitos.push(`${n(report.videoLinksRenewed)} vídeos com link renovado`);

  const partes: string[] = [];
  partes.push(feitos.length > 0 ? `Artes: ${feitos.join(" e ")}` : "Artes: nenhuma imagem nova salva");

  if (report.failed > 0) {
    partes.push(
      `${n(report.failed)} não puderam ser salvas (o servidor de imagens recusou — veja Configurações › Logs)`
    );
  }
  if (report.withoutSource > 0) {
    partes.push(`${n(report.withoutSource)} sem imagem disponível na Meta`);
  }

  let text = partes.join("; ") + ".";

  if (report.remaining > 0) {
    // A fila só tem anúncio no ar, então o que sobra é trabalho real de agora —
    // não mais o passivo histórico, que deixou de ser buscado.
    text += ` Restam ${n(report.remaining)} peças no ar para a próxima execução.`;
  }

  return { text, ok: report.failed === 0 };
}

interface Target {
  id: string;
  needsCover: boolean;
  isKnownVideo: boolean;
}

export interface MediaSyncOptions {
  /**
   * Teto de peças nesta execução, abaixo do padrão.
   *
   * Serve para exercitar o caminho inteiro — API, upload e escrita — sem
   * disparar centenas de uploads de uma vez numa hospedagem com cota apertada.
   */
  limit?: number;
}

export async function runMetaMediaSync(
  onProgress?: (message: string, percentage: number) => void,
  options: MediaSyncOptions = {}
): Promise<MediaSyncReport> {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(0, ROUTE_BUDGET_MS - (Date.now() - startedAt));
  resetWallClock();

  const empty: MediaSyncReport = {
    candidates: 0, attempted: 0, coversUploaded: 0, videoLinksRenewed: 0,
    withoutSource: 0, failed: 0, remaining: 0, reachedLimit: false,
  };

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const storage = resolveStorageConfig(settings);

  let accountId = settings?.metaAdAccountId || "";
  const token = settings?.metaAccessToken || "";
  if (accountId && !accountId.startsWith("act_")) accountId = `act_${accountId}`;

  if (!accountId || !token) {
    throw new Error("Credenciais do Meta Ads não configuradas em Configurações › API.");
  }
  if (!isStorageConfigured(storage)) {
    throw new Error(
      "Armazenamento de mídia não configurado (cpanelUploadUrl/cpanelUploadSecret) — " +
      "sem ele não há para onde copiar as artes."
    );
  }

  // --- 1. A fila, tirada do banco e ordenada por urgência ---
  if (onProgress) onProgress("Levantando peças sem arte...", 5);

  /*
   * Só o que está no ar.
   *
   * O passivo era de 10.9 mil peças, quase todas pausadas há meses, e cada ciclo
   * gastava chamadas de API e cota de disco com arte que ninguém abre. O que já
   * foi salvo continua no banco para consulta; se um anúncio voltar ao ar, ele
   * volta para esta fila sozinho.
   */
  const creatives = await prisma.adCreative.findMany({
    where: { platform: "META", status: "ACTIVE" },
    select: { id: true, status: true, imageUrl: true, videoUrl: true, mediaType: true, createdTime: true },
  });

  const candidates = creatives
    .map((c) => {
      const needsCover = !isPermanentMediaUrl(c.imageUrl, storage);
      const isKnownVideo = c.mediaType === "video" || !!c.videoUrl;
      // Vídeo sempre volta: o link da rede é assinado e expira, e renová-lo é
      // justamente o que substitui copiar o arquivo para o nosso servidor.
      if (!needsCover && !isKnownVideo) return null;
      return { creative: c, target: { id: c.id, needsCover, isKnownVideo } as Target };
    })
    .filter((x): x is { creative: (typeof creatives)[number]; target: Target } => x !== null);

  /*
   * Sem arte alguma e no ar é o pior caso: a peça está invisível no painel
   * agora. Depois vem quem tem arte que vai expirar, e por último o vídeo que
   * só precisa do link renovado — esse ainda aparece pela capa.
   */
  // Todos estão no ar, então o que ordena é a falta: sem capa é invisível no
  // painel agora; só renovar o link do vídeo pode esperar.
  const urgency = ({ target }: (typeof candidates)[number]): number =>
    target.needsCover ? 0 : 1;

  candidates.sort((a, b) => {
    const diff = urgency(a) - urgency(b);
    if (diff !== 0) return diff;
    // Dentro do mesmo grupo, o mais novo primeiro: é o que alguém está olhando.
    const ta = a.creative.createdTime?.getTime() ?? 0;
    const tb = b.creative.createdTime?.getTime() ?? 0;
    return tb - ta;
  });

  if (candidates.length === 0) {
    if (onProgress) onProgress("Nada pendente.", 100);
    return empty;
  }

  const cap = options.limit && options.limit > 0
    ? Math.min(options.limit, MAX_TARGETS_PER_RUN)
    : MAX_TARGETS_PER_RUN;
  const targets = candidates.slice(0, cap).map((c) => c.target);
  const report: MediaSyncReport = {
    ...empty,
    candidates: candidates.length,
    attempted: targets.length,
    remaining: Math.max(0, candidates.length - targets.length),
  };

  // --- 2. Os criativos, em lote ---
  if (onProgress) onProgress(`Resolvendo ${targets.length} criativos na API...`, 15);

  const creativeById: Record<string, MetaCreative> = {};
  const ids = targets.map((t) => t.id);
  let reachedLimit = false;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    if (remainingMs() < READ_FLOOR_MS) { reachedLimit = true; break; }

    const batch = ids.slice(i, i + BATCH_SIZE);
    const data = await throttledFetch(
      `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=${META_CREATIVE_MEDIA_FIELDS}&access_token=${token}`
    );
    for (const id of batch) {
      const creative = data?.[id]?.adcreatives?.data?.[0];
      if (creative) creativeById[id] = creative;
    }
    if (onProgress) {
      onProgress(
        `Criativos (${Math.min(i + BATCH_SIZE, ids.length)}/${ids.length})...`,
        15 + Math.floor((i / ids.length) * 25)
      );
    }
  }

  // --- 3. Capas em resolução real e links de vídeo ---
  const videoIds = new Set<string>();
  const imageHashes = new Set<string>();
  for (const id of ids) {
    const creative = creativeById[id];
    if (!creative) continue;
    const videoId = creativeVideoId(creative);
    if (videoId) videoIds.add(videoId);
    else {
      const hash = staticImageHash(creative);
      if (hash) imageHashes.add(hash);
    }
  }

  const videoCoverMap: Record<string, string> = {};
  const videoSourceMap: Record<string, string> = {};
  const videoIdList = Array.from(videoIds);

  for (let i = 0; i < videoIdList.length; i += BATCH_SIZE) {
    if (remainingMs() < READ_FLOOR_MS) { reachedLimit = true; break; }

    const batch = videoIdList.slice(i, i + BATCH_SIZE);
    const data = await throttledFetch(
      `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=${META_VIDEO_MEDIA_FIELDS}&access_token=${token}`
    );
    for (const videoId of batch) {
      const cover = pickVideoCover(data?.[videoId]?.thumbnails?.data);
      if (cover) videoCoverMap[videoId] = cover;
      if (data?.[videoId]?.source) videoSourceMap[videoId] = data[videoId].source;
    }
    if (onProgress) {
      onProgress(
        `Vídeos (${Math.min(i + BATCH_SIZE, videoIdList.length)}/${videoIdList.length})...`,
        40 + Math.floor((i / Math.max(videoIdList.length, 1)) * 15)
      );
    }
  }

  const hashToUrlMap: Record<string, string> = {};
  const hashList = Array.from(imageHashes);

  for (let i = 0; i < hashList.length; i += BATCH_SIZE) {
    if (remainingMs() < READ_FLOOR_MS) { reachedLimit = true; break; }

    const batch = hashList.slice(i, i + BATCH_SIZE);
    const data = await throttledFetch(
      `https://graph.facebook.com/v19.0/${accountId}/adimages?hashes=${encodeURIComponent(JSON.stringify(batch))}&fields=url,original_image_url&access_token=${token}`
    );
    (data?.data || []).forEach((img: MetaAdImage) => {
      const parts = String(img.id).split(":");
      const hash = parts.length > 1 ? parts[1] : img.id;
      // A original vem primeiro: `url` já pode ser uma versão redimensionada.
      // Sem nenhuma das duas não há o que mapear — gravar vazio faria a peça
      // parecer resolvida e sair da fila sem arte nenhuma.
      const url = img.original_image_url || img.url;
      if (url) hashToUrlMap[hash] = url;
    });
    if (onProgress) {
      onProgress(
        `Imagens (${Math.min(i + BATCH_SIZE, hashList.length)}/${hashList.length})...`,
        55 + Math.floor((i / Math.max(hashList.length, 1)) * 10)
      );
    }
  }

  // --- 4. Sobe a arte e grava ---
  if (onProgress) onProgress("Salvando artes no servidor externo...", 68);

  let done = 0;
  let budgetExhausted = false;

  await runWithConcurrency(
    targets.map((target) => async () => {
      if (budgetExhausted || remainingMs() < DB_WRITE_RESERVE_MS) {
        budgetExhausted = true;
        return;
      }

      const creative = creativeById[target.id];
      if (!creative) {
        // A API não devolveu o criativo nesta passada — nada a concluir.
        return;
      }

      const videoId = creativeVideoId(creative);
      const data: Record<string, unknown> = {};

      if (videoId) {
        /*
         * O link do vídeo vem do servidor da própria rede e é renovado aqui.
         * É a contrapartida de não copiar o arquivo: se ele não tocar, a capa
         * abaixo garante que a peça ainda mostre alguma coisa.
         */
        if (videoSourceMap[videoId]) {
          data.videoUrl = videoSourceMap[videoId];
          report.videoLinksRenewed++;
        }
        data.mediaType = "video";
      } else if (!target.isKnownVideo) {
        data.mediaType = "image";
      }

      if (target.needsCover) {
        const sourceUrl = videoId
          ? videoCoverMap[videoId] || videoCoverFallback(creative)
          : staticImageSource(creative, hashToUrlMap);
        const baseName = videoId
          ? `${target.id}-${videoId}`
          : `${target.id}-${staticImageHash(creative) || "image"}`;

        if (!sourceUrl) {
          report.withoutSource++;
        } else {
          // `persistRemoteMedia` recusa o que vier abaixo de 400px: é o que
          // impede uma miniatura de virar permanente e nunca mais ser revisitada.
          const persisted = await persistRemoteMedia(sourceUrl, baseName, storage);
          if (persisted) {
            data.imageUrl = persisted;
            data.thumbnailUrl = persisted;
            report.coversUploaded++;
          } else {
            report.failed++;
          }
        }
      }

      if (Object.keys(data).length > 0) {
        await prisma.adCreative.updateMany({ where: { id: target.id }, data });
      }

      done++;
      if (onProgress && done % 25 === 0) {
        onProgress(`Salvando (${done}/${targets.length})...`, 68 + Math.floor((done / targets.length) * 30));
      }
    }),
    UPLOAD_CONCURRENCY
  );

  if (budgetExhausted) reachedLimit = true;
  report.reachedLimit = reachedLimit;
  // O que não coube nesta execução — e não "candidatos menos artes salvas", que
  // contava como pendente todo vídeo já resolvido por renovação de link.
  report.remaining = Math.max(0, candidates.length - targets.length);

  if (onProgress) onProgress("Mídia concluída.", 100);
  return report;
}

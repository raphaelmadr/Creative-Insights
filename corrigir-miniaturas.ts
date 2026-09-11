/**
 * Substitui as miniaturas já gravadas pela arte em resolução real.
 *
 * Versões anteriores do sync gravaram como arte da peça o que a Meta devolve
 * nos campos pequenos: `thumbnail_url` (64x64), o `picture` do vídeo (160x284)
 * e o `image_url` redimensionado de alguns criativos estáticos (45x80). Uma vez
 * copiadas para o nosso domínio, essas imagens passaram a contar como
 * permanentes — `needsMediaRefresh` não volta numa URL que já é nossa —, então
 * o sync corrigido sozinho nunca as alcançaria. Daí este script.
 *
 * Ele também recupera as peças cujo arquivo sumiu do servidor: a URL está
 * gravada, o card aponta para ela e o servidor responde 403.
 *
 * O que faz com cada peça problemática:
 *  1. re-resolve a mídia na API, pela mesma regra do sync (`meta-media-source`);
 *  2. sobe a arte com um nome novo — sobrescrever o arquivo antigo manteria a
 *     URL, e a miniatura continuaria servida pelo cache;
 *  3. invalida `visionTranscript` e `aiAnalysis`, que descrevem a miniatura e
 *     não a peça;
 *  4. se não conseguir resolver, apaga `imageUrl`/`thumbnailUrl` — assim a peça
 *     volta para a fila do sync em vez de ficar presa numa imagem ilegível.
 *
 * Uso:  npx tsx corrigir-miniaturas.ts [--apply] [--limite=N] [--incluir-ok]
 * Sem --apply, roda em modo simulação: mede tudo e relata, sem gravar nada.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
process.env.IS_LOCAL_CLI = "true";

import prisma from "./lib/prisma";
import { throttledFetch } from "./lib/throttled-fetch";
import {
  MIN_CREATIVE_IMAGE_EDGE,
  probeRemoteImageDimensions,
} from "./lib/image-dimensions";
import {
  isPermanentMediaUrl,
  isStorageConfigured,
  persistRemoteMedia,
  resolveStorageConfig,
  runWithConcurrency,
} from "./lib/media-upload";
import {
  META_CREATIVE_MEDIA_FIELDS,
  META_VIDEO_MEDIA_FIELDS,
  creativeVideoId,
  pickVideoCover,
  staticImageHash,
  staticImageSource,
  videoCoverFallback,
} from "./lib/meta-media-source";

const APPLY = process.argv.includes("--apply");
const INCLUDE_OK = process.argv.includes("--incluir-ok");
const LIMIT = Number(
  process.argv.find((a) => a.startsWith("--limite="))?.split("=")[1] || 0
);

/** Lotes de 50 ids: é o teto confortável do endpoint `?ids=` da Graph API. */
const BATCH_SIZE = 50;
const PROBE_CONCURRENCY = 16;
const UPLOAD_CONCURRENCY = 6;

type Problem = "miniatura" | "inacessivel";

interface Affected {
  id: string;
  adName: string;
  problem: Problem;
  detail: string;
}

async function main() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const storage = resolveStorageConfig(settings);

  let accountId = settings?.metaAdAccountId || "";
  const token = settings?.metaAccessToken || "";
  if (accountId && !accountId.startsWith("act_")) accountId = `act_${accountId}`;

  if (!accountId || !token) {
    throw new Error("Credenciais do Meta Ads não configuradas em Configurações › API.");
  }
  if (!isStorageConfigured(storage)) {
    throw new Error("Armazenamento de mídia não configurado (cpanelUploadUrl/cpanelUploadSecret).");
  }

  console.log(APPLY ? "MODO: aplicando alterações\n" : "MODO: simulação (use --apply para gravar)\n");

  // --- 1. Mede a arte de cada peça que já aponta para o nosso servidor ---
  //
  // Só as nossas: uma URL de plataforma expira sozinha e o sync já a renova.
  const creatives = await prisma.adCreative.findMany({
    where: { platform: "META", NOT: { imageUrl: null } },
    select: { id: true, adName: true, imageUrl: true, mediaType: true },
  });

  const persisted = creatives.filter((c) => isPermanentMediaUrl(c.imageUrl, storage));
  console.log(`Criativos Meta com arte no nosso servidor: ${persisted.length}`);
  console.log(`Medindo (mínimo aceitável: ${MIN_CREATIVE_IMAGE_EDGE}px no maior lado)...`);

  const affected: Affected[] = [];
  let measured = 0;
  let healthy = 0;

  await runWithConcurrency(
    persisted.map((creative) => async () => {
      const { dimensions, error } = await probeRemoteImageDimensions(creative.imageUrl!);

      if (dimensions) {
        const edge = Math.max(dimensions.width, dimensions.height);
        if (edge < MIN_CREATIVE_IMAGE_EDGE) {
          affected.push({
            id: creative.id,
            adName: creative.adName,
            problem: "miniatura",
            detail: `${dimensions.width}x${dimensions.height}`,
          });
        } else {
          healthy++;
        }
      } else if (error?.startsWith("HTTP")) {
        // Arquivo ausente no servidor: o card aponta para uma imagem que não existe.
        affected.push({
          id: creative.id,
          adName: creative.adName,
          problem: "inacessivel",
          detail: error,
        });
      } else {
        // Formato não reconhecido não é prova de defeito — fica de fora.
        healthy++;
      }

      if (++measured % 500 === 0) console.log(`  ...${measured}/${persisted.length}`);
    }),
    PROBE_CONCURRENCY
  );

  const miniaturas = affected.filter((a) => a.problem === "miniatura");
  const inacessiveis = affected.filter((a) => a.problem === "inacessivel");

  console.log(`\nArte em resolução real: ${healthy}`);
  console.log(`Miniaturas gravadas:    ${miniaturas.length}`);
  console.log(`Arquivo ausente (4xx):  ${inacessiveis.length}`);

  const sizes = miniaturas.reduce<Record<string, number>>((acc, a) => {
    acc[a.detail] = (acc[a.detail] || 0) + 1;
    return acc;
  }, {});
  Object.entries(sizes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([size, n]) => console.log(`    ${size.padEnd(12)} ${n}`));

  let targets = INCLUDE_OK ? persisted.map((c) => ({ id: c.id, adName: c.adName, problem: "miniatura" as Problem, detail: "" })) : affected;
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);

  if (targets.length === 0) {
    console.log("\nNada a corrigir.");
    return;
  }

  console.log(`\nRe-resolvendo a mídia de ${targets.length} peça(s) na API...`);

  // --- 2. Resolve a fonte em resolução real, pela mesma regra do sync ---
  const creativeById: Record<string, any> = {};
  const ids = targets.map((t) => t.id);

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const data = await throttledFetch(
      `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=${META_CREATIVE_MEDIA_FIELDS}&access_token=${token}`
    );
    for (const id of batch) {
      const creative = data?.[id]?.adcreatives?.data?.[0];
      if (creative) creativeById[id] = creative;
    }
    console.log(`  criativos ${Math.min(i + BATCH_SIZE, ids.length)}/${ids.length}`);
  }

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
    const batch = videoIdList.slice(i, i + BATCH_SIZE);
    const data = await throttledFetch(
      `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=${META_VIDEO_MEDIA_FIELDS}&access_token=${token}`
    );
    for (const videoId of batch) {
      const cover = pickVideoCover(data?.[videoId]?.thumbnails?.data);
      if (cover) videoCoverMap[videoId] = cover;
      if (data?.[videoId]?.source) videoSourceMap[videoId] = data[videoId].source;
    }
    console.log(`  vídeos ${Math.min(i + BATCH_SIZE, videoIdList.length)}/${videoIdList.length}`);
  }

  const hashToUrlMap: Record<string, string> = {};
  const hashList = Array.from(imageHashes);

  for (let i = 0; i < hashList.length; i += BATCH_SIZE) {
    const batch = hashList.slice(i, i + BATCH_SIZE);
    const data = await throttledFetch(
      `https://graph.facebook.com/v19.0/${accountId}/adimages?hashes=${encodeURIComponent(JSON.stringify(batch))}&fields=url,original_image_url&access_token=${token}`
    );
    (data?.data || []).forEach((img: any) => {
      const parts = String(img.id).split(":");
      const hash = parts.length > 1 ? parts[1] : img.id;
      hashToUrlMap[hash] = img.original_image_url || img.url;
    });
    console.log(`  imagens ${Math.min(i + BATCH_SIZE, hashList.length)}/${hashList.length}`);
  }

  // --- 3. Sobe a arte nova e grava ---
  console.log(`\nSubindo as artes${APPLY ? "" : " (simulação: nada é enviado nem gravado)"}...`);

  const result = { corrigidos: 0, semFonte: 0, falhaUpload: 0, limpos: 0 };
  let processed = 0;

  await runWithConcurrency(
    targets.map((target) => async () => {
      const creative = creativeById[target.id];
      const videoId = creative ? creativeVideoId(creative) : null;

      let sourceUrl = "";
      let baseName = target.id;

      if (creative) {
        if (videoId) {
          sourceUrl = videoCoverMap[videoId] || videoCoverFallback(creative);
          baseName = `${target.id}-${videoId}`;
        } else {
          sourceUrl = staticImageSource(creative, hashToUrlMap);
          baseName = `${target.id}-${staticImageHash(creative) || "image"}`;
        }
      }

      /*
       * Nome novo, de propósito. O handler do cPanel sobrescreve o arquivo, o
       * que manteria a URL idêntica — e uma URL idêntica continua sendo
       * entregue do cache com a miniatura antiga dentro.
       */
      baseName = `${baseName}-full`;

      const persistedUrl = sourceUrl && APPLY
        ? await persistRemoteMedia(sourceUrl, baseName, storage)
        : null;

      if (!APPLY) {
        // Mede a fonte para que a simulação diga quantas peças de fato saem da
        // miniatura, e não apenas quantas têm alguma URL de origem.
        if (!sourceUrl) {
          result.semFonte++;
        } else {
          const { dimensions } = await probeRemoteImageDimensions(sourceUrl);
          const edge = dimensions ? Math.max(dimensions.width, dimensions.height) : Infinity;
          if (edge >= MIN_CREATIVE_IMAGE_EDGE) result.corrigidos++;
          else result.falhaUpload++;
        }
      } else if (persistedUrl) {
        await prisma.adCreative.update({
          where: { id: target.id },
          data: {
            imageUrl: persistedUrl,
            thumbnailUrl: persistedUrl,
            ...(videoId
              ? { mediaType: "video", ...(videoSourceMap[videoId] ? { videoUrl: videoSourceMap[videoId] } : {}) }
              : {}),
            // A leitura visual descrevia a miniatura: não vale para a arte nova.
            visionTranscript: null,
            visionAnalyzedAt: null,
            aiAnalysis: null,
            aiAnalyzedAt: null,
          },
        });
        result.corrigidos++;
      } else {
        /*
         * Sem arte utilizável agora. Apagar é o que devolve a peça para a fila
         * do sync: enquanto houver uma URL nossa gravada, `needsMediaRefresh`
         * a considera resolvida e nunca mais tenta.
         */
        await prisma.adCreative.update({
          where: { id: target.id },
          data: {
            imageUrl: null,
            thumbnailUrl: null,
            visionTranscript: null,
            visionAnalyzedAt: null,
            aiAnalysis: null,
            aiAnalyzedAt: null,
          },
        });
        result.limpos++;
        if (sourceUrl) result.falhaUpload++;
        else result.semFonte++;
      }

      if (++processed % 100 === 0) console.log(`  ...${processed}/${targets.length}`);
    }),
    UPLOAD_CONCURRENCY
  );

  console.log("\n--- Resultado ---");
  if (APPLY) {
    console.log(`Arte em resolução real gravada: ${result.corrigidos}`);
    console.log(`Sem fonte resolvível na API:    ${result.semFonte}`);
    console.log(`Fonte pequena ou upload falhou: ${result.falhaUpload}`);
    console.log(`Voltaram para a fila do sync:   ${result.limpos}`);
    console.log("\nAs peças limpas recebem arte na próxima sincronização completa.");
  } else {
    console.log(`Fonte medida em resolução real: ${result.corrigidos}`);
    console.log(`Fonte ainda pequena na API:     ${result.falhaUpload}`);
    console.log(`Sem fonte resolvível na API:    ${result.semFonte}`);
    console.log("\nRode com --apply para gravar.");
  }
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

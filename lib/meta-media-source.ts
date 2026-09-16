/**
 * De onde sai a arte de um criativo do Meta.
 *
 * A API oferece a mesma peça em vários campos e em vários tamanhos, sem nada
 * na URL que diga qual é qual: `thumbnail_url` é sempre 64x64, o `picture` de
 * um vídeo é 160x284, e o `image_url` de um criativo estático às vezes vem
 * redimensionado para 45x80. Só o hash da imagem (via `/adimages`) e o
 * `thumbnails` do vídeo devolvem a arte em resolução cheia.
 *
 * A escolha vive aqui, e não dentro do sync, porque a correção do passivo
 * precisa resolver a mídia exatamente como o sync resolve — duas cópias da
 * regra divergem, e foi assim que miniaturas entraram no banco.
 */

import { MIN_CREATIVE_IMAGE_EDGE } from "./image-dimensions";

/**
 * Campos do criativo necessários para achar a mídia.
 *
 * `thumbnail_url` não é pedido de propósito: não há uso legítimo para ele aqui,
 * e tê-lo na resposta é o que fez versões anteriores usarem-no como fallback.
 */
export const META_CREATIVE_MEDIA_FIELDS =
  "adcreatives{image_url,image_hash," +
  "object_story_spec{video_data{video_id,image_url},link_data{picture,image_hash,child_attachments{image_hash,picture}}}," +
  "asset_feed_spec{images{hash},videos{video_id}}}";

/** Um quadro oferecido por `/{video-id}?fields=thumbnails`. */
export interface MetaVideoThumbnail {
  uri: string;
  width?: number;
  height?: number;
  is_preferred?: boolean;
}

/** Campos do vídeo: o link da mídia e os quadros em resolução real. */
export const META_VIDEO_MEDIA_FIELDS = "source,thumbnails{uri,width,height,is_preferred}";

/** O id do vídeo de um criativo, ou `null` se a peça for estática. */
export function creativeVideoId(creative: any): string | null {
  return (
    creative?.object_story_spec?.video_data?.video_id ||
    creative?.asset_feed_spec?.videos?.[0]?.video_id ||
    null
  );
}

/**
 * O hash da imagem de um criativo estático, em ordem de preferência.
 *
 * Carrossel foi o furo: suas imagens vivem em
 * `object_story_spec.link_data.child_attachments[]`, e nem o campo era pedido à
 * API — `image_hash` e `asset_feed_spec` vêm vazios num carrossel, então a peça
 * terminava sem URL de origem e era descartada em silêncio a cada sync. Eram
 * criativos ativos, com entrega e gasto, invisíveis no painel para sempre.
 */
export function staticImageHash(creative: any): string | null {
  const linkData = creative?.object_story_spec?.link_data;

  return (
    creative?.image_hash ||
    creative?.asset_feed_spec?.images?.[0]?.hash ||
    linkData?.image_hash ||
    // A primeira carta do carrossel representa a peça na listagem.
    linkData?.child_attachments?.find((c: any) => c?.image_hash)?.image_hash ||
    null
  );
}

/**
 * A URL de origem da imagem de um criativo estático.
 *
 * O hash resolvido em `/adimages` vem primeiro porque é a única fonte que
 * garante a arte original. `creative.image_url` fica atrás dele e não é
 * confiável: medido na conta, devolveu 45x80 e 64x80 para peças cujo hash
 * resolvia em 1080x1920. Serve como último recurso — quando nem ele tiver
 * tamanho, `persistRemoteMedia` recusa a gravação.
 *
 * `thumbnail_url` não entra aqui, apesar de estar sempre presente: medido, ele
 * é 64x64 e 2KB. Subi-lo resolveria a aparência do painel e criaria dois
 * problemas piores — uma URL nossa conta como permanente, então o sync nunca
 * mais buscaria a arte de verdade, e a leitura visual da IA passaria a analisar
 * uma miniatura ilegível. Peça sem arte é um problema visível; peça congelada
 * em 64px é um problema silencioso.
 */
export function staticImageSource(
  creative: any,
  hashToUrlMap: Record<string, string>
): string {
  const hash = staticImageHash(creative);
  const linkData = creative?.object_story_spec?.link_data;

  return (
    (hash && hashToUrlMap[hash]) ||
    creative?.image_url ||
    linkData?.picture ||
    linkData?.child_attachments?.find((c: any) => c?.picture)?.picture ||
    ""
  );
}

/**
 * A capa de um vídeo, entre os quadros que a Meta oferece em `thumbnails`.
 *
 * A preferida é a que a Meta escolheu para representar o vídeo, então ela ganha
 * — mas só entre as que têm tamanho utilizável. Uma preferida pequena perde
 * para um quadro grande: a capa existe aqui para ser lida, pela pessoa no
 * painel e pela IA na análise, e uma miniatura não serve a nenhuma das duas.
 */
export function pickVideoCover(thumbnails: MetaVideoThumbnail[] | undefined): string {
  if (!Array.isArray(thumbnails)) return "";

  const withUri = thumbnails.filter((t) => t?.uri);
  if (withUri.length === 0) return "";

  const area = (t: MetaVideoThumbnail) => (Number(t.width) || 0) * (Number(t.height) || 0);
  const isBigEnough = (t: MetaVideoThumbnail) =>
    Math.max(Number(t.width) || 0, Number(t.height) || 0) >= MIN_CREATIVE_IMAGE_EDGE;

  const usable = withUri.filter(isBigEnough);
  const pool = usable.length > 0 ? usable : withUri;

  const preferred = pool.find((t) => t.is_preferred);
  if (preferred) return preferred.uri;

  return pool.reduce((best, t) => (area(t) > area(best) ? t : best), pool[0]).uri;
}

/**
 * A capa de um vídeo quando `thumbnails` não resolveu.
 *
 * `object_story_spec.video_data.image_url` é a capa enviada pelo anunciante e
 * costuma vir em tamanho real; o `picture` do vídeo, não — ele é a miniatura de
 * 160x284 que congelou 472 peças, e por isso não aparece em lugar nenhum.
 */
export function videoCoverFallback(creative: any): string {
  return creative?.object_story_spec?.video_data?.image_url || "";
}

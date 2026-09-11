/**
 * Leitura das dimensões de uma imagem a partir dos seus primeiros bytes.
 *
 * Existe porque "a URL está no nosso servidor" não é o mesmo que "a arte está
 * no nosso servidor": a Meta devolve, nos mesmos campos, tanto a peça de
 * 1080x1920 quanto miniaturas de 64x64 e 160x284. Copiada para o nosso domínio,
 * a miniatura vira uma URL permanente — o sync nunca mais volta nela e a
 * leitura visual da IA passa a analisar uma imagem ilegível, sem erro nenhum
 * em lugar nenhum.
 *
 * O cabeçalho de um JPEG/PNG/GIF/WebP já carrega o tamanho, então bastam os
 * primeiros KB do arquivo — não é preciso baixar a imagem inteira nem trazer
 * uma dependência de processamento de imagem.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Menor lado aceitável para a arte de um criativo, em pixels.
 *
 * Medido na conta: as artes reais vêm em 1080x1080, 1080x1350 e 1080x1920,
 * enquanto as miniaturas vêm em 64x64, 45x80, 130x231 e 160x284. Não há nada
 * entre 320 e 600 pixels, então o corte em 400 cai no vazio entre os dois
 * grupos — fora do alcance de qualquer arte legítima e acima de toda miniatura.
 */
export const MIN_CREATIVE_IMAGE_EDGE = 400;

/** Quantos bytes bastam para achar o cabeçalho, inclusive com EXIF gordo. */
export const IMAGE_HEADER_BYTES = 65536;

function readJpeg(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // Marcadores sem carga útil: seguem direto para o próximo.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;

    /*
     * SOF (Start Of Frame) é onde ficam as dimensões. A faixa 0xC0–0xCF é toda
     * de SOF exceto 0xC4 (tabelas Huffman), 0xC8 (extensão JPEG) e 0xCC (tabelas
     * aritméticas) — confundir os três com SOF devolve números de lixo.
     */
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      if (offset + 9 > buffer.length) return null;
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readPng(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGif(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readWebp(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const format = buffer.toString("ascii", 12, 16);

  if (format === "VP8 ") {
    // Quadro-chave do VP8: 3 bytes de start code, depois largura e altura em 14 bits.
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (format === "VP8X") {
    // Dimensões do canvas, menos um, em 24 bits little-endian cada.
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { width, height };
  }

  return null;
}

/**
 * Dimensões da imagem, ou `null` quando o formato não é reconhecido.
 *
 * `null` significa "não sei", nunca "é pequena": quem chama precisa decidir a
 * favor da imagem em vez de descartar uma arte boa num formato inesperado.
 */
export function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  const dimensions =
    readJpeg(buffer) || readPng(buffer) || readGif(buffer) || readWebp(buffer);

  if (!dimensions) return null;
  if (!dimensions.width || !dimensions.height) return null;

  return dimensions;
}

/**
 * Se a imagem é grande o bastante para valer como arte do criativo.
 *
 * Dimensões desconhecidas passam: recusar o que não se sabe medir apagaria
 * peças boas para evitar miniaturas hipotéticas.
 */
export function isUsableCreativeImage(
  dimensions: ImageDimensions | null,
  minEdge: number = MIN_CREATIVE_IMAGE_EDGE
): boolean {
  if (!dimensions) return true;
  return Math.max(dimensions.width, dimensions.height) >= minEdge;
}

/** Baixa só o cabeçalho de uma imagem remota e devolve suas dimensões. */
export async function probeRemoteImageDimensions(
  url: string,
  timeoutMs = 15000
): Promise<{ dimensions: ImageDimensions | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${IMAGE_HEADER_BYTES - 1}` },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return { dimensions: null, error: `HTTP ${response.status}` };

    const buffer = Buffer.from(await response.arrayBuffer());
    const dimensions = readImageDimensions(buffer);

    return { dimensions, error: dimensions ? null : "formato não reconhecido" };
  } catch (error) {
    return { dimensions: null, error: (error as Error).message };
  }
}

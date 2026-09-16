/**
 * Transcrição visual de criativos.
 *
 * A análise individual antes lia o **nome do anúncio** e inferia o resto — o
 * nome é uma convenção de nomenclatura do time, não uma descrição da peça, e
 * duas peças visualmente opostas podem ter nomes quase idênticos. O modelo
 * recebe agora a própria imagem e devolve o que está nela: headline,
 * subheadline, CTA, textos de apoio, cores dominantes e elementos visuais.
 *
 * Essa transcrição é o insumo das duas — e únicas — funções de IA do sistema:
 * a análise individual do criativo e a análise de similaridade. Ter os textos
 * e cores em campos estruturados é o que permite comparar duas peças de forma
 * verificável, em vez de pedir ao modelo que "ache" a diferença entre imagens.
 *
 * É cacheada em `AdCreative.visionTranscript`: uma chamada de visão por peça,
 * reaproveitada por toda análise seguinte.
 */

import prisma from "./prisma";
import { generateWithFallback, isAiConfigured, type AiImageInput } from "./ai";
import {
  MIN_CREATIVE_IMAGE_EDGE,
  isUsableCreativeImage,
  readImageDimensions,
} from "./image-dimensions";

export interface TranscriptColor {
  hex: string | null;
  /** Onde a cor aparece: fundo, texto, destaque, CTA... */
  role: string | null;
  name: string | null;
}

export interface CreativeTranscript {
  headline: string | null;
  subheadline: string | null;
  cta: string | null;
  /** Demais textos legíveis na peça, em ordem de leitura. */
  supportingText: string[];
  dominantColors: TranscriptColor[];
  /** Objetos, cenário, pessoas, ícones, selos. */
  visualElements: string[];
  hasPerson: boolean | null;
  /** A oferta declarada, quando existe (desconto, prazo, valor). */
  offer: string | null;
  /** Formato aparente: foto de produto, UGC, carrossel, print de conversa... */
  visualFormat: string | null;
  /** Observação sobre legibilidade e hierarquia visual. */
  readability: string | null;
  /** Quando a IA não conseguiu ler a peça, o motivo fica aqui. */
  error?: string;
}

export const DEFAULT_VISION_PROMPT = `Você é um analista de criativos publicitários. Transcreva a imagem fornecida com precisão, sem interpretar performance e sem dar recomendações.

Sua única tarefa é DESCREVER o que está na peça. Leia todo texto visível, literalmente, sem corrigir nem parafrasear. Se um campo não existir na peça, use null — nunca invente.

Retorne APENAS um objeto JSON válido, sem markdown e sem texto em volta, nesta forma exata:

{
  "headline": "o texto de maior destaque visual, literal",
  "subheadline": "o texto de segundo maior destaque, literal, ou null",
  "cta": "o texto do botão ou chamada para ação, literal, ou null",
  "supportingText": ["demais textos legíveis, em ordem de leitura"],
  "dominantColors": [{ "hex": "#RRGGBB", "role": "fundo | texto | destaque | cta", "name": "nome informal da cor" }],
  "visualElements": ["objetos, cenário, selos, ícones, elementos gráficos presentes"],
  "hasPerson": true,
  "offer": "a oferta declarada na peça (valor, desconto, prazo), literal, ou null",
  "visualFormat": "foto de produto | UGC | print de conversa | ilustração | texto sobre cor sólida | colagem | outro",
  "readability": "uma frase sobre contraste, tamanho de fonte e hierarquia visual"
}`;

/** Extrai o JSON do retorno do modelo, tolerando cercas de markdown e ruído. */
export function parseTranscriptJson(raw: string): CreativeTranscript | null {
  if (!raw) return null;

  let text = raw.trim();
  // Modelos frequentemente embrulham em ```json ... ``` apesar da instrução.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return normalizeTranscript(parsed);
  } catch {
    return null;
  }
}

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== "null" ? trimmed : null;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((v): v is string => !!v);
};

function normalizeTranscript(raw: any): CreativeTranscript {
  const colors: TranscriptColor[] = Array.isArray(raw?.dominantColors)
    ? raw.dominantColors.slice(0, 8).map((c: any) => ({
        hex: asString(c?.hex),
        role: asString(c?.role),
        name: asString(c?.name),
      }))
    : [];

  return {
    headline: asString(raw?.headline),
    subheadline: asString(raw?.subheadline),
    cta: asString(raw?.cta),
    supportingText: asStringArray(raw?.supportingText),
    dominantColors: colors,
    visualElements: asStringArray(raw?.visualElements),
    hasPerson: typeof raw?.hasPerson === "boolean" ? raw.hasPerson : null,
    offer: asString(raw?.offer),
    visualFormat: asString(raw?.visualFormat),
    readability: asString(raw?.readability),
  };
}

export function readStoredTranscript(stored: string | null | undefined): CreativeTranscript | null {
  if (!stored) return null;
  try {
    return normalizeTranscript(JSON.parse(stored));
  } catch {
    return null;
  }
}

/**
 * Bloco de texto que entra nos prompts de análise.
 *
 * A transcrição vira texto legível em vez de JSON cru: o modelo raciocina
 * melhor sobre "Headline: X" do que sobre chaves e aspas, e o resultado fica
 * auditável por quem lê o prompt.
 */
export function transcriptToPromptBlock(
  transcript: CreativeTranscript | null,
  fallbackName?: string
): string {
  if (!transcript) {
    return fallbackName
      ? `Transcrição visual indisponível para esta peça. Nome do arquivo (pista fraca, não descreve o criativo): ${fallbackName}`
      : "Transcrição visual indisponível para esta peça.";
  }

  const colors = transcript.dominantColors
    .map((c) => [c.name, c.hex, c.role && `(${c.role})`].filter(Boolean).join(" "))
    .filter(Boolean);

  const lines = [
    transcript.headline && `Headline: ${transcript.headline}`,
    transcript.subheadline && `Subheadline: ${transcript.subheadline}`,
    transcript.cta && `CTA: ${transcript.cta}`,
    transcript.offer && `Oferta declarada: ${transcript.offer}`,
    transcript.supportingText.length > 0 &&
      `Outros textos na peça: ${transcript.supportingText.join(" | ")}`,
    colors.length > 0 && `Cores dominantes: ${colors.join(", ")}`,
    transcript.visualElements.length > 0 &&
      `Elementos visuais: ${transcript.visualElements.join(", ")}`,
    transcript.hasPerson !== null &&
      `Pessoa em cena: ${transcript.hasPerson ? "sim" : "não"}`,
    transcript.visualFormat && `Formato visual: ${transcript.visualFormat}`,
    transcript.readability && `Legibilidade: ${transcript.readability}`,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "Transcrição visual vazia.";
}

/** A imagem a transcrever: estático usa a própria arte, vídeo usa a capa. */
function pickImageUrl(creative: { imageUrl?: string | null; thumbnailUrl?: string | null }) {
  return creative.imageUrl || creative.thumbnailUrl || null;
}

type ImageLoad =
  | { image: AiImageInput; error?: undefined }
  | { image: null; error: string };

/**
 * Baixa a mídia da peça para mandar ao modelo.
 *
 * O motivo da recusa volta junto porque um deles precisa aparecer em tela: uma
 * peça cuja arte gravada é miniatura não pode ser transcrita, e chamar isso de
 * "link expirado" mandaria alguém procurar o problema no lugar errado. Recusar
 * é melhor do que transcrever: numa imagem de 64x64 o modelo não lê a headline,
 * ele a inventa — e a transcrição inventada ficaria salva, alimentando depois a
 * análise individual e a comparação de similaridade sem nenhum sinal de erro.
 */
async function downloadAsAiImage(url: string, label: string): Promise<ImageLoad> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return { image: null, error: `A mídia da peça respondeu HTTP ${response.status}.` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    // Peças acima de ~4MB estouram o limite de payload de alguns provedores.
    if (buffer.byteLength > 4 * 1024 * 1024) {
      return { image: null, error: "A mídia da peça passa de 4MB e não cabe no envio para a IA." };
    }

    const mimeType = response.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      return { image: null, error: `A URL da peça não devolveu uma imagem (${mimeType}).` };
    }

    const dimensions = readImageDimensions(buffer);
    if (!isUsableCreativeImage(dimensions)) {
      return {
        image: null,
        error:
          `A arte gravada é uma miniatura de ${dimensions!.width}x${dimensions!.height} ` +
          `(mínimo ${MIN_CREATIVE_IMAGE_EDGE}px) — o modelo não conseguiria ler a peça. ` +
          `Rode a sincronização completa para buscar a arte em resolução real.`,
      };
    }

    return { image: { base64: buffer.toString("base64"), mimeType, label } };
  } catch (error) {
    return { image: null, error: `Falha ao baixar a mídia da peça: ${(error as Error).message}` };
  }
}

export interface TranscribeResult {
  adId: string;
  ok: boolean;
  cached: boolean;
  transcript: CreativeTranscript | null;
  error?: string;
}

/**
 * Garante a transcrição de um criativo, usando o cache quando existir.
 *
 * Nunca lança: uma peça que não pode ser lida devolve `ok: false` com o motivo,
 * para que um lote de 300 imagens não morra por causa de um link quebrado.
 */
export async function transcribeCreative(
  adId: string,
  options: { force?: boolean } = {}
): Promise<TranscribeResult> {
  const creative = await prisma.adCreative.findUnique({
    where: { id: adId },
    select: {
      id: true,
      adName: true,
      imageUrl: true,
      thumbnailUrl: true,
      visionTranscript: true,
    },
  });

  if (!creative) {
    return { adId, ok: false, cached: false, transcript: null, error: "Criativo não encontrado." };
  }

  if (!options.force) {
    const cached = readStoredTranscript(creative.visionTranscript);
    if (cached) return { adId, ok: true, cached: true, transcript: cached };
  }

  if (!(await isAiConfigured())) {
    return {
      adId,
      ok: false,
      cached: false,
      transcript: null,
      error: "Nenhuma chave de IA configurada. Configure em Configurações › IA.",
    };
  }

  const imageUrl = pickImageUrl(creative);
  if (!imageUrl) {
    return {
      adId,
      ok: false,
      cached: false,
      transcript: null,
      error: "Criativo sem imagem ou capa para transcrever.",
    };
  }

  const loaded = await downloadAsAiImage(imageUrl, creative.adName);
  if (!loaded.image) {
    return { adId, ok: false, cached: false, transcript: null, error: loaded.error };
  }

  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { visionPrompt: true },
  });

  const raw = await generateWithFallback(settings?.visionPrompt || DEFAULT_VISION_PROMPT, [loaded.image]);
  const transcript = parseTranscriptJson(raw);

  if (!transcript) {
    return {
      adId,
      ok: false,
      cached: false,
      transcript: null,
      error: "A IA não devolveu uma transcrição legível para esta peça.",
    };
  }

  await prisma.adCreative.update({
    where: { id: adId },
    data: { visionTranscript: JSON.stringify(transcript), visionAnalyzedAt: new Date() },
  });

  return { adId, ok: true, cached: false, transcript };
}

/**
 * Transcreve vários criativos, em série.
 *
 * Em série de propósito: os provedores de visão têm limites de taxa apertados,
 * e um lote paralelo de centenas de imagens é recusado inteiro.
 */
export async function transcribeMany(
  adIds: string[],
  options: { force?: boolean; onProgress?: (done: number, total: number, current: string) => void } = {}
): Promise<TranscribeResult[]> {
  const results: TranscribeResult[] = [];

  for (let i = 0; i < adIds.length; i++) {
    const result = await transcribeCreative(adIds[i], { force: options.force });
    results.push(result);
    options.onProgress?.(i + 1, adIds.length, adIds[i]);
  }

  return results;
}

/**
 * Persistência de mídias de criativos em armazenamento próprio.
 *
 * Meta e TikTok entregam URLs assinadas e de vida curta (o `preview_url` do
 * TikTok expira em ~4h; as URLs de `scontent`/`fbcdn` do Meta expiram em dias).
 * Estáticos precisam ser copiados para o servidor externo; o que não for
 * copiado com sucesso NÃO pode ser gravado no banco como se fosse permanente.
 */

import { logExternalFailure } from "./external-log";
import {
  IMAGE_HEADER_BYTES,
  MIN_CREATIVE_IMAGE_EDGE,
  isUsableCreativeImage,
  readImageDimensions,
} from "./image-dimensions";

export interface MediaStorageSettings {
  cpanelUploadUrl?: string | null;
  cpanelUploadSecret?: string | null;
}

/** De onde um valor efetivo veio. `null` quando não existe em lugar algum. */
export type ConfigSource = "db" | "env" | null;

export interface ResolvedStorageConfig {
  uploadUrl?: string;
  uploadSecret?: string;
  /** Host do cPanel, usado para reconhecer URLs já persistidas. */
  host?: string;
  /**
   * Origem de cada valor. O painel precisa disso para não mentir: lendo apenas
   * o banco, um valor que vive na variável de ambiente aparecia como campo
   * vazio, e não havia como saber se o armazenamento estava configurado.
   */
  uploadUrlSource: ConfigSource;
  uploadSecretSource: ConfigSource;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve a configuração de armazenamento a partir do painel, caindo para o
 * ambiente. Campos vazios no banco (string "") são tratados como ausentes —
 * é exatamente esse o estado atual de `cpanelUploadUrl`.
 */
export function resolveStorageConfig(
  settings?: MediaStorageSettings | null
): ResolvedStorageConfig {
  const dbUrl = (settings?.cpanelUploadUrl || "").trim();
  const dbSecret = (settings?.cpanelUploadSecret || "").trim();
  const uploadUrl = dbUrl;
  const uploadSecret = dbSecret;

  let host: string | undefined;
  if (uploadUrl) {
    try {
      host = new URL(uploadUrl).hostname;
    } catch {
      host = undefined;
    }
  }

  return {
    uploadUrl: uploadUrl || undefined,
    uploadSecret: uploadSecret || undefined,
    host,
    uploadUrlSource: dbUrl ? "db" : null,
    uploadSecretSource: dbSecret ? "db" : null,
  };
}

export function isStorageConfigured(config: ResolvedStorageConfig): boolean {
  return !!config.uploadUrl && !!config.uploadSecret;
}

/**
 * Uma URL é permanente quando aponta para o nosso próprio armazenamento.
 * Qualquer coisa em domínio de plataforma é assinada e vai expirar.
 */
export function isPermanentMediaUrl(
  url: string | null | undefined,
  config: ResolvedStorageConfig
): boolean {
  if (!url) return false;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  if (config.host && hostname === config.host) return true;
  if (hostname.endsWith("public.blob.vercel-storage.com")) return true;

  return false;
}

/** Sanitiza o nome do arquivo para bater com o que o handler PHP aceita. */
function safeFilename(base: string, extension: string): string {
  const cleanedBase = base.replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 120) || `media-${Date.now()}`;
  const cleanedExt = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const finalExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(cleanedExt)
    ? cleanedExt
    : "jpg";
  return `${cleanedBase}.${finalExt}`;
}

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return "jpg";
  const subtype = contentType.split(";")[0].trim().split("/")[1] || "jpg";
  return subtype === "jpeg" ? "jpg" : subtype;
}

async function fetchWithRetry(url: string, attempts: number): Promise<Response | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      // 4xx que não seja rate limit dificilmente melhora com retry.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return null;
      }
    } catch {
      // erro de rede — cai no backoff abaixo
    }
    if (attempt < attempts) await delay(500 * Math.pow(2, attempt - 1));
  }
  return null;
}

export interface PersistMediaOptions {
  /**
   * Menor lado aceitável, em pixels. `0` desliga a checagem — use só para
   * mídias que não são a arte de um criativo.
   */
  minEdge?: number;
}

/**
 * Baixa uma mídia da plataforma e a persiste no armazenamento próprio.
 *
 * Devolve a URL permanente, ou `null` se não foi possível persistir. O `null` é
 * significativo: o chamador deve preservar o valor que já está no banco em vez
 * de gravar a URL de origem, que expira.
 *
 * Miniaturas são recusadas aqui, e não no chamador, porque só depois do
 * download se sabe o tamanho real: os mesmos campos da API devolvem tanto a
 * peça de 1080x1920 quanto uma capa de 160x284, sem nada na URL que os separe.
 * Copiada para o nosso domínio, a miniatura passaria a contar como permanente,
 * o sync nunca mais voltaria nela e a IA analisaria uma imagem ilegível.
 */
export async function persistRemoteMedia(
  sourceUrl: string,
  baseFilename: string,
  config: ResolvedStorageConfig,
  options: PersistMediaOptions = {}
): Promise<string | null> {
  if (!sourceUrl) return null;
  if (!isStorageConfigured(config)) return null;

  const minEdge = options.minEdge ?? MIN_CREATIVE_IMAGE_EDGE;

  const response = await fetchWithRetry(sourceUrl, 3);
  if (!response) {
    console.warn(`[media-upload] Falha ao baixar mídia de origem: ${sourceUrl.slice(0, 120)}`);
    /*
     * Origem é a plataforma, não o nosso servidor: link assinado que expirou,
     * ou mídia removida. O log precisa dizer isso, senão a leitura fica sendo
     * "o cPanel está com problema" quando o cPanel nem foi chamado.
     */
    await logExternalFailure({
      service: "Meta Ads",
      operation: "baixar a mídia de origem do criativo para copiar ao servidor",
      error: new Error("A plataforma não devolveu a mídia depois de 3 tentativas — link assinado expirado, mídia removida ou formato recusado."),
      endpoint: sourceUrl,
      context: { arquivo: baseFilename },
    });
    return null;
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    console.warn(`[media-upload] Falha ao ler corpo da mídia: ${(error as Error).message}`);
    return null;
  }

  if (blob.size === 0) {
    console.warn(`[media-upload] Mídia vazia descartada: ${sourceUrl.slice(0, 120)}`);
    return null;
  }

  if (minEdge > 0) {
    const dimensions = readImageDimensions(
      Buffer.from(await blob.slice(0, IMAGE_HEADER_BYTES).arrayBuffer())
    );

    if (!isUsableCreativeImage(dimensions, minEdge)) {
      console.warn(
        `[media-upload] Miniatura recusada (${dimensions!.width}x${dimensions!.height}, mínimo ${minEdge}px): ` +
        `${baseFilename}. A peça fica sem arte até a origem devolver a resolução real — ` +
        `gravar a miniatura a tornaria permanente e ilegível para a análise visual.`
      );
      return null;
    }
  }

  const filename = safeFilename(
    baseFilename,
    extensionFromContentType(response.headers.get("content-type"))
  );

  return uploadToStorage(blob, filename, config);
}

/**
 * Entrega um arquivo ao servidor externo e devolve a URL pública.
 *
 * Separado de `persistRemoteMedia` porque agora há duas origens: a mídia que o
 * sync baixa da plataforma e o anexo que alguém escolhe no computador. O que
 * elas têm em comum é tudo o que dá errado — cota cheia, limite de requisições,
 * host recusando envio simultâneo — e era justamente essa parte que estaria
 * duplicada, com uma das cópias fatalmente perdendo alguma correção da outra.
 *
 * `operation` entra no log porque "subir a arte do criativo" não descreve o
 * anexo de uma demanda, e um log que não distingue as duas coisas manda alguém
 * investigar o sync por causa de um upload manual que falhou.
 */
export async function uploadToStorage(
  blob: Blob,
  filename: string,
  config: ResolvedStorageConfig,
  operation = "subir a arte do criativo"
): Promise<string | null> {
  const { uploadUrl, uploadSecret } = config;
  if (!uploadUrl || !uploadSecret) return null;

  /** Última causa observada, para o log final não dizer só "falhou". */
  let lastFailure = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("filename", filename);

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${uploadSecret}` },
        body: formData,
      });

      if (uploadRes.ok) {
        const result = await uploadRes.json();
        if (result?.success && result?.url) return result.url as string;
        console.warn(`[media-upload] Upload recusado pelo servidor: ${JSON.stringify(result).slice(0, 200)}`);
        await logExternalFailure({
          service: "cPanel",
          operation,
          error: new Error(result?.error || result?.message || JSON.stringify(result).slice(0, 300)),
          endpoint: uploadUrl,
          context: { arquivo: filename },
        });
        return null;
      }

      // 401/400 são de configuração — insistir não resolve.
      if (uploadRes.status === 401 || uploadRes.status === 400) {
        console.warn(`[media-upload] Upload rejeitado (HTTP ${uploadRes.status}). Verifique cpanelUploadSecret.`);
        await logExternalFailure({
          service: "cPanel",
          operation,
          error: Object.assign(new Error(`HTTP ${uploadRes.status} ${uploadRes.statusText}`), { status: uploadRes.status }),
          endpoint: uploadUrl,
          context: { arquivo: filename },
        });
        return null;
      }

      // Demais status (503, 507, 429...) são transitórios ou de capacidade:
      // vale repetir, mas a causa precisa sobreviver até o log final.
      lastFailure = `HTTP ${uploadRes.status} ${uploadRes.statusText}`.trim();
    } catch (error) {
      lastFailure = (error as Error).message;
      console.warn(`[media-upload] Erro no upload (tentativa ${attempt}): ${lastFailure}`);
    }
    if (attempt < 3) await delay(500 * Math.pow(2, attempt - 1));
  }

  /*
   * As três tentativas acabaram sem sucesso e sem resposta conclusiva —
   * servidor fora do ar, tempo esgotado, cota cheia (507), excesso de
   * requisições (429).
   *
   * Este `return null` era mudo, e era o buraco mais caro do módulo: uma
   * execução relatava "601 falharam" e não havia uma linha sequer em
   * Configurações › Logs dizendo por quê. Falha sem causa registrada é
   * indistinguível de bug nosso.
   */
  await logExternalFailure({
    service: "cPanel",
    operation,
    error: new Error(
      `Três tentativas sem sucesso. Última resposta: ${lastFailure || "sem detalhe"}. ` +
      `Causas típicas: cota de disco cheia, limite de requisições do servidor, ou o host recusando ` +
      `uploads simultâneos.`
    ),
    endpoint: uploadUrl,
    context: { arquivo: filename },
  });
  return null;
}

/**
 * Executa tarefas com paralelismo limitado.
 *
 * O upload de mídia era sequencial dentro do laço principal, o que fazia a fila
 * de pendências (1200+ criativos) nunca convergir dentro do teto de tempo.
 */
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  });

  await Promise.all(workers);
  return results;
}

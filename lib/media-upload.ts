/**
 * Persistência de mídias de criativos em armazenamento próprio.
 *
 * Meta e TikTok entregam URLs assinadas e de vida curta (o `preview_url` do
 * TikTok expira em ~4h; as URLs de `scontent`/`fbcdn` do Meta expiram em dias).
 * Estáticos precisam ser copiados para o servidor externo; o que não for
 * copiado com sucesso NÃO pode ser gravado no banco como se fosse permanente.
 */

export interface MediaStorageSettings {
  cpanelUploadUrl?: string | null;
  cpanelUploadSecret?: string | null;
}

export interface ResolvedStorageConfig {
  uploadUrl?: string;
  uploadSecret?: string;
  /** Host do cPanel, usado para reconhecer URLs já persistidas. */
  host?: string;
  usesVercelBlob: boolean;
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
  const uploadUrl =
    (settings?.cpanelUploadUrl || "").trim() || process.env.CPANEL_UPLOAD_URL || "";
  const uploadSecret =
    (settings?.cpanelUploadSecret || "").trim() || process.env.CPANEL_UPLOAD_SECRET || "";

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
    usesVercelBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
  };
}

export function isStorageConfigured(config: ResolvedStorageConfig): boolean {
  return (!!config.uploadUrl && !!config.uploadSecret) || config.usesVercelBlob;
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

/**
 * Baixa uma mídia da plataforma e a persiste no armazenamento próprio.
 *
 * Devolve a URL permanente, ou `null` se não foi possível persistir. O `null` é
 * significativo: o chamador deve preservar o valor que já está no banco em vez
 * de gravar a URL de origem, que expira.
 */
export async function persistRemoteMedia(
  sourceUrl: string,
  baseFilename: string,
  config: ResolvedStorageConfig
): Promise<string | null> {
  if (!sourceUrl) return null;
  if (!isStorageConfigured(config)) return null;

  const response = await fetchWithRetry(sourceUrl, 3);
  if (!response) {
    console.warn(`[media-upload] Falha ao baixar mídia de origem: ${sourceUrl.slice(0, 120)}`);
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

  const filename = safeFilename(
    baseFilename,
    extensionFromContentType(response.headers.get("content-type"))
  );

  if (config.uploadUrl && config.uploadSecret) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const formData = new FormData();
        formData.append("file", blob, filename);
        formData.append("filename", filename);

        const uploadRes = await fetch(config.uploadUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.uploadSecret}` },
          body: formData,
        });

        if (uploadRes.ok) {
          const result = await uploadRes.json();
          if (result?.success && result?.url) return result.url as string;
          console.warn(`[media-upload] Upload recusado pelo servidor: ${JSON.stringify(result).slice(0, 200)}`);
          return null;
        }

        // 401/400 são de configuração — insistir não resolve.
        if (uploadRes.status === 401 || uploadRes.status === 400) {
          console.warn(`[media-upload] Upload rejeitado (HTTP ${uploadRes.status}). Verifique cpanelUploadSecret.`);
          return null;
        }
      } catch (error) {
        console.warn(`[media-upload] Erro no upload (tentativa ${attempt}): ${(error as Error).message}`);
      }
      if (attempt < 3) await delay(500 * Math.pow(2, attempt - 1));
    }
    return null;
  }

  if (config.usesVercelBlob) {
    try {
      const { put } = await import("@vercel/blob");
      const uploadResult = await put(`ad-images/${filename}`, blob, {
        access: "public",
        addRandomSuffix: false,
      });
      return uploadResult.url;
    } catch (error) {
      console.warn(`[media-upload] Falha no Vercel Blob: ${(error as Error).message}`);
      return null;
    }
  }

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

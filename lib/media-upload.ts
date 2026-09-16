/**
 * Persistência de mídias de criativos em armazenamento próprio.
 *
 * Meta e TikTok entregam URLs assinadas e de vida curta (o `preview_url` do
 * TikTok expira em ~4h; as URLs de `scontent`/`fbcdn` do Meta expiram em dias).
 * Estáticos precisam ser copiados para o servidor externo; o que não for
 * copiado com sucesso NÃO pode ser gravado no banco como se fosse permanente.
 */

import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { logExternalFailure } from "./external-log";
import { logInfo } from "./logger";
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

/* ------------------------------------------------------------------ *
 * Entrega local: o mesmo disco, sem sair para a internet
 * ------------------------------------------------------------------ */

/**
 * O destino no disco, quando o armazenamento mora na mesma máquina.
 *
 * `dir` é exatamente a pasta em que o `cpanel-upload.php` grava (o `__DIR__`
 * dele); `publicBase` é a URL dessa pasta, para devolvermos o mesmo endereço
 * que o PHP devolveria.
 */
interface LocalTarget {
  dir: string;
  publicBase: string;
}

/**
 * Resolvido uma vez por processo. A chave é a URL de upload: se ela mudar no
 * painel, a resolução é refeita.
 */
let localTargetCache: { key: string; value: LocalTarget | null } | undefined;

/** Avisa no painel de logs uma única vez por processo qual caminho está em uso. */
let localTargetAnnounced = false;

/**
 * Candidatos a pasta pública, do mais explícito ao mais provável.
 *
 * O app e os arquivos vivem na mesma conta de cPanel, em pastas irmãs nomeadas
 * pelo domínio: `/home2/<conta>/creative-insights...` e
 * `/home2/<conta>/assets...`. Daí a busca pelo irmão com o nome do host.
 */
function localCandidates(uploadUrl: URL): string[] {
  const cwd = process.cwd();
  const subpasta = path.dirname(uploadUrl.pathname).replace(/^\/+/, "");
  const casa = os.homedir();

  /*
   * Onde o cPanel põe o domínio adicional muda de servidor para servidor: ora
   * na raiz da conta, ora dentro de `public_html`. Listar as duas formas custa
   * um `stat` e evita depender de adivinhação — quem decide qual vale é o
   * marcador, não esta ordem.
   */
  const raizes = [
    path.dirname(cwd),
    casa,
    path.join(casa, "public_html"),
    path.join(path.dirname(cwd), "public_html"),
    cwd,
  ];

  const lista = raizes.map((raiz) =>
    path.join(raiz, uploadUrl.hostname, subpasta)
  );

  return Array.from(new Set(lista));
}

/**
 * Descobre se dá para gravar direto no disco em vez de subir por HTTP.
 *
 * A verificação não é "a pasta existe": é **o `cpanel-upload.php` está dentro
 * dela**. Esse arquivo é a prova de identidade da pasta — ele grava no próprio
 * diretório (`__DIR__`), então achá-lo ali significa que gravar ali é
 * literalmente a mesma coisa que pedir para ele gravar. Sem essa prova,
 * acertar a pasta vira palpite, e o palpite errado é pior que a lentidão:
 * grava num lugar que o Apache não serve e todas as artes ficam quebradas.
 *
 * `MEDIA_LOCAL_DIR` escapa da prova, para o caso de o handler ser removido ou
 * de o arranjo de pastas mudar. Aí a responsabilidade é de quem configurou.
 */
async function resolveLocalTarget(
  config: ResolvedStorageConfig
): Promise<LocalTarget | null> {
  const { uploadUrl } = config;
  if (!uploadUrl) return null;

  const chave = `${uploadUrl}|${process.env.MEDIA_LOCAL_DIR || ""}`;
  if (localTargetCache?.key === chave) return localTargetCache.value;

  let url: URL;
  try {
    url = new URL(uploadUrl);
  } catch {
    localTargetCache = { key: chave, value: null };
    return null;
  }

  const publicBase = new URL(".", url).toString().replace(/\/$/, "");
  const marcador = path.basename(url.pathname);

  const forcado = (process.env.MEDIA_LOCAL_DIR || "").trim();
  const candidatos = forcado ? [forcado] : localCandidates(url);

  let escolhido: LocalTarget | null = null;

  for (const dir of candidatos) {
    try {
      if (!forcado && marcador) {
        // A prova de identidade. Sem ela não se grava.
        await fs.access(path.join(dir, marcador), fsConstants.F_OK);
      }
      await fs.access(dir, fsConstants.W_OK);
      escolhido = { dir, publicBase };
      break;
    } catch {
      // Próximo candidato.
    }
  }

  localTargetCache = { key: chave, value: escolhido };

  if (!localTargetAnnounced) {
    localTargetAnnounced = true;
    if (escolhido) {
      await logInfo(
        "SYNC",
        `Artes gravadas direto no disco (${escolhido.dir}) — mesma máquina, sem passar pela internet.`,
        "lib/media-upload"
      );
    } else {
      await logInfo(
        "SYNC",
        `Artes enviadas por HTTP para ${uploadUrl}. A gravação direta não foi ativada porque ` +
          `nenhuma pasta candidata contém o \`${marcador}\`. Defina MEDIA_LOCAL_DIR se as pastas ` +
          `estiverem em outro arranjo.`,
        "lib/media-upload"
      );
    }
  }

  return escolhido;
}

/**
 * Repete a higienização que o PHP faz no nome, e acrescenta a que ele não faz.
 *
 * O handler limpa o nome com uma regex que **mantém o ponto**, então `..` passa
 * por ela inteiro. Isso nunca importou enquanto o destino era `__DIR__` de um
 * script isolado; gravando daqui, com o processo do app, um nome com `..`
 * escreveria fora da pasta pública. Por isso o `basename` no fim.
 */
function diskFilename(filename: string): string | null {
  const limpo = path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, "");
  if (!limpo || limpo === "." || limpo === "..") return null;
  return /\.(jpe?g|png|webp|gif)$/i.test(limpo) ? limpo : `${limpo}.jpg`;
}

/**
 * Grava o arquivo na pasta pública e devolve a URL.
 *
 * Passa por um nome temporário e um `rename` porque o Apache serve essa pasta
 * enquanto escrevemos: um `writeFile` direto pode ser lido pela metade e
 * entregar uma imagem truncada, que o banco então guardaria como definitiva.
 * O `rename` dentro do mesmo diretório é atômico.
 *
 * Devolve `null` em qualquer falha, e o chamador cai para o HTTP — a pasta
 * pode estar com a cota cheia ou sem permissão, e o handler PHP roda com outro
 * usuário, então ainda pode dar certo por lá.
 */
async function writeToLocalTarget(
  blob: Blob,
  filename: string,
  target: LocalTarget
): Promise<string | null> {
  const nome = diskFilename(filename);
  if (!nome) return null;

  const destino = path.join(target.dir, nome);
  const temporario = `${destino}.${randomUUID()}.parcial`;

  try {
    await fs.writeFile(temporario, Buffer.from(await blob.arrayBuffer()));
    await fs.rename(temporario, destino);
    return `${target.publicBase}/${nome}`;
  } catch (error) {
    console.warn(`[media-upload] Falha ao gravar no disco (${destino}): ${(error as Error).message}`);
    try {
      await fs.unlink(temporario);
    } catch {
      // O temporário pode nem ter sido criado.
    }
    return null;
  }
}

/**
 * Entrega um arquivo ao armazenamento e devolve a URL pública.
 *
 * Duas rotas para o mesmo destino: gravação direta no disco, quando a pasta
 * pública está nesta máquina, e o POST ao `cpanel-upload.php`, que continua
 * valendo para todo o resto — inclusive como rede de segurança quando o disco
 * recusa. Nos dois casos o arquivo termina na mesma pasta, com o mesmo nome e
 * a mesma URL.
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

  /*
   * Caminho curto: a pasta pública está nesta máquina.
   *
   * O envio por HTTP atravessava a internet duas vezes para entregar um arquivo
   * a uma pasta no mesmo disco — saía do Node, subia até a CDN, voltava ao
   * mesmo servidor, acordava um PHP e só então virava arquivo. Por peça isso é
   * um TLS novo mais dois trechos de rede; multiplicado pelos 1.200 criativos
   * de uma fila de mídia, é o próprio tempo da sincronização.
   *
   * Uma falha aqui não encerra o assunto: cai para o HTTP logo abaixo.
   */
  const local = await resolveLocalTarget(config);
  if (local) {
    const gravado = await writeToLocalTarget(blob, filename, local);
    if (gravado) return gravado;
  }

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

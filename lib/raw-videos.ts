/**
 * Os vídeos brutos que uma demanda de parceria recebeu.
 *
 * O arquivo mora no Drive, na pasta de brutos do mês (ver
 * `garantirPastaBrutos`); aqui fica só o que o card precisa saber para
 * mostrá-lo de volta: o id no Drive, o nome já renomeado pelo padrão, e quem
 * subiu. Mesma divisão de `lib/attachments.ts` — módulo puro, sem Prisma e sem
 * `fetch`, porque o componente que desenha a lista é de cliente e precisa das
 * mesmas regras que a rota aplica.
 *
 * Coluna própria no card, e não `attachments`: aquela guarda endereço de
 * arquivo no cPanel, e vídeo não vai para o cPanel. Ver `BoardCard.rawVideos`.
 */

export interface RawVideo {
  /** O id do arquivo no Drive — é dele que saem o link de abrir e o de baixar. */
  fileId: string;
  /** O nome final, já pelo padrão de nomenclatura (`montarNomeBruto`). */
  name: string;
  /** A pasta em que caiu, para o link "abrir a pasta". */
  folderId: string;
  size: number;
  uploadedAt: string;
  /** E-mail de quem subiu — é também quem entra no nome do arquivo. */
  uploadedBy: string;
}

/** Doze por card. Bruto de parceria é insumo, não acervo. */
export const MAX_RAW_VIDEOS = 12;

/**
 * Só vídeo, e a lista é a que o Drive e os navegadores tratam como tal.
 *
 * `video/quicktime` entra porque o `.mov` do iPhone é metade do que chega de
 * influenciador. `.mp4` é o que o padrão de nomenclatura espera (`REGRA.video`),
 * mas recusar um `.mov` na entrada faria a pessoa converter à mão antes de
 * subir — o Drive guarda os dois, e o nome não muda por causa da extensão.
 */
export const RAW_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
] as const;

export const RAW_VIDEO_ACCEPT = RAW_VIDEO_TYPES.join(",");

/**
 * Teto de 2 GB por vídeo.
 *
 * Não é o limite do corpo da requisição — o upload é fatiado e cada pedaço
 * passa sozinho pelo servidor (ver `lib/drive-delivery.ts`). É o limite de
 * paciência: acima disso o envio pela rede de um escritório leva mais de meia
 * hora, e quem fechar a aba perde tudo. Bruto maior que isso vai pelo Drive
 * direto, e o link colado no mesmo campo.
 */
export const RAW_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * O pedaço mandado por requisição: 4 MiB.
 *
 * Não é escolha livre — é o que a rota de relay aceita (teto de 5 MB) e um
 * múltiplo de 256 KiB, que é o que o upload resumível do Drive exige de todo
 * pedaço menos o último. Subir este número sem mexer nos dois faria o envio
 * falhar só nos arquivos grandes, que são justamente estes.
 */
export const RAW_VIDEO_CHUNK_BYTES = 4 * 1024 * 1024;

export function isRawVideoType(type: string): boolean {
  return (RAW_VIDEO_TYPES as readonly string[]).includes(type);
}

/** A extensão original, para o nome renomeado não perder o formato do arquivo. */
export function rawVideoExtension(filename: string): string {
  const ponto = filename.lastIndexOf(".");
  if (ponto < 0 || ponto === filename.length - 1) return "mp4";
  return filename
    .slice(ponto + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "mp4";
}

/**
 * O endereço para ABRIR o vídeo no Drive.
 *
 * Montado do id em vez de guardado: o `webViewLink` que o Drive devolve no fim
 * do upload é esse mesmo endereço, e guardar os dois deixaria o card com duas
 * verdades para a mesma coisa no dia em que uma delas mudasse de forma.
 */
export function rawVideoViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * O endereço para BAIXAR sem sair da página.
 *
 * Aponta para a nossa rota, não para o Drive. O link de download do Google
 * abre uma guia — e, em arquivo grande, uma página de aviso de antivírus antes
 * do arquivo. Pior: só funciona para quem tem permissão na pasta, e quem abre
 * uma demanda de parceria muitas vezes não tem. A rota baixa com a credencial
 * da service account e devolve os bytes como anexo, então o clique salva o
 * arquivo onde a pessoa está.
 */
export function rawVideoDownloadUrl(fileId: string): string {
  return `/api/creator/cards/raw-video/download?fileId=${encodeURIComponent(fileId)}`;
}

export function parseRawVideos(raw: string | null | undefined): RawVideo[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(ehRawVideo) : [];
  } catch {
    return [];
  }
}

function ehRawVideo(v: unknown): v is RawVideo {
  const o = v as RawVideo;
  return (
    !!o &&
    typeof o === "object" &&
    typeof o.fileId === "string" &&
    !!o.fileId &&
    typeof o.name === "string"
  );
}

/**
 * Limpa a lista antes de gravar.
 *
 * O id do Drive é o que a rota de download recebe e usa para buscar bytes com
 * a credencial da service account — que enxerga todo o drive. Um id inventado
 * por um cliente adulterado viraria um jeito de baixar qualquer arquivo do
 * Marketing pela nossa rota, então ele nunca vem do corpo da requisição sem
 * passar por aqui: a rota de conclusão só grava o id que o PRÓPRIO Drive
 * devolveu ao terminar o upload. Esta função é a segunda linha — corta o que
 * não tem forma de id e limita o tamanho da lista.
 */
export function sanitizeRawVideos(lista: unknown): RawVideo[] {
  const bruta = Array.isArray(lista) ? lista : [];

  return bruta
    .filter(ehRawVideo)
    .filter((v) => /^[A-Za-z0-9_-]{10,200}$/.test(v.fileId))
    .map((v) => ({
      fileId: v.fileId,
      name: String(v.name).slice(0, 300),
      folderId: typeof v.folderId === "string" ? v.folderId.slice(0, 200) : "",
      size: Number.isFinite(v.size) ? Math.max(0, Math.round(v.size)) : 0,
      uploadedAt: typeof v.uploadedAt === "string" ? v.uploadedAt : new Date().toISOString(),
      uploadedBy: typeof v.uploadedBy === "string" ? v.uploadedBy.slice(0, 200) : "",
    }))
    .slice(0, MAX_RAW_VIDEOS);
}

export function serializeRawVideos(lista: RawVideo[]): string | null {
  return lista.length ? JSON.stringify(lista) : null;
}

/** Tamanho legível, no padrão do país. Mesma régua de `lib/attachments.ts`. */
export function formatRawVideoSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
}

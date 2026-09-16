/**
 * Os anexos de referência de um card.
 *
 * Um briefing quase sempre vem com uma imagem junto — o print da campanha do
 * concorrente, o layout que a pessoa gostou, a arte da última veiculação. Sem
 * lugar para ela, a referência ia para o Slack e o card no quadro ficava sendo
 * metade do pedido.
 *
 * Módulo puro, sem Prisma e sem `fetch`: o formulário que escolhe o arquivo é
 * componente de cliente e precisa das mesmas regras que a rota aplica. Mesma
 * divisão de `lib/copy-options.ts`.
 */

export interface CardAttachment {
  /** URL pública no servidor externo. É sempre de lá — ver `sanitizeAttachments`. */
  url: string;
  /** O nome que o arquivo tinha na máquina de quem subiu. */
  name: string;
  size: number;
  uploadedAt: string;
}

/**
 * Só imagem, e este é o motivo.
 *
 * O handler do cPanel renomeia para `.jpg` tudo que não reconhece como imagem —
 * e responde `success` mesmo assim. Um PDF subiria, viraria `briefing.pdf.jpg`,
 * a plataforma gravaria a URL e o anexo abriria quebrado no quadro, sem nenhum
 * erro em lugar nenhum. Aceitar só o que o servidor de fato aceita é a única
 * forma de a recusa ser honesta e acontecer antes do upload.
 */
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.join(",");

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Teto de 4 MB por arquivo.
 *
 * Não é uma escolha de gosto: a plataforma roda em função sem servidor, cujo
 * corpo de requisição para em 4,5 MB, e a cota do cPanel é apertada — ele já
 * guarda a arte de 13 mil criativos. Um print de tela não chega perto disso;
 * quem tentar subir um PSD exportado precisa saber disso antes de esperar o
 * envio inteiro para receber um erro de servidor sem explicação.
 */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

/** Seis por card. O anexo é referência, não portfólio. */
export const MAX_ATTACHMENTS = 6;

export function attachmentExtension(type: string): string | null {
  return EXTENSION_BY_TYPE[type] ?? null;
}

/** Legível para gente, no padrão do país. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/**
 * O nome com que o arquivo vai morar no servidor.
 *
 * Único por construção: o handler PHP grava por cima de quem já estiver com o
 * mesmo nome, e "referencia.png" é o nome que todo mundo dá. Duas pessoas
 * subindo referências diferentes na mesma tarde perderiam uma delas — e a que
 * ficasse apareceria no card da outra.
 */
export function storageFilename(originalName: string, type: string): string {
  const ext = attachmentExtension(type) ?? "jpg";

  const base =
    originalName
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9\-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "referencia";

  const unico = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return `anexo-${unico}-${base}.${ext}`;
}

export function parseAttachments(raw: string | null | undefined): CardAttachment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is CardAttachment =>
        !!a && typeof a === "object" && typeof a.url === "string" && typeof a.name === "string"
    );
  } catch {
    return [];
  }
}

export function serializeAttachments(list: CardAttachment[]): string | null {
  return list.length ? JSON.stringify(list) : null;
}

/**
 * Filtra o que o cliente mandou, deixando passar só o que veio do nosso servidor.
 *
 * A tela devolve a lista de anexos ao criar o card, e uma lista de URLs vinda do
 * cliente é uma lista de URLs escolhida por quem quiser: sem esta checagem,
 * qualquer requisição forjada poria uma imagem de terceiros — ou um `javascript:`
 * — para ser renderizada no quadro de todo mundo. A URL só é aceita se o host
 * for o do armazenamento configurado, que é o único lugar de onde o upload pode
 * ter saído.
 */
export function sanitizeAttachments(value: unknown, allowedHost?: string | null): CardAttachment[] {
  if (!Array.isArray(value) || !allowedHost) return [];

  const limpos: CardAttachment[] = [];

  for (const item of value.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== "object") continue;

    const { url, name, size, uploadedAt } = item as Record<string, unknown>;
    if (typeof url !== "string") continue;

    let host: string;
    let protocolo: string;
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      protocolo = parsed.protocol;
    } catch {
      continue;
    }

    if (host !== allowedHost) continue;
    if (protocolo !== "https:" && protocolo !== "http:") continue;

    limpos.push({
      url,
      name: String(name ?? "referência").slice(0, 160),
      size: Number.isFinite(Number(size)) ? Number(size) : 0,
      uploadedAt: typeof uploadedAt === "string" ? uploadedAt : new Date().toISOString(),
    });
  }

  return limpos;
}

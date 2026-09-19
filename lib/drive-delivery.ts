/**
 * Integração com o Google Drive para a entrega de criativos.
 *
 * Porta `lib/drive.js` do ad-naming-tool (Pedro Pimenta), trocando a origem da
 * credencial: lá vinha de arquivo local ou variável de ambiente; aqui vem de
 * `SystemSettings` (`driveServiceAccountJson`/`driveRootFolderId`), mesmo
 * padrão de leitura das demais credenciais do painel (ver `lib/auth.ts`,
 * `lib/meta-sync.ts`).
 *
 * Correção sobre o que o Pedro faz de verdade: o navegador NÃO manda os
 * pedaços direto pro Google. A API de upload do Drive não devolve cabeçalho
 * CORS para essa chamada (testado e documentado em `lib/drive.js` do
 * handoff) — por isso o servidor dele relaia cada pedaço
 * (`/api/upload-chunk` recebe os bytes e repassa pro Drive). Fazemos o
 * mesmo aqui: o servidor nunca segura o ARQUIVO INTEIRO, só um pedaço de
 * cada vez (a mitigação real para uma conta de 1 núcleo/2 GB é essa, não a
 * ausência total do servidor no caminho).
 *
 * ID unificado: diferente do Pedro (que separava `garantirPastaId`, para
 * estático/animação, de `garantirPastaVideo`, para vídeo sem card), aqui todo
 * formato usa o código do próprio card (`MKT-42`) — decisão do board. Vídeo
 * não tem Feed/Story: os arquivos vão direto na pasta do ID.
 *
 * `google-auth-library`, não `googleapis`: só a autenticação da service
 * account precisa de biblioteca — `files.list`/`files.create` são duas
 * chamadas REST simples, feitas com `fetch`. O pacote `googleapis` embute
 * clientes gerados para toda API do Google (o que ele próprio usa por baixo é
 * exatamente este pacote), e este projeto já cortou dependência pesada do
 * pacote de deploy antes (ver `DEPLOY.md`) — não faz sentido reintroduzir
 * megabytes de SDK para duas chamadas.
 */

import prisma from "./prisma";
import { GoogleAuth } from "google-auth-library";
import type { DeliveryFormat } from "./delivery-naming";
import { REGRA, formatoTemPosicoes } from "./delivery-naming";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/drive/v3/files" +
  "?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink,name";

const MESES_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function capitaliza(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function stripAcc(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function pastaBateMes(nomePasta: string, mesIdx: number): boolean {
  const n = stripAcc(nomePasta || "").toLowerCase();
  const so = n.replace(/[^a-z0-9]/g, "");
  const num1 = String(mesIdx + 1);
  const num2 = ("0" + (mesIdx + 1)).slice(-2);
  if (so === num1 || so === num2) return true;
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return n.indexOf(MESES[mesIdx]) > -1;
}

function pastaBatePos(nome: string, alvo: string): boolean {
  return stripAcc(nome || "").toLowerCase().trim() === alvo;
}

export interface DriveCredentials {
  serviceAccountJson: string;
  rootFolderId: string;
}

/**
 * Lê a credencial do banco. `null` quando falta configurar — quem chama
 * decide como reportar isso (mesmo espírito de `driveErro`/`notionErro` do
 * `app.js` do Pedro: falta de credencial não derruba o servidor, só desabilita
 * a função com o motivo real).
 */
export async function lerCredenciaisDrive(): Promise<DriveCredentials | null> {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { driveServiceAccountJson: true, driveRootFolderId: true },
  });
  if (!settings?.driveServiceAccountJson || !settings?.driveRootFolderId) return null;
  return {
    serviceAccountJson: settings.driveServiceAccountJson,
    rootFolderId: settings.driveRootFolderId,
  };
}

function criarAuth(serviceAccountJson: string): GoogleAuth {
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("driveServiceAccountJson não é um JSON válido — confira o valor colado em Configurações › Sistema.");
  }
  return new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
}

export class DriveFolders {
  private auth: GoogleAuth;
  private rootFolderId: string;
  private folderCache = new Map<string, Promise<{ id: string; trilha: string }>>();

  constructor(creds: DriveCredentials) {
    this.auth = criarAuth(creds.serviceAccountJson);
    this.rootFolderId = creds.rootFolderId;
  }

  private async accessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Não foi possível obter token de acesso da service account do Drive.");
    return token;
  }

  private async chamarDrive(path: string, init: RequestInit & { query?: Record<string, string> } = {}) {
    const token = await this.accessToken();
    const url = new URL(`${DRIVE_API}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new Error(`Drive recusou a chamada (${res.status}): ${texto.slice(0, 200)}`);
    }
    return res.json();
  }

  private async listarSubpastas(parentId: string): Promise<{ id: string; name: string }[]> {
    const q = `mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const data = await this.chamarDrive("", {
      query: {
        q,
        fields: "files(id,name)",
        pageSize: "100",
        spaces: "drive",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
      },
    });
    return data.files || [];
  }

  private async criarPasta(parentId: string, nome: string): Promise<string> {
    const data = await this.chamarDrive("", {
      method: "POST",
      query: { fields: "id", supportsAllDrives: "true" },
      body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    });
    if (!data.id) throw new Error(`Drive não devolveu o id da pasta "${nome}" recém-criada.`);
    return data.id;
  }

  private async acharOuCriar(parentId: string, bateFn: (nome: string) => boolean, nomeCriar: string): Promise<string> {
    const pastas = await this.listarSubpastas(parentId);
    const achou = pastas.find((f) => bateFn(f.name || ""));
    if (achou?.id) return achou.id;
    return this.criarPasta(parentId, nomeCriar);
  }

  private async resolverPastaFormato(formato: DeliveryFormat): Promise<{ id: string; trilha: string }> {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mesIdx = hoje.getMonth();
    const nomeAno = String(ano);
    const nomeMes = ("0" + (mesIdx + 1)).slice(-2) + "-" + capitaliza(MESES_LONG[mesIdx]);
    const nomeFormato = REGRA[formato].prefixoPasta;

    const chave = `formato|${formato}-${ano}-${mesIdx}`;
    if (!this.folderCache.has(chave)) {
      const p = (async () => {
        const anoId = await this.acharOuCriar(this.rootFolderId, (n) => n.trim() === nomeAno, nomeAno);
        const mesId = await this.acharOuCriar(anoId, (n) => pastaBateMes(n, mesIdx), nomeMes);
        const formatoId = await this.acharOuCriar(mesId, (n) => stripAcc(n).toLowerCase().includes(stripAcc(nomeFormato).toLowerCase()), nomeFormato);
        return { id: formatoId, trilha: `${nomeAno} › ${nomeMes} › ${nomeFormato}` };
      })().catch((err) => {
        this.folderCache.delete(chave);
        throw err;
      });
      this.folderCache.set(chave, p);
    }
    return this.folderCache.get(chave)!;
  }

  /**
   * Pasta de destino da entrega deste card: Ano/Mês/Formato/MKT-XXXX, com
   * Feed/Story dentro quando o formato é pareado (estático/animação). Vídeo
   * devolve só o `id` — os arquivos vão direto nele, sem subpasta.
   */
  async garantirPastaEntrega(
    formato: DeliveryFormat,
    idCard: string
  ): Promise<{ id: string; feedId?: string; storyId?: string; trilha: string }> {
    const idKey = (idCard || "sem-id").trim() || "sem-id";
    const chave = `entrega|${formato}|${idKey}`;
    if (!this.folderCache.has(chave)) {
      const p = (async () => {
        const base = await this.resolverPastaFormato(formato);
        const idFolderId = await this.acharOuCriar(
          base.id,
          (n) => n.trim().toUpperCase() === idKey.toUpperCase(),
          idKey
        );

        if (!formatoTemPosicoes(formato)) {
          return { id: idFolderId, trilha: `${base.trilha} › ${idKey}` };
        }

        const [feedId, storyId] = await Promise.all([
          this.acharOuCriar(idFolderId, (n) => pastaBatePos(n, "feed"), "Feed"),
          this.acharOuCriar(idFolderId, (n) => pastaBatePos(n, "story"), "Story"),
        ]);
        return { id: idFolderId, feedId, storyId, trilha: `${base.trilha} › ${idKey}` };
      })().catch((err) => {
        this.folderCache.delete(chave);
        throw err;
      }) as Promise<{ id: string; trilha: string }>;
      this.folderCache.set(chave, p);
    }
    return this.folderCache.get(chave) as Promise<{ id: string; feedId?: string; storyId?: string; trilha: string }>;
  }

  /**
   * Abre uma sessão de upload resumível e devolve a URL que o servidor (não o
   * navegador — ver nota no topo do arquivo) usa para mandar os pedaços.
   */
  async iniciarUploadResumivel(params: { parentId: string; filename: string; mimeType?: string }): Promise<string> {
    const accessToken = await this.accessToken();

    const res = await fetch(UPLOAD_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": params.mimeType || "application/octet-stream",
      },
      body: JSON.stringify({ name: params.filename, parents: [params.parentId] }),
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new Error(`Drive recusou iniciar o upload (${res.status}): ${texto.slice(0, 200)}`);
    }
    const uploadUrl = res.headers.get("location");
    if (!uploadUrl) throw new Error("Drive não devolveu a URL de upload.");
    return uploadUrl;
  }

  /** Repassa um pedaço (recebido do navegador) pra sessão resumível já aberta. */
  async enviarPedaco(params: {
    uploadUrl: string;
    chunk: Buffer;
    offset: number;
    tamanhoTotal: number;
  }): Promise<{ concluido: boolean; arquivo?: { id: string; webViewLink: string; name: string } }> {
    const fim = params.offset + params.chunk.length - 1;
    /*
     * `fetch`/`BodyInit` não aceita `Buffer` do Node no tipo — `Buffer.buffer`
     * é `ArrayBufferLike` (pode ser `SharedArrayBuffer`), e o lib DOM quer
     * `ArrayBuffer` especificamente. Em runtime o Node aceita `Buffer` (que É
     * um `Uint8Array`) sem nenhum problema; o `as` é só pra typing, não muda o
     * que sobe.
     */
    const corpo = new Uint8Array(params.chunk.buffer, params.chunk.byteOffset, params.chunk.byteLength) as BodyInit;
    const res = await fetch(params.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(params.chunk.length),
        "Content-Range": `bytes ${params.offset}-${fim}/${params.tamanhoTotal}`,
      },
      body: corpo,
    });
    if (res.status === 200 || res.status === 201) {
      return { concluido: true, arquivo: await res.json() };
    }
    if (res.status === 308) {
      return { concluido: false };
    }
    const texto = await res.text().catch(() => "");
    throw new Error(`Drive recusou o pedaço do arquivo (${res.status}): ${texto.slice(0, 200)}`);
  }
}

export async function criarDriveFolders(): Promise<DriveFolders> {
  const creds = await lerCredenciaisDrive();
  if (!creds) {
    throw new Error(
      "Google Drive não configurado — preencha a service account e a pasta raiz em Configurações › Sistema."
    );
  }
  return new DriveFolders(creds);
}

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
  /** Resolvido uma vez por instância — ver `idDoDriveCompartilhado`. */
  private sharedDriveId: Promise<string> | null = null;

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
   * O id do drive compartilhado em que a pasta raiz configurada vive.
   *
   * Derivado da própria raiz, e não de um nome procurado em `drives.list`: o
   * "Marketing" das parcerias é o MESMO drive que já guarda "01- Tráfego
   * Pago", então perguntar ao Drive de quem é a pasta que já está configurada
   * responde sozinho — sem depender de a conta enxergar a lista de drives, e
   * sem quebrar no dia em que alguém renomear o drive.
   */
  private async idDoDriveCompartilhado(): Promise<string> {
    if (!this.sharedDriveId) {
      this.sharedDriveId = (async () => {
        const data = await this.chamarDrive(`/${this.rootFolderId}`, {
          query: { fields: "id,name,driveId", supportsAllDrives: "true" },
        });
        if (!data.driveId) {
          throw new Error(
            `A pasta raiz configurada ("${data.name ?? this.rootFolderId}") não está num drive compartilhado — ` +
              "as pastas de parcerias vivem no drive Marketing, e só de lá dá para chegar nelas."
          );
        }
        return data.driveId as string;
      })().catch((err) => {
        this.sharedDriveId = null;
        throw err;
      });
    }
    return this.sharedDriveId;
  }

  /**
   * Acha "09-Parcerias", por qualquer um dos dois caminhos de permissão.
   *
   * Existem duas formas legítimas de dar acesso a essa pasta, e elas levam a
   * APIs diferentes — por isso as duas tentativas:
   *
   * 1. A conta é MEMBRO do drive compartilhado. Aí a raiz do drive é listável,
   *    e a pasta é filha dela. É o caminho preferido: além de achar, permite
   *    CRIAR a pasta se ela ainda não existir.
   * 2. A conta recebeu a pasta compartilhada item a item. Aí a raiz do drive é
   *    invisível — o Drive responde "File not found" para ela —, mas a própria
   *    pasta aparece numa busca por nome.
   *
   * Tentar a primeira e cair na segunda é o que faz a troca da credencial
   * funcionar sem ninguém precisar saber qual das duas foi usada. O que não dá
   * para fazer no caminho 2 é criar a pasta: sem enxergar o pai, não há onde.
   */
  private async resolverPastaParcerias(): Promise<string> {
    const bate = (n: string) => stripAcc(n).toLowerCase().includes("parcerias");

    try {
      const driveId = await this.idDoDriveCompartilhado();
      return await this.acharOuCriar(driveId, bate, "09-Parcerias");
    } catch (err) {
      const texto = err instanceof Error ? err.message : String(err);
      // Erro que não seja de alcance sobe como está: uma cota estourada ou um
      // JSON de credencial inválido não se resolve procurando a pasta de outro
      // jeito, e mascará-los aqui esconderia a causa real.
      if (!/not found|404|403/i.test(texto)) throw err;
    }

    /* Caminho 2: a pasta em si foi compartilhada, e é só ela que se enxerga. */
    const achadas = await this.procurarPastasPorNome("parcerias");
    if (achadas.length === 1) return achadas[0].id;

    if (achadas.length > 1) {
      throw new Error(
        `A conta de serviço enxerga ${achadas.length} pastas com "parcerias" no nome ` +
          `(${achadas.map((f) => `"${f.name}"`).join(", ")}) e não há como saber qual é a certa. ` +
          "Adicione-a como membro do drive \"Marketing\" para que o caminho seja resolvido pela árvore."
      );
    }

    throw new Error(
      "A conta de serviço do Drive não alcança \"09-Parcerias\". " +
        "Compartilhe essa pasta com ela como Gerenciador de conteúdo, ou — melhor — " +
        "adicione-a como membro do drive \"Marketing\", que também permite criar as pastas do ano e do mês."
    );
  }

  /** Pastas com este texto no nome, em tudo que a conta enxerga. */
  private async procurarPastasPorNome(termo: string): Promise<{ id: string; name: string }[]> {
    const data = await this.chamarDrive("", {
      query: {
        q: `mimeType = 'application/vnd.google-apps.folder' and name contains '${termo}' and trashed = false`,
        fields: "files(id,name)",
        pageSize: "20",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
      },
    });
    return data.files || [];
  }

  /**
   * Pasta dos vídeos brutos de parceria:
   * `Marketing › 09-Parcerias › <ano> › <MM-Mês> › 00-BRUTOS`.
   *
   * Parte da RAIZ DO DRIVE, não de `rootFolderId`: "09-Parcerias" é irmã de
   * "01- Tráfego Pago", não filha dela. É a única função aqui que sobe um
   * nível — a entrega de criativo nasce dentro da pasta configurada, o bruto
   * de parceria não.
   *
   * Cria o que faltar em qualquer um dos níveis, como a entrega já faz: a
   * pasta do mês só existe depois que alguém entrega algo naquele mês, e a de
   * BRUTOS só depois do primeiro bruto.
   *
   * A data é a da ABERTURA DA DEMANDA, não a de hoje: um vídeo subido no dia 2
   * de outubro para uma demanda de setembro pertence a setembro, e é em
   * setembro que quem procura vai olhar.
   */
  async garantirPastaBrutos(dataAbertura: Date): Promise<{ id: string; trilha: string }> {
    const ano = dataAbertura.getFullYear();
    const mesIdx = dataAbertura.getMonth();
    const nomeAno = String(ano);
    const nomeMes = ("0" + (mesIdx + 1)).slice(-2) + "-" + capitaliza(MESES_LONG[mesIdx]);

    const chave = `brutos|${ano}-${mesIdx}`;
    if (!this.folderCache.has(chave)) {
      const p = (async () => {
        const parceriasId = await this.resolverPastaParcerias();
        const anoId = await this.acharOuCriar(parceriasId, (n) => n.trim() === nomeAno, nomeAno);
        const mesId = await this.acharOuCriar(anoId, (n) => pastaBateMes(n, mesIdx), nomeMes);
        const brutosId = await this.acharOuCriar(
          mesId,
          (n) => stripAcc(n).toLowerCase().replace(/[^a-z]/g, "") === "brutos",
          "00-BRUTOS"
        );

        return { id: brutosId, trilha: `09-Parcerias › ${nomeAno} › ${nomeMes} › 00-BRUTOS` };
      })().catch((err) => {
        this.folderCache.delete(chave);
        throw err;
      });
      this.folderCache.set(chave, p);
    }
    return this.folderCache.get(chave)!;
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

  /**
   * Abre o arquivo no Drive para leitura, devolvendo a resposta CRUA.
   *
   * A resposta inteira, e não os bytes: quem chama vai repassá-la ao navegador,
   * e o corpo é um fluxo. Lê-lo aqui para devolver um `Buffer` colocaria um
   * vídeo de dois gigabytes na memória de uma conta de 1 núcleo e 2 GB — o
   * mesmo motivo pelo qual o upload sobe em pedaços. Repassando o fluxo, o
   * servidor só encaminha bytes, sem nunca segurar o arquivo.
   */
  async abrirArquivoParaDownload(fileId: string): Promise<Response> {
    const token = await this.accessToken();
    const url = new URL(`${DRIVE_API}/${fileId}`);
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new Error(`Drive recusou a leitura do arquivo (${res.status}): ${texto.slice(0, 200)}`);
    }
    return res;
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

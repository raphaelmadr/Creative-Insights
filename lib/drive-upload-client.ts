/**
 * Sobe um arquivo para o Drive a partir do navegador, em pedaços.
 *
 * Mora aqui, e não dentro de um componente, porque dois painéis fazem o mesmo
 * envio: a entrega do criativo e o vídeo bruto de parceria. Eram a mesma
 * função copiada, e a cópia já estava divergindo — uma devolvia o arquivo
 * criado, a outra jogava fora o resultado que o Drive manda no último pedaço.
 *
 * "Em pedaços" não é detalhe: os bytes passam pelo NOSSO servidor (a API de
 * upload do Drive não devolve cabeçalho CORS para o navegador — ver a nota no
 * topo de `lib/drive-delivery.ts`), e ele segura um pedaço por vez. O tamanho
 * do pedaço é acordado em três lugares — aqui, no teto da rota de relay e no
 * múltiplo de 256 KiB que o upload resumível exige —, então mexer nele sozinho
 * quebra só os arquivos grandes.
 */

export const DRIVE_CHUNK_BYTES = 4 * 1024 * 1024;

export interface ArquivoNoDrive {
  id: string;
  name: string;
  webViewLink?: string;
}

export async function subirParaDrive(params: {
  file: File;
  parentId: string;
  /** O nome FINAL, já pelo padrão de nomenclatura — não o nome que veio da máquina. */
  filename: string;
  onProgresso?: (pct: number) => void;
  /** Para o envio parar quando alguém fecha o painel no meio. */
  cancelado?: () => boolean;
}): Promise<ArquivoNoDrive> {
  const sessaoRes = await fetch("/api/creator/cards/delivery/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parentId: params.parentId,
      filename: params.filename,
      mimeType: params.file.type,
    }),
  });
  const sessao = await sessaoRes.json();
  if (!sessaoRes.ok) throw new Error(sessao.error || "Erro ao iniciar o upload.");

  let offset = 0;
  const total = params.file.size;

  while (offset < total) {
    if (params.cancelado?.()) throw new Error("Envio cancelado.");

    const fim = Math.min(offset + DRIVE_CHUNK_BYTES, total);
    const pedaco = await params.file.slice(offset, fim).arrayBuffer();
    const url =
      `/api/creator/cards/delivery/chunk?uploadUrl=${encodeURIComponent(sessao.uploadUrl)}` +
      `&offset=${offset}&total=${total}`;

    const res = await fetch(url, { method: "POST", body: pedaco });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao enviar um pedaço do arquivo.");

    offset = fim;
    params.onProgresso?.(Math.round((offset / total) * 100));

    /*
     * O Drive devolve o arquivo criado junto com o ÚLTIMO pedaço, e é a única
     * vez que ele diz o id. Quem descartava essa resposta precisava depois
     * procurar o arquivo pelo nome para saber onde ele foi parar — o que erra
     * assim que dois envios geram o mesmo nome.
     */
    if (data.concluido && data.arquivo?.id) return data.arquivo as ArquivoNoDrive;
  }

  throw new Error("O Drive não confirmou o arquivo ao fim do envio.");
}

/**
 * Sobe uma leva de vídeos brutos para a demanda: pasta, arquivos, registro.
 *
 * Os três passos moram juntos porque são um só do ponto de vista de quem
 * clica, e porque nenhum deles faz sentido sozinho — pasta resolvida sem
 * arquivo é uma pasta vazia no Drive, arquivo subido sem registro é um vídeo
 * que ninguém encontra a partir do card.
 *
 * Existe fora do componente porque DOIS momentos a usam: o card aberto, onde a
 * demanda já tem número, e a abertura da demanda, onde os arquivos ficam na
 * fila até o card existir. Era a diferença entre o recurso aparecer e não
 * aparecer no formulário — o nome do arquivo leva o MKT-XXXX, então o envio só
 * pode acontecer depois da criação, mas a ESCOLHA do arquivo acontece antes.
 */
export async function enviarVideosBrutos(params: {
  cardId: string;
  fieldKey: string;
  files: File[];
  onProgresso?: (nome: string, pct: number) => void;
}): Promise<{ rawVideos: unknown[]; linkDaPasta: string | null }> {
  const res = await fetch("/api/creator/cards/raw-video/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cardId: params.cardId,
      fieldKey: params.fieldKey,
      arquivos: params.files.map((f) => ({ name: f.name })),
    }),
  });
  const destino = await res.json();
  if (!res.ok) throw new Error(destino.error || "Não foi possível preparar o envio.");

  const subidos = [];
  for (const [i, file] of params.files.entries()) {
    const filename: string = destino.nomes[i];
    params.onProgresso?.(filename, 0);

    const arquivo = await subirParaDrive({
      file,
      parentId: destino.id,
      filename,
      onProgresso: (pct) => params.onProgresso?.(filename, pct),
    });

    subidos.push({
      fileId: arquivo.id,
      name: filename,
      folderId: destino.id,
      size: file.size,
    });
  }

  const reg = await fetch("/api/creator/cards/raw-video/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId: params.cardId, fieldKey: params.fieldKey, videos: subidos }),
  });
  const gravado = await reg.json();
  /* O vídeo JÁ ESTÁ no Drive quando isto falha — a mensagem diz isso, porque
     "falha no envio" faria a pessoa subir tudo de novo e duplicar o arquivo. */
  if (!reg.ok) throw new Error(gravado.error || "O vídeo subiu, mas não foi registrado no card.");

  return {
    rawVideos: gravado.rawVideos ?? [],
    /* A pasta em que os vídeos caíram, para a caixa de link se responder
       sozinha — ver a rota de conclusão. */
    linkDaPasta: destino.id ? `https://drive.google.com/drive/folders/${destino.id}` : null,
  };
}

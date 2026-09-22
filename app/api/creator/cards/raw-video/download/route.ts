/**
 * Baixa um vídeo bruto sem sair da página.
 *
 * Existe porque o link de download do Google não serve aqui por três motivos
 * somados: abre uma guia nova, mostra um aviso de antivírus antes de qualquer
 * arquivo grande, e só funciona para quem tem permissão na pasta — que não é o
 * caso de boa parte de quem abre uma demanda de parceria. Esta rota busca os
 * bytes com a credencial da service account e os devolve como anexo, então o
 * clique salva o arquivo onde a pessoa já está.
 *
 * O fluxo é REPASSADO, não lido: o corpo do Drive vira o corpo desta resposta
 * sem passar pela memória (ver `abrirArquivoParaDownload`). Um vídeo de dois
 * gigabytes carregado numa conta de 1 núcleo e 2 GB derrubaria o servidor para
 * todo mundo.
 *
 * A autorização é o ponto delicado. A service account enxerga o drive inteiro
 * do Marketing, então esta rota é, por construção, capaz de ler qualquer
 * arquivo de lá — e recebe o id pela query string. Por isso o id só é aceito se
 * ALGUM card do quadro o tiver em `rawVideos`: o que se pode baixar por aqui é
 * exatamente o que a plataforma subiu, e nada mais. Sem essa conferência, a
 * rota seria um caminho aberto para ler qualquer documento do Marketing com uma
 * sessão comum.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { criarDriveFolders } from "@/lib/drive-delivery";
import { parseRawVideos } from "@/lib/raw-videos";

export async function GET(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  const fileId = new URL(request.url).searchParams.get("fileId") || "";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return NextResponse.json({ error: "Identificador de arquivo inválido." }, { status: 400 });
  }

  try {
    /*
     * `contains` acha o card candidato, e a conferência de verdade é feita
     * depois sobre o JSON já interpretado.
     *
     * A busca por texto é grosseira de propósito — é só um filtro para não
     * varrer o quadro inteiro. Aceitar o resultado dela seria aceitar um id que
     * aparece como PEDAÇO de outro; quem decide é a comparação exata abaixo.
     */
    const candidatos = await prisma.boardCard.findMany({
      where: { rawVideos: { contains: fileId } },
      select: { rawVideos: true },
      take: 20,
    });

    const registrado = candidatos
      .flatMap((c) => parseRawVideos(c.rawVideos))
      .find((v) => v.fileId === fileId);

    if (!registrado) {
      return NextResponse.json(
        { error: "Este vídeo não pertence a nenhuma demanda." },
        { status: 404 }
      );
    }

    const drive = await criarDriveFolders();
    const resposta = await drive.abrirArquivoParaDownload(fileId);

    if (!resposta.body) {
      return NextResponse.json({ error: "O Drive não devolveu o arquivo." }, { status: 502 });
    }

    const cabecalhos = new Headers({
      "Content-Type": resposta.headers.get("content-type") || "application/octet-stream",
      /* `attachment` com o nome já renomeado: é o que faz o navegador salvar em
         vez de navegar, e é o que dá ao arquivo salvo o nome do padrão — não o
         id do Drive. As aspas do nome são escapadas porque o nome vem do banco. */
      "Content-Disposition": `attachment; filename="${registrado.name.replace(/["\\]/g, "")}"`,
      "Cache-Control": "private, no-store",
    });

    const tamanho = resposta.headers.get("content-length");
    if (tamanho) cabecalhos.set("Content-Length", tamanho);

    return new Response(resposta.body, { status: 200, headers: cabecalhos });
  } catch (err) {
    console.error("[Bruto] Falha no download:", err);
    return NextResponse.json(
      { error: "Não foi possível baixar o vídeo agora. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

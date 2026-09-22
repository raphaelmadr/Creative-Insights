/**
 * Resolve a pasta de brutos de parceria e diz como cada arquivo vai se chamar.
 *
 * Uma chamada só, e não duas, porque as duas respostas saem dos mesmos dados do
 * card: a pasta depende do MÊS DE ABERTURA da demanda, e o nome depende das
 * frentes, do código e do nome do parceiro respondidos nela. Separadas, a tela
 * teria de buscar o card duas vezes e montar o nome por conta própria — e o
 * nome montado no navegador é exatamente o que este projeto evita, porque ele
 * diverge do servidor no primeiro campo novo.
 *
 * O índice de cada arquivo continua de onde o card parou: subir dois vídeos
 * hoje e mais um amanhã numera 1, 2 e 3, não 1, 2 e 1 de novo.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { formatCardCode, parseValues, camposVisiveis, envioLiberado } from "@/lib/kanban";
import { criarDriveFolders } from "@/lib/drive-delivery";
import { montarNomeBruto, frentesDoCard, nomeResponsavelDoEmail } from "@/lib/delivery-naming";
import { parseRawVideos, rawVideoExtension, MAX_RAW_VIDEOS } from "@/lib/raw-videos";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { cardId, fieldKey, arquivos } = await request.json();
    if (!cardId || !fieldKey || !Array.isArray(arquivos) || arquivos.length === 0) {
      return NextResponse.json(
        { error: "Faltam campos (cardId, fieldKey e a lista de arquivos)." },
        { status: 400 }
      );
    }

    const card = await prisma.boardCard.findUnique({
      where: { id: cardId },
      select: { code: true, boardId: true, values: true, rawVideos: true, createdAt: true },
    });
    if (!card) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

    const idCard = formatCardCode(card.code);
    if (!idCard) {
      return NextResponse.json(
        { error: "Este card não tem um código (MKT-XXXX) — não é possível nomear o vídeo." },
        { status: 400 }
      );
    }

    /*
     * A permissão de subir é do CAMPO, conferida aqui e não só na tela.
     *
     * A tela esconde o botão quando a regra não vale, mas esconder não é
     * proibir: esta rota cria pasta no drive do Marketing, e quem chamá-la
     * direto não passou por tela nenhuma. Confere-se o que a tela mostraria —
     * o campo existe, está visível para estas respostas, e o envio está
     * liberado para elas.
     */
    const campos = await prisma.boardField.findMany({
      where: { boardId: card.boardId },
      orderBy: { position: "asc" },
    });
    const respostas = parseValues(card.values);
    const campo = camposVisiveis(campos, respostas).find((f) => f.key === fieldKey);

    if (!campo || !envioLiberado(campo, campos, respostas)) {
      return NextResponse.json(
        { error: "Este campo não aceita envio de vídeo com as respostas atuais da demanda." },
        { status: 400 }
      );
    }

    const jaSubidos = parseRawVideos(card.rawVideos);
    if (jaSubidos.length + arquivos.length > MAX_RAW_VIDEOS) {
      return NextResponse.json(
        { error: `São no máximo ${MAX_RAW_VIDEOS} vídeos por demanda — este card já tem ${jaSubidos.length}.` },
        { status: 400 }
      );
    }

    /*
     * As frentes e o nome do parceiro saem do CARD, não do corpo da requisição.
     *
     * É o que garante que o nome do arquivo descreva a demanda de verdade. A
     * tela poderia mandá-los — ela os tem na mão —, mas aí o nome passaria a
     * refletir o que estava na tela de quem subiu, que pode ser uma aba aberta
     * antes de outra pessoa corrigir a frente.
     *
     * `frentesDoCard` é a MESMA função que o painel de entrega usa: o bruto e a
     * entrega da mesma demanda não podem discordar sobre qual é a frente dela.
     */
    const frentes = frentesDoCard(campos, respostas);

    const campoInfluenciador = campos.find((f) => /influenc|embaixador/i.test(f.label));
    const nomeInfluenciador = campoInfluenciador
      ? String(respostas[campoInfluenciador.key] ?? "")
      : "";

    /* Quem sobe o vídeo entra no nome — decisão da equipe, e diferente da
       entrega, que usa o responsável do card. */
    const responsavel = user.name || nomeResponsavelDoEmail(user.email);

    const drive = await criarDriveFolders();
    const pasta = await drive.garantirPastaBrutos(card.createdAt);

    const nomes = arquivos.map((arquivo: { name?: string }, i: number) => {
      const base = montarNomeBruto({
        indice: jaSubidos.length + i + 1,
        frentes,
        responsavel,
        idCard,
        nomeInfluenciador,
        data: card.createdAt,
      });
      return `${base}.${rawVideoExtension(String(arquivo?.name ?? ""))}`;
    });

    return NextResponse.json({ ...pasta, idCard, nomes });
  } catch (err) {
    console.error("[Bruto] Falha ao resolver a pasta:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao resolver a pasta de brutos." },
      { status: 500 }
    );
  }
}

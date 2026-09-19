/**
 * Abre uma sessão de upload resumível do Drive para um arquivo da entrega.
 *
 * Devolve só a URL da sessão — o navegador fatia o arquivo e manda cada
 * pedaço para `/api/creator/cards/delivery/chunk`, não para cá. Ver o
 * comentário no topo de `lib/drive-delivery.ts` sobre por que os pedaços
 * passam pelo nosso servidor em vez de irem direto pro Google.
 */

import { NextResponse } from "next/server";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { criarDriveFolders } from "@/lib/drive-delivery";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { parentId, filename, mimeType } = await request.json();
    if (!parentId || !filename) {
      return NextResponse.json({ error: "Faltam campos (parentId/filename)." }, { status: 400 });
    }

    const drive = await criarDriveFolders();
    const uploadUrl = await drive.iniciarUploadResumivel({ parentId, filename, mimeType });

    return NextResponse.json({ uploadUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao iniciar o upload." },
      { status: 500 }
    );
  }
}

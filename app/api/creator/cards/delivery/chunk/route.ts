/**
 * Recebe um pedaço do arquivo (o navegador fatia em pedaços de 4 MiB) e
 * repassa para a sessão resumível do Drive já aberta.
 *
 * `uploadUrl`/`offset`/`total` vão na query string, e o corpo da requisição é
 * o pedaço em si, cru — mesmo contrato de `/api/upload-chunk` do
 * ad-naming-tool. Teto de 5 MB por chamada: o pedaço nominal é 4 MiB, a
 * margem é só para não deixar a rota aceitar valor absurdo por engano.
 *
 * Pedaços pequenos por escolha, não por limite de plataforma: o teto de
 * payload que obrigava isso no Pedro era da Vercel (~4,5 MB), e este projeto
 * não está mais lá. Mantemos pedaços pequenos assim mesmo porque o servidor
 * segura um por vez na memória (ver `lib/drive-delivery.ts`) numa conta de
 * 1 núcleo/2 GB — arquivo inteiro na memória seria o problema real.
 */

import { NextResponse } from "next/server";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { criarDriveFolders } from "@/lib/drive-delivery";

const MAX_CHUNK_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const params = new URL(request.url).searchParams;
    const uploadUrl = params.get("uploadUrl");
    const offsetRaw = params.get("offset");
    const totalRaw = params.get("total");
    if (!uploadUrl || offsetRaw === null || !totalRaw) {
      return NextResponse.json({ error: "Faltam parâmetros do pedaço (uploadUrl/offset/total)." }, { status: 400 });
    }

    const chunk = Buffer.from(await request.arrayBuffer());
    if (!chunk.length) return NextResponse.json({ error: "Pedaço vazio." }, { status: 400 });
    if (chunk.length > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Pedaço maior que o esperado (5 MB)." }, { status: 413 });
    }

    const drive = await criarDriveFolders();
    const resultado = await drive.enviarPedaco({
      uploadUrl,
      chunk,
      offset: parseInt(offsetRaw, 10),
      tamanhoTotal: parseInt(totalRaw, 10),
    });

    return NextResponse.json(resultado);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao enviar o pedaço do arquivo." },
      { status: 500 }
    );
  }
}

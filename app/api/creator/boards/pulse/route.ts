/**
 * "Mudou alguma coisa no quadro?" — a pergunta que a tela repete enquanto está
 * aberta, para mostrar o card chegando sem que ninguém recarregue a página.
 *
 * A resposta é uma string curta, calculada por `boardPulse`. Se ela não mudou,
 * o cliente não pede mais nada; se mudou, ele recarrega o quadro. No caso
 * comum, que é o de nada ter acontecido, trafegam algumas dezenas de bytes.
 *
 * O caminho óbvio seria manter uma conexão aberta por aba (SSE/WebSocket), e é
 * exatamente o que esta hospedagem não comporta: são 20 processos de entrada
 * para a conta inteira, então vinte abas abertas tomariam todos e o site
 * pararia de responder para o resto.
 */

import { NextResponse } from "next/server";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { boardPulse } from "@/lib/kanban-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  const boardId = new URL(request.url).searchParams.get("boardId");
  if (!boardId) return NextResponse.json({ error: "boardId é obrigatório." }, { status: 400 });

  try {
    const pulse = await boardPulse(boardId);
    if (!pulse) return NextResponse.json({ error: "Quadro não encontrado." }, { status: 404 });

    return NextResponse.json({ success: true, pulse }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

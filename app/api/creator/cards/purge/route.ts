/**
 * Esvaziar o arquivo — de vez.
 *
 * Rota própria, e não mais um ramo do `DELETE` de `/api/creator/cards`, porque
 * aquele verbo ali significa **arquivar**: ele tira o card do quadro e guarda
 * tudo. Duas operações opostas atrás do mesmo endereço seria pedir para alguém
 * apagar o arquivo inteiro achando que estava arquivando um card.
 *
 * Só administrador. Não é rigor de segurança — é proporção: as demais
 * configurações do quadro se desfazem clicando de novo, e esta não se desfaz de
 * jeito nenhum. Briefing, copy, anexos e histórico vão juntos, por cascata, e
 * não há de onde trazê-los de volta.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { logWarning } from "@/lib/logger";

export async function DELETE(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Só um administrador pode esvaziar o arquivo." },
      { status: 403 }
    );
  }

  try {
    const { boardId, cardIds } = await request.json();
    if (!boardId) {
      return NextResponse.json({ error: "boardId é obrigatório." }, { status: 400 });
    }

    /*
     * Uma lista de ids apaga só aquelas; sem lista, o arquivo inteiro.
     *
     * É a mesma operação em duas escalas — apagar uma demanda e apagar o mês
     * todo —, e uma rota só é o que garante que as duas passem pelas mesmas
     * três garantias: administrador, quadro certo e SÓ ARQUIVADOS. Uma rota
     * separada para o caso individual seria a quarta chance de esquecer o
     * `archived: true`.
     */
    const escolhidos = Array.isArray(cardIds)
      ? cardIds.filter((id): id is string => typeof id === "string" && !!id)
      : null;

    if (escolhidos && !escolhidos.length) {
      return NextResponse.json({ error: "Nenhuma demanda selecionada." }, { status: 400 });
    }

    /*
     * `archived: true` é a parte que não pode faltar em hipótese alguma: sem
     * ela, esta chamada apaga o quadro em uso. Está escrita aqui, no servidor,
     * e não confiada ao que a tela mandar.
     */
    const { count } = await prisma.boardCard.deleteMany({
      where: { boardId, archived: true, ...(escolhidos ? { id: { in: escolhidos } } : {}) },
    });

    /*
     * Fica registrado como aviso, com nome e número.
     *
     * É a única operação do quadro que não deixa rastro nenhum onde aconteceu —
     * os cards apagados levam o próprio histórico junto. Se ninguém anotar
     * aqui, daqui a um mês a pergunta "onde foram parar as entregas de agosto?"
     * não terá resposta em lugar algum do sistema.
     */
    await logWarning(
      "KANBAN",
      escolhidos
        ? `${admin.name || admin.email} apagou em definitivo ${count} demanda(s) do arquivo do quadro ${boardId}.`
        : `${admin.name || admin.email} esvaziou o arquivo do quadro ${boardId}: ${count} demanda(s) apagada(s) em definitivo.`,
      "/api/creator/cards/purge"
    );

    return NextResponse.json({ success: true, removed: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

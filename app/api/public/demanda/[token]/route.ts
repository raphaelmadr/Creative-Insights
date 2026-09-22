/**
 * O formulário de demanda aberto ao público, por link.
 *
 * É o único endpoint do sistema que grava sem sessão, e tudo aqui existe por
 * causa disso:
 *
 * - **O token é a autorização.** Aleatório, guardado no quadro, revogável a
 *   qualquer momento. Sem ele não há nem como descobrir que a porta existe.
 * - **O e-mail é declarado, não provado.** Quem preenche digita o seu
 *   `@allugator.com`, e o sistema confere o domínio — não a posse. O card diz
 *   que veio do link público justamente para que ninguém leia aquele endereço
 *   como identidade verificada.
 * - **Só o formulário sai daqui.** O GET devolve o nome do quadro e as
 *   perguntas, e nada mais: nem cards, nem pessoas, nem configuração. Um link
 *   que vaza não vira uma janela para dentro do quadro.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { abrirDemanda } from "@/lib/demanda-intake";
import {
  CORPORATE_EMAIL_ERROR,
  isCorporateEmail,
  normalizeCorporateEmail,
} from "@/lib/corporate-email";
import { parseFormBuiltins, camposDoQuadro } from "@/lib/kanban";

export const dynamic = "force-dynamic";

/**
 * Um freio simples contra envio em rajada.
 *
 * Em memória, e por processo: some a cada publicação e não vale entre
 * instâncias. É de propósito — o que se quer barrar aqui é o clique repetido e
 * o script ingênuo, não um ataque coordenado, e uma tabela de contagem no banco
 * custaria uma escrita por tentativa numa rota que qualquer um alcança.
 *
 * Conta CARDS CRIADOS, e não requisições recebidas. Por isso são duas funções e
 * não uma: perguntar não registra nada, e só a criação bem-sucedida marca a
 * janela. Contando tentativa recusada, quem errasse o e-mail — ou esquecesse um
 * campo obrigatório — cinco vezes ficava trancado por um minuto, e o formulário
 * puniria justamente o engano que ele acabou de explicar como consertar.
 */
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 5;
const criacoes = new Map<string, number[]>();

function recentes(chave: string, agora: number): number[] {
  return (criacoes.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
}

function estaBloqueado(chave: string): boolean {
  return recentes(chave, Date.now()).length >= MAX_POR_JANELA;
}

function registrarCriacao(chave: string): void {
  const agora = Date.now();
  criacoes.set(chave, [...recentes(chave, agora), agora]);

  // A limpeza é oportunista: sem ela o mapa cresceria para sempre com chaves de
  // quem passou uma vez e nunca voltou.
  if (criacoes.size > 500) {
    for (const [k, v] of criacoes) {
      if (v.every((t) => agora - t >= JANELA_MS)) criacoes.delete(k);
    }
  }
}

/** O quadro por trás do token, ou nulo. Token vazio nunca casa. */
async function quadroDoToken(token: string) {
  if (!token || token.length < 12) return null;
  return prisma.board.findFirst({
    where: { publicToken: token, archived: false },
    select: {
      id: true,
      name: true,
      description: true,
      formBuiltins: true,
      fields: { orderBy: { position: "asc" } },
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const board = await quadroDoToken(token);

  if (!board) {
    return NextResponse.json(
      { error: "Este link não existe mais. Peça um novo a quem o enviou." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    board: {
      name: board.name,
      description: board.description,
      /*
       * As perguntas fixas saem daqui pelo mesmo motivo que as outras: é o
       * MESMO formulário do quadro, visto de fora.
       *
       * Era o buraco que fazia o time criar campo repetido. Esta tela só sabia
       * desenhar os campos definíveis, então o prazo e o briefing de fábrica
       * não existiam para quem chega pelo link — e a única saída era criar uma
       * pergunta de data e uma de briefing à mão, que passavam a conviver com
       * as de fábrica no formulário de dentro.
       */
      builtins: parseFormBuiltins(board.formBuiltins),
      // Sem `id`: quem preenche não precisa dele, e não tê-lo em mãos é uma
      // porta a menos para tentar as rotas autenticadas do quadro.
      fields: camposDoQuadro(board.fields).map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options,
        dependsOn: f.dependsOn,
        /* A regra de exibição vai junto: sem ela, o formulário de fora
           desenharia sempre todo campo condicional — inclusive o obrigatório
           que só vale para uma frente, travando o envio de quem escolheu
           outra. Ver `camposVisiveis`. */
        showWhenKey: f.showWhenKey,
        showWhenValues: f.showWhenValues,
        placeholder: f.placeholder,
        helpText: f.helpText,
        required: f.required,
        showOnCard: f.showOnCard,
      })),
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  try {
    const board = await quadroDoToken(token);
    if (!board) {
      return NextResponse.json(
        { error: "Este link não existe mais. Peça um novo a quem o enviou." },
        { status: 404 }
      );
    }

    const body = await req.json();

    const email = normalizeCorporateEmail(body.requesterEmail);
    if (!isCorporateEmail(email)) {
      return NextResponse.json({ error: CORPORATE_EMAIL_ERROR }, { status: 400 });
    }

    if (estaBloqueado(token)) {
      return NextResponse.json(
        { error: "Muitas demandas seguidas. Espere um minuto e tente de novo." },
        { status: 429 }
      );
    }

    /*
     * Daqui para baixo é a MESMA abertura de `/api/demanda` — conferir as
     * respostas, achar a etapa de entrada, tirar um número. A diferença inteira
     * entre as duas portas está acima: lá a identidade vem da sessão, aqui é
     * declarada, e `origin` guarda isso no card.
     *
     * `groupId` não é aceito: quem chega pelo link não conhece os times da
     * empresa, e a demanda entra pela etapa de entrada do quadro.
     */
    const resultado = await abrirDemanda({
      boardId: board.id,
      title: body.title,
      description: body.description,
      priority: body.priority,
      dueDate: body.dueDate,
      linkUrl: body.linkUrl,
      values: body.values,
      requester: { email, name: String(body.requesterName ?? "").trim() || email },
      origin: "PUBLIC",
    });

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    // Só agora a janela é marcada — o card existe.
    registrarCriacao(token);

    return NextResponse.json({ success: true, code: resultado.card.code });
  } catch (error: unknown) {
    console.error("[Demanda pública] Falha:", error);
    return NextResponse.json(
      { error: "Não foi possível abrir a demanda. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

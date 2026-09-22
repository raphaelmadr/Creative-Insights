/**
 * Os campos definíveis do formulário de um quadro.
 *
 * É o que deixa cada time perguntar o que precisa sem pedir código a ninguém.
 * As respostas ficam no JSON do card, então o que esta rota protege é a
 * integridade da pergunta: chave estável, tipo conhecido e opções coerentes com
 * o tipo. Ver `lib/kanban.ts`.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import {
  isFieldType,
  uniqueFieldKey,
  slugifyFieldKey,
  parseValues,
  renomearChaveNasRespostas,
  CHAVES_DE_FABRICA,
  CAMPOS_DE_FABRICA,
  FIELD_TYPES_WITH_OPTIONS,
  FIELD_TYPES_WITH_UPLOAD,
  FIELD_TYPES_AS_TRIGGER,
  type FieldType,
} from "@/lib/kanban";
import type { BoardField, Prisma } from "@prisma/client";

/** Uma lista de opções, limpa: sem vazias, sem repetidas. */
function limpar(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from(new Set(list.map((o) => String(o).trim()).filter(Boolean)));
}

/**
 * As opções vindas da tela, na forma que o campo exige.
 *
 * DUAS formas, e é `dependsOn` que decide qual: campo independente guarda uma
 * lista; campo dependente guarda um mapa do valor do pai para as escolhas
 * daquele valor.
 *
 * Esta função recebia só a lista, e era a origem de um defeito silencioso: o
 * campo "Formato" do quadro tinha `dependsOn` apontando para "canal" e uma
 * LISTA gravada dentro. `optionsFor` procura um mapa, não acha, e devolve zero
 * opções — o seletor de formato ficava permanentemente vazio, sem erro nenhum
 * em lugar nenhum. Com as duas formas passando por aqui, a que é gravada
 * sempre combina com a que é lida.
 */
function normalizeOptions(
  type: FieldType,
  raw: unknown,
  dependsOn: string | null
): string | null {
  if (!FIELD_TYPES_WITH_OPTIONS.includes(type)) return null;

  if (!dependsOn) {
    const clean = limpar(raw);
    return clean.length ? JSON.stringify(clean) : null;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const mapa: Record<string, string[]> = {};
  for (const [pai, lista] of Object.entries(raw as Record<string, unknown>)) {
    const clean = limpar(lista);
    // Valor do pai sem nenhuma escolha fica de fora: guardar a chave vazia só
    // faria o seletor abrir sem nada dentro, que é pior que a dica de vazio.
    if (clean.length) mapa[pai] = clean;
  }

  return Object.keys(mapa).length ? JSON.stringify(mapa) : null;
}

/**
 * O campo de que este pode depender.
 *
 * Só um SELECT do mesmo quadro serve de pai: o valor precisa ser UM, para que
 * haja uma chave a procurar no mapa. E nunca ele mesmo — um campo que depende
 * de si nunca teria pai preenchido, e ficaria vazio para sempre.
 */
async function validarPai(
  boardId: string,
  dependsOn: unknown,
  selfId?: string
): Promise<{ ok: true; key: string | null } | { ok: false; error: string }> {
  if (dependsOn === undefined) return { ok: true, key: null };
  if (dependsOn === null || dependsOn === "") return { ok: true, key: null };
  if (typeof dependsOn !== "string") return { ok: false, error: "Campo pai inválido." };

  const pai = await prisma.boardField.findFirst({
    where: { boardId, key: dependsOn },
    select: { id: true, type: true },
  });

  if (!pai) return { ok: false, error: "O campo de que este depende não existe neste quadro." };
  if (pai.id === selfId) return { ok: false, error: "Um campo não pode depender de si mesmo." };
  if (pai.type !== "SELECT") {
    return { ok: false, error: "Só um campo de escolha única pode ser o pai de outro." };
  }

  return { ok: true, key: dependsOn };
}

/**
 * A regra que faz um campo APARECER — campo revelador e respostas que o revelam.
 *
 * Outro eixo que `validarPai`, e por isso uma função separada: lá se decide de
 * onde saem as OPÇÕES deste campo, aqui se decide se ele existe na tela. O
 * mesmo campo pode ter os dois, e um revelador pode ser de qualquer tipo com
 * lista — inclusive escolha múltipla, que não serve de pai (ver
 * `FIELD_TYPES_AS_TRIGGER`).
 *
 * Regra com revelador e NENHUMA resposta marcada é recusada em vez de aceita e
 * ignorada: gravá-la deixaria o campo visível para sempre, que é o oposto do
 * que quem a escreveu pediu, e sem nada em lugar nenhum dizendo que a regra não
 * pegou.
 */
async function validarGatilho(
  boardId: string,
  showWhenKey: unknown,
  showWhenValues: unknown,
  selfId?: string,
  selfKey?: string
): Promise<
  | { ok: true; key: string | null; values: string | null }
  | { ok: false; error: string }
> {
  if (showWhenKey === undefined) return { ok: true, key: null, values: null };
  if (showWhenKey === null || showWhenKey === "") return { ok: true, key: null, values: null };
  if (typeof showWhenKey !== "string") return { ok: false, error: "Campo revelador inválido." };

  /*
   * O revelador pode ser uma pergunta de FÁBRICA — "só quando a frente for
   * Unboxing" é uma regra legítima, e a tela já oferece a frente na lista de
   * reveladores (ela chega em `fields` como qualquer outra). Procurar só no
   * banco devolveria "não existe neste quadro" para uma pergunta que está na
   * tela, bem à vista de quem escreveu a regra.
   */
  const gatilho =
    CAMPOS_DE_FABRICA.find((c) => c.key === showWhenKey) ??
    (await prisma.boardField.findFirst({
      where: { boardId, key: showWhenKey },
      select: { id: true, type: true, label: true },
    }));

  if (!gatilho) {
    return { ok: false, error: "O campo que revelaria este não existe neste quadro." };
  }
  if (gatilho.id === selfId) {
    return { ok: false, error: "Um campo não pode depender da própria resposta para aparecer." };
  }
  if (!FIELD_TYPES_AS_TRIGGER.includes(gatilho.type as FieldType)) {
    return {
      ok: false,
      error: "Só um campo de escolha — única ou múltipla — pode fazer outro aparecer.",
    };
  }

  /*
   * Nenhum ciclo na cadeia de revelação.
   *
   * A tela não restringe mais quem pode revelar quem — a ordem do formulário é
   * derivada da regra, então o revelador pode estar em qualquer posição. O que
   * ela NÃO pode é fechar um laço: "A aparece quando B" e "B aparece quando A"
   * deixa os dois escondidos para sempre, e nenhuma resposta possível os traz
   * de volta. `ordenarCampos` sobrevive a isso sem quebrar a tela, mas o par de
   * campos fica inalcançável — melhor recusar a regra que o cria.
   *
   * Sobe a cadeia a partir do revelador proposto: chegar de volta a este campo
   * é a definição do laço.
   */
  if (selfKey) {
    const doQuadro = await prisma.boardField.findMany({
      where: { boardId },
      select: { key: true, showWhenKey: true },
    });
    const acima = new Map(doQuadro.map((f) => [f.key, f.showWhenKey]));

    let subindo: string | null | undefined = showWhenKey;
    const visitados = new Set<string>();
    while (subindo && !visitados.has(subindo)) {
      if (subindo === selfKey) {
        return {
          ok: false,
          error: `"${gatilho.label}" já depende deste campo para aparecer — um não pode revelar o outro nos dois sentidos.`,
        };
      }
      visitados.add(subindo);
      subindo = acima.get(subindo);
    }
  }

  const respostas = limpar(showWhenValues);
  if (!respostas.length) {
    return {
      ok: false,
      error: `Escolha ao menos uma resposta de "${gatilho.label}" que faz este campo aparecer.`,
    };
  }

  return { ok: true, key: showWhenKey, values: JSON.stringify(respostas) };
}

/**
 * Troca a chave de um campo — e leva junto tudo que aponta para ela.
 *
 * São TRÊS coisas amarradas na mesma chave, e trocar só a primeira deixaria o
 * quadro pior do que estava: as respostas gravadas em cada card, as regras dos
 * outros campos que apontam para este (`dependsOn`, `showWhenKey`,
 * `uploadWhenKey`) e a chave em si. Meio caminho é o que dá medo: a chave nova
 * no campo e as respostas na velha é exatamente o estrago que esta rota existe
 * para consertar.
 *
 * Por isso uma transação, e não uma sequência de gravações. Ela percorre card
 * a card porque o valor é um JSON de texto — não há UPDATE que renomeie uma
 * propriedade dentro dele —, e a lista já vem estreitada aos cards que citam a
 * chave. O quadro real tem dezenas de cards; num de dezenas de milhares isto
 * vira trabalho de fila, e não de requisição.
 *
 * Os arquivados entram: a resposta deles é registro, e registro com a chave
 * velha some da tela do arquivo tão silenciosamente quanto sumiria a do quadro.
 */
async function trocarChave(
  campo: BoardField,
  para: string,
  dados: Prisma.BoardFieldUpdateInput
): Promise<BoardField> {
  const de = campo.key;

  return prisma.$transaction(
    async (tx) => {
      const cards = await tx.boardCard.findMany({
        // `contains` é só a peneira: a chave também pode aparecer como texto de
        // uma resposta qualquer, e quem decide é o `de in values` lá embaixo.
        where: { boardId: campo.boardId, values: { contains: `"${de}"` } },
        select: { id: true, values: true },
      });

      for (const card of cards) {
        const values = parseValues(card.values);
        if (!(de in values)) continue;
        await tx.boardCard.update({
          where: { id: card.id },
          data: { values: JSON.stringify(renomearChaveNasRespostas(values, de, para)) },
        });
      }

      for (const coluna of ["dependsOn", "showWhenKey", "uploadWhenKey"] as const) {
        await tx.boardField.updateMany({
          where: { boardId: campo.boardId, [coluna]: de },
          data: { [coluna]: para },
        });
      }

      return tx.boardField.update({ where: { id: campo.id }, data: { ...dados, key: para } });
    },
    { timeout: 20000 }
  );
}

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { boardId, label, type, options, placeholder, helpText, required, showOnCard, dependsOn,
      showWhenKey, showWhenValues, uploadWhenKey, uploadWhenValues } = await request.json();

    if (!boardId || !label?.trim()) {
      return NextResponse.json({ error: "Quadro e rótulo são obrigatórios." }, { status: 400 });
    }
    if (!isFieldType(type)) {
      return NextResponse.json({ error: "Tipo de campo desconhecido." }, { status: 400 });
    }

    const pai = await validarPai(boardId, dependsOn);
    if (!pai.ok) return NextResponse.json({ error: pai.error }, { status: 400 });

    const gatilho = await validarGatilho(boardId, showWhenKey, showWhenValues);
    if (!gatilho.ok) return NextResponse.json({ error: gatilho.error }, { status: 400 });

    /* A regra do ENVIO passa pela mesma validação, e sem checagem de ciclo: ela
       não decide se o campo existe na tela, só se o botão de subir arquivo
       aparece dentro dele — não há laço possível. */
    const envio = await validarGatilho(boardId, uploadWhenKey, uploadWhenValues);
    if (!envio.ok) return NextResponse.json({ error: envio.error }, { status: 400 });

    const serialized = normalizeOptions(type, options, pai.key);
    if (FIELD_TYPES_WITH_OPTIONS.includes(type) && !serialized) {
      return NextResponse.json(
        {
          error: pai.key
            ? "Um campo dependente precisa de pelo menos uma opção em algum valor do campo pai."
            : "Um campo de escolha precisa de pelo menos uma opção.",
        },
        { status: 400 }
      );
    }

    /* As chaves de fábrica entram como ocupadas: uma pergunta chamada "Frente"
       geraria a chave `frente`, que é a da pergunta de fábrica de mesmo nome —
       e duas perguntas com a mesma chave gravam uma por cima da outra. Com
       elas na lista, a nova nasce `frente_2` e continua sendo dela a resposta.
       Ver `CAMPOS_DE_FABRICA`. */
    const existing = await prisma.boardField.findMany({ where: { boardId }, select: { key: true } });
    const last = await prisma.boardField.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const field = await prisma.boardField.create({
      data: {
        boardId,
        key: uniqueFieldKey(label, [...CHAVES_DE_FABRICA, ...existing.map((f) => f.key)]),
        label: label.trim(),
        type,
        options: serialized,
        dependsOn: pai.key,
        showWhenKey: gatilho.key,
        showWhenValues: gatilho.values,
        // Só o tipo que aceita envio guarda a regra do envio: gravá-la num
        // campo de texto deixaria a condição viva, invisível, esperando o dia
        // em que alguém trocasse o tipo.
        uploadWhenKey: FIELD_TYPES_WITH_UPLOAD.includes(type) ? envio.key : null,
        uploadWhenValues: FIELD_TYPES_WITH_UPLOAD.includes(type) ? envio.values : null,
        placeholder: placeholder?.trim() || null,
        helpText: helpText?.trim() || null,
        required: !!required,
        showOnCard: !!showOnCard,
        position: (last?.position ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, field });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const body = await request.json();

    if (Array.isArray(body.order)) {
      /*
       * `updateMany`, e não `update`, por causa da lista velha.
       *
       * A tela reordena na hora e manda a lista inteira; entre o desenho dela e
       * o clique, outra pessoa pode ter apagado um campo — ou a própria pessoa,
       * na linha de cima. `update` não encontra a linha e derruba a transação
       * INTEIRA com um erro de banco cru na tela, desfazendo também a
       * reordenação dos campos que existem. `updateMany` casa zero linhas e
       * segue: a ordem dos que restaram é gravada, que é o que foi pedido.
       *
       * O `boardId` limita o alcance: sem ele, uma lista de ids de outro quadro
       * renumeraria os campos de lá.
       */
      const boardId = typeof body.boardId === "string" ? body.boardId : undefined;

      await prisma.$transaction(
        body.order.map((id: string, index: number) =>
          prisma.boardField.updateMany({
            where: { id, ...(boardId ? { boardId } : {}) },
            data: { position: index },
          })
        )
      );
      return NextResponse.json({ success: true });
    }

    const { id, key, label, type, options, placeholder, helpText, required, showOnCard, dependsOn,
      showWhenKey, showWhenValues, uploadWhenKey, uploadWhenValues } = body;
    if (!id) return NextResponse.json({ error: "ID do campo é obrigatório." }, { status: 400 });

    const current = await prisma.boardField.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

    const nextType = type !== undefined ? type : (current.type as FieldType);
    if (!isFieldType(nextType)) {
      return NextResponse.json({ error: "Tipo de campo desconhecido." }, { status: 400 });
    }

    /*
     * A chave NÃO é recalculada ao renomear o RÓTULO — mas pode ser trocada de
     * propósito.
     *
     * Ela é a única coisa que liga a pergunta às respostas já gravadas nos
     * cards. Recalculá-la a partir do novo rótulo faria "Prazo" virar
     * "data_de_entrega" e deixaria para trás, invisível, tudo que já foi
     * respondido — por isso o rótulo não a move.
     *
     * Trocá-la de propósito é outra coisa, e faltava: uma pergunta
     * REAPROVEITADA (renomeada e com a lista de opções trocada) fica com a
     * chave de uma pergunta que não é mais a dela, e o quadro não tinha como
     * desfazer. Ver `renomearChaveNasRespostas`, que é quem leva as respostas
     * junto — sem isso, trocar a chave seria apagar todas elas.
     */
    const pai = await validarPai(current.boardId, dependsOn, id);
    if (!pai.ok) return NextResponse.json({ error: pai.error }, { status: 400 });

    // `dependsOn` ausente no corpo não mexe no que está gravado.
    const proximoPai = dependsOn === undefined ? current.dependsOn : pai.key;

    const gatilho = await validarGatilho(
      current.boardId, showWhenKey, showWhenValues, id, current.key
    );
    if (!gatilho.ok) return NextResponse.json({ error: gatilho.error }, { status: 400 });

    // Mesma regra do pai: ausente no corpo, fica como está. A chave e as
    // respostas andam JUNTAS — guardar uma sem a outra é a regra pela metade,
    // que `camposVisiveis` lê como "sem regra".
    const proximoGatilho =
      showWhenKey === undefined
        ? { key: current.showWhenKey, values: current.showWhenValues }
        : { key: gatilho.key, values: gatilho.values };

    const envio = await validarGatilho(current.boardId, uploadWhenKey, uploadWhenValues, id);
    if (!envio.ok) return NextResponse.json({ error: envio.error }, { status: 400 });

    const proximoEnvio =
      uploadWhenKey === undefined
        ? { key: current.uploadWhenKey, values: current.uploadWhenValues }
        : { key: envio.key, values: envio.values };

    const serialized =
      options !== undefined
        ? normalizeOptions(nextType, options, proximoPai)
        : current.options;

    if (FIELD_TYPES_WITH_OPTIONS.includes(nextType) && !serialized) {
      return NextResponse.json(
        {
          error: proximoPai
            ? "Um campo dependente precisa de pelo menos uma opção em algum valor do campo pai."
            : "Um campo de escolha precisa de pelo menos uma opção.",
        },
        { status: 400 }
      );
    }

    /*
     * A chave pedida, já no formato de chave.
     *
     * Passa pelo mesmo `slugifyFieldKey` da criação em vez de ser aceita
     * literalmente: a chave viaja em JSON e em nome de campo de formulário, e
     * uma digitada com acento ou espaço voltaria a dar problema onde a gerada
     * nunca deu. Em branco — ou ausente — é "deixe como está".
     */
    const proximaChave =
      typeof key === "string" && key.trim() ? slugifyFieldKey(key) : current.key;

    if (CHAVES_DE_FABRICA.has(proximaChave)) {
      const daFabrica = CAMPOS_DE_FABRICA.find((c) => c.key === proximaChave);
      return NextResponse.json(
        {
          error: `A chave "${proximaChave}" é da pergunta de fábrica "${daFabrica?.label}" — ela existe em todo quadro e não se reaproveita.`,
        },
        { status: 400 }
      );
    }

    if (proximaChave !== current.key) {
      const ocupada = await prisma.boardField.findFirst({
        where: { boardId: current.boardId, key: proximaChave, NOT: { id } },
        select: { label: true },
      });
      if (ocupada) {
        return NextResponse.json(
          { error: `A chave "${proximaChave}" já é de "${ocupada.label}" neste quadro.` },
          { status: 400 }
        );
      }
    }

    const dados = {
        ...(label !== undefined ? { label: String(label).trim() } : {}),
        type: nextType,
        // Trocar para um tipo sem opções limpa a lista: deixá-la gravada faria
        // a lista antiga ressurgir se o tipo voltasse a ser de escolha.
        options: FIELD_TYPES_WITH_OPTIONS.includes(nextType) ? serialized : null,
        // Tipo sem opções não tem pai: a dependência só existe para filtrar
        // uma lista de escolhas que este campo deixou de ter.
        dependsOn: FIELD_TYPES_WITH_OPTIONS.includes(nextType) ? proximoPai : null,
        /* A regra de exibição sobrevive à troca de tipo, ao contrário das
           opções e do pai: ela não fala do que ESTE campo oferece, e sim de
           quando ele é perguntado — trocar "texto curto" por "data" não muda
           nada sobre isso. */
        showWhenKey: proximoGatilho.key,
        showWhenValues: proximoGatilho.key ? proximoGatilho.values : null,
        // A regra do envio morre com a troca para um tipo que não aceita envio
        // — é o mesmo critério das opções e do pai, logo acima.
        uploadWhenKey: FIELD_TYPES_WITH_UPLOAD.includes(nextType) ? proximoEnvio.key : null,
        uploadWhenValues:
          FIELD_TYPES_WITH_UPLOAD.includes(nextType) && proximoEnvio.key ? proximoEnvio.values : null,
        ...(placeholder !== undefined ? { placeholder: String(placeholder).trim() || null } : {}),
        ...(helpText !== undefined ? { helpText: String(helpText).trim() || null } : {}),
        ...(required !== undefined ? { required: !!required } : {}),
        ...(showOnCard !== undefined ? { showOnCard: !!showOnCard } : {}),
    };

    const field =
      proximaChave === current.key
        ? await prisma.boardField.update({ where: { id }, data: dados })
        : await trocarChave(current, proximaChave, dados);

    return NextResponse.json({ success: true, field });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID do campo é obrigatório." }, { status: 400 });

    /*
     * As respostas antigas ficam no JSON dos cards, órfãs e sem serem exibidas.
     *
     * Varrê-las custaria reescrever todos os cards do quadro para apagar
     * histórico — e se o campo foi removido por engano, recriá-lo com a mesma
     * chave traz tudo de volta.
     */
    /*
     * `deleteMany` porque apagar é IDEMPOTENTE: o que se pediu é que o campo
     * não exista mais, e ele não existir já é o resultado.
     *
     * Com `delete`, o segundo clique — na lista que ainda não recarregou, ou na
     * aba aberta em outra janela — devolvia um erro de banco cru, com nome de
     * arquivo compilado e número de linha, para dizer que deu certo duas vezes.
     */
    /*
     * A regra de exibição some junto com o campo que a alimentava.
     *
     * `camposVisiveis` já trata revelador inexistente como "mostre o campo" —
     * a queda segura, para que nada fique preso em invisível. Mas deixar a
     * regra gravada apontando para o nada faria a tela de configuração exibir
     * uma condição que não vale mais, e ela voltaria a valer sozinha no dia em
     * que alguém recriasse uma pergunta com a mesma chave. Limpar aqui é dizer
     * o que de fato aconteceu: a condição deixou de existir.
     *
     * Antes da remoção, e na mesma transação: apagado o campo, já não há como
     * descobrir qual era a chave dele.
     */
    const alvo = await prisma.boardField.findUnique({
      where: { id },
      select: { boardId: true, key: true },
    });

    const [{ count }] = await prisma.$transaction([
      prisma.boardField.deleteMany({ where: { id } }),
      ...(alvo
        ? [
            prisma.boardField.updateMany({
              where: { boardId: alvo.boardId, showWhenKey: alvo.key },
              data: { showWhenKey: null, showWhenValues: null },
            }),
            prisma.boardField.updateMany({
              where: { boardId: alvo.boardId, uploadWhenKey: alvo.key },
              data: { uploadWhenKey: null, uploadWhenValues: null },
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ success: true, removidos: count });
  } catch (error: unknown) {
    /*
     * A frase para quem lê, e o detalhe para o log.
     *
     * `error.message` de um erro do Prisma é um parágrafo com o nome do arquivo
     * compilado, o número da linha e o código da consulta — foi isso que a tela
     * exibiu quando uma remoção repetida falhou. Quem está mexendo no
     * formulário não tem o que fazer com esse texto; quem for investigar acha
     * tudo no terminal.
     */
    console.error("[Campos] Falha ao remover:", error);
    return NextResponse.json(
      { error: "Não foi possível remover o campo. Tente de novo em instantes." },
      { status: 500 }
    );
  }
}

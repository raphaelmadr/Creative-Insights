/**
 * As notificações de uma pessoa: o que aconteceu no quadro e diz respeito a ela.
 *
 * Não há tabela de notificações, e é de propósito. A notificação é uma LEITURA
 * do que já está gravado — guardar linhas exigiria escrever uma a cada evento,
 * em todo ponto do código que mexe num card, e um ponto esquecido viraria um
 * aviso que nunca chega.
 *
 * O que mudou foi a FONTE dessa leitura. Ela era o card ("estas são as demandas
 * que estão com você"), e o card não guarda quem mexeu nele. Daí os dois
 * defeitos que a equipe sentiu:
 *
 *   1. avisava a própria pessoa quando ela se atribuía — arrastar o card era a
 *      única forma de receber aviso, e o aviso era do que ela acabara de fazer;
 *   2. não avisava NINGUÉM quando uma demanda nova chegava para a fase, porque
 *      até alguém se atribuir não havia o que ler no card.
 *
 * A fonte passa a ser `CardActivity`, o histórico — que registra o autor. Com
 * ele, a regra fica a que a equipe descreve em voz alta: **avisa o que os
 * outros fizeram e me diz respeito**, nunca o que eu mesmo fiz.
 *
 * Três coisas dizem respeito a alguém:
 *
 *   - a demanda chegou à FASE dela (`BoardGroup.assignees` — a fase é o time,
 *     ver o modelo), seja aberta ali ou passada de outra fase. Todo mundo da
 *     fase recebe, sem depender de atribuição;
 *   - ela foi atribuída à demanda por outra pessoa;
 *   - alguém a MENCIONOU em um comentário, pelo nome (`@Ana Paula`). O resto do
 *     acompanhamento continua fora: comentário é história do card, mas ser
 *     citado é um pedido direto. Ver `lib/mentions.ts`.
 *
 * "Já vi" é um carimbo em `User.preferences`: um geral, de "limpei tudo", e um
 * por demanda, do "x" de cada aviso. Nenhum dos dois apaga nada — o que
 * acontecer DEPOIS do carimbo volta a avisar, porque aí é fato novo.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatCardCode, parseAssignees } from "@/lib/kanban";
import {
  mergePreferences,
  parsePreferences,
  serializePreferences,
} from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** Teto de itens na aba. Acima disso a lista deixa de ser lida e vira ruído. */
const LIMITE = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.email) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    const record = await prisma.user.findUnique({
      where: { email: user.email },
      select: { preferences: true },
    });

    const { notificationsReadAt, notificationsDismissed } = parsePreferences(record?.preferences);
    const limpoEm = notificationsReadAt ? new Date(notificationsReadAt) : null;
    const dispensadaEm = new Map(
      Object.entries(notificationsDismissed).map(([cardId, quando]) => [cardId, new Date(quando)])
    );

    const meu = user.email.trim().toLowerCase();

    /*
     * As fases de que esta pessoa faz parte.
     *
     * `BoardGroup.assignees` é a equipe da fase — é ele que responde "quem
     * precisa saber que chegou demanda aqui". Fase sem ninguém configurado não
     * avisa ninguém: não há a quem avisar, e inventar "todo mundo" encheria o
     * sino de quem não trabalha naquele fluxo. Quem quiser receber, entra na
     * equipe da fase na configuração do quadro.
     */
    const fases = await prisma.boardGroup.findMany({
      select: { id: true, name: true, assignees: true },
    });
    const minhasFases = new Map(
      fases
        .filter((f) => parseAssignees(f.assignees).some((e) => e.toLowerCase() === meu))
        .map((f) => [f.id, f.name])
    );

    /*
     * A porta de entrada de cada fase: a primeira etapa dela.
     *
     * É o que separa "a demanda CHEGOU nesta fase" de "andou dentro dela". Sem
     * essa distinção, cada passo interno (produção → revisão interna) viraria
     * um aviso para o time inteiro, e um sino que avisa demais é um sino que
     * ninguém abre.
     *
     * Derivada da posição, e não de um campo próprio: a primeira etapa da fase
     * é a porta por definição, e um `isIntake` marcado à mão poderia
     * contradizer a ordem que a equipe vê na tela.
     */
    const colunas = await prisma.boardColumn.findMany({
      orderBy: { position: "asc" },
      select: { id: true, groupId: true },
    });
    const colunaParaFase = new Map(colunas.map((c) => [c.id, c.groupId]));
    const portaDaFase = new Map<string, string>();
    for (const coluna of colunas) {
      if (coluna.groupId && !portaDaFase.has(coluna.groupId)) portaDaFase.set(coluna.groupId, coluna.id);
    }

    /*
     * O que aconteceu desde a última limpeza.
     *
     * Só os três tipos que podem virar aviso — comentário e edição de resposta
     * são história do card, não tarefa de ninguém. Arquivado fica de fora pelo
     * mesmo motivo de sempre: não há o que fazer com uma demanda que saiu do
     * quadro.
     */
    const atividades = await prisma.cardActivity.findMany({
      where: {
        OR: [
          { type: { in: ["CREATED", "MOVED", "ASSIGNED"] } },
          /*
           * O comentário entra só quando cita ESTA pessoa.
           *
           * Comentário continua não sendo tarefa de ninguém — é história do
           * card, e por isso não avisa o quadro inteiro. Ser citado é outra
           * coisa: é alguém pedindo você, pelo nome, naquela demanda.
           *
           * O `contains` compara com as aspas em volta de propósito: sem elas,
           * `ana@x.com` casaria dentro de `joana@x.com`. Ainda assim a lista é
           * conferida item a item mais abaixo — LIKE é filtro, não prova.
           */
          { type: "COMMENT", mentions: { contains: `"${meu}"` } },
        ],
        ...(limpoEm ? { createdAt: { gt: limpoEm } } : {}),
        card: { archived: false },
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE * 10,
      select: {
        id: true,
        type: true,
        authorEmail: true,
        authorName: true,
        mentions: true,
        createdAt: true,
        card: {
          select: {
            id: true,
            code: true,
            title: true,
            boardId: true,
            columnId: true,
            assignees: true,
          },
        },
      },
    });

    /*
     * As demandas que já saíram do lugar onde nasceram.
     *
     * O histórico registra QUE o card foi criado, não ONDE — e a fase só pode
     * ser lida da coluna atual. Numa demanda que já andou, essa leitura mente:
     * a de Criação que foi passada para Growth apareceria como "nova demanda
     * para Growth", que não é o que aconteceu — ela chegou de handoff.
     *
     * Então o "nasceu aqui" só vale para quem não se moveu; a partir do
     * primeiro movimento, quem manda é a regra da porta da fase, que sabe
     * exatamente onde o card parou. Uma demanda criada depois da última
     * limpeza tem todos os movimentos dela nesta mesma janela — eles são
     * necessariamente posteriores —, então a conta fecha.
     */
    const jaSeMoveu = new Set(
      atividades.filter((a) => a.type === "MOVED" && a.card).map((a) => a.card!.id)
    );

    /** "MKT-42" quando a demanda tem número; as antigas não têm. Ver `formatCardCode`. */
    const frase = (code: string | null, comNumero: string, semNumero: string) =>
      code ? comNumero : semNumero;

    const notifications: {
      id: string;
      cardId: string;
      boardId: string;
      code: string | null;
      title: string;
      message: string;
      at: string;
    }[] = [];

    /* Um aviso por demanda, o mais recente. A lista é de tarefas, não de
       eventos: a mesma demanda aparecendo três vezes empurra as outras para
       fora do teto sem dizer nada de novo. */
    const jaAvisados = new Set<string>();

    for (const atividade of atividades) {
      if (notifications.length >= LIMITE) break;

      /*
       * O que eu mesmo fiz não me avisa.
       *
       * É a regra que faltava, e a que mais incomodava: arrastar o próprio card
       * devolvia um aviso do que se acabara de fazer. Autor em branco — a
       * demanda aberta por uma automação — avisa todo mundo, que é o certo:
       * ninguém a fez.
       */
      if (atividade.authorEmail && atividade.authorEmail.trim().toLowerCase() === meu) continue;

      const card = atividade.card;
      if (!card || jaAvisados.has(card.id)) continue;

      /* Dispensada no "x": esconde o que já era, não o que vier depois. */
      const dispensada = dispensadaEm.get(card.id);
      if (dispensada && atividade.createdAt <= dispensada) continue;

      const code = formatCardCode(card.code);
      const fase = colunaParaFase.get(card.columnId) ?? null;
      const nomeDaFase = fase ? minhasFases.get(fase) : undefined;
      const souResponsavel = parseAssignees(card.assignees).some((e) => e.toLowerCase() === meu);

      let message: string | null = null;

      if (atividade.type === "COMMENT") {
        /* A prova, depois do filtro: o LIKE encontrou o texto, aqui se confere
           a lista de verdade. JSON quebrado não avisa ninguém. */
        let citados: unknown = null;
        try {
          citados = JSON.parse(atividade.mentions || "[]");
        } catch {
          citados = null;
        }
        const souCitado =
          Array.isArray(citados) &&
          citados.some((e) => typeof e === "string" && e.trim().toLowerCase() === meu);

        if (souCitado) {
          const autor = atividade.authorName?.trim() || "Alguém";
          message = frase(
            code,
            `${autor} mencionou você em ${code}`,
            `${autor} mencionou você em uma demanda`
          );
        }
      } else if (atividade.type === "ASSIGNED") {
        if (souResponsavel) {
          message = frase(
            code,
            `Você foi atribuído à tarefa ${code}`,
            "Você foi atribuído a uma tarefa"
          );
        }
      } else if (atividade.type === "CREATED") {
        /* Aberta na minha fase — ou direto no meu nome, que acontece quando a
           fase de destino tem responsável padrão. */
        if (nomeDaFase && !jaSeMoveu.has(card.id)) {
          message = frase(
            code,
            `Nova demanda ${code} para ${nomeDaFase}`,
            `Nova demanda para ${nomeDaFase}`
          );
        } else if (souResponsavel) {
          message = frase(code, `Nova demanda ${code} para você`, "Nova demanda para você");
        }
      } else if (nomeDaFase && portaDaFase.get(fase!) === card.columnId) {
        /* MOVED, e parou na porta da fase: a demanda passou de um time para o
           meu. Movimento dentro da própria fase não avisa — ver `portaDaFase`. */
        message = frase(
          code,
          `${code} chegou em ${nomeDaFase}`,
          `Uma demanda chegou em ${nomeDaFase}`
        );
      }

      if (!message) continue;

      jaAvisados.add(card.id);
      notifications.push({
        id: atividade.id,
        cardId: card.id,
        boardId: card.boardId,
        code,
        title: card.title,
        message,
        at: atividade.createdAt.toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      notifications,
      clearedAt: notificationsReadAt,
    });
  } catch (error: any) {
    console.error("[Notificações] Falha ao listar:", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível carregar as notificações." },
      { status: 500 }
    );
  }
}

/**
 * Limpar — tudo, ou uma demanda só.
 *
 * Sem corpo, é "limpar todas": carimba o instante e zera os carimbos
 * individuais, que a partir dali não dizem mais nada. Com `{ cardId }`, é o "x"
 * de um aviso: carimba AQUELA demanda, e só ela.
 *
 * Nenhum dos dois apaga coisa alguma — a demanda continua onde estava, o que
 * some é o aviso. O que acontecer nela depois do carimbo volta a aparecer, e é
 * justamente o que a aba existe para dizer.
 *
 * O instante é o do servidor, e não um enviado pelo navegador: um relógio
 * adiantado na máquina de quem clica esconderia avisos que ainda nem
 * aconteceram.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.email) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  try {
    /* Corpo vazio é o caso mais comum — "limpar todas" não manda nada. */
    const corpo = await request.json().catch(() => ({}));
    const cardId = typeof corpo?.cardId === "string" && corpo.cardId.length <= 64 ? corpo.cardId : null;

    const record = await prisma.user.findUnique({
      where: { email: user.email },
      select: { preferences: true },
    });

    const agora = new Date().toISOString();
    const atuais = parsePreferences(record?.preferences);
    const atualizado = mergePreferences(
      atuais,
      cardId
        ? { notificationsDismissed: { ...atuais.notificationsDismissed, [cardId]: agora } }
        : { notificationsReadAt: agora, notificationsDismissed: {} }
    );

    await prisma.user.update({
      where: { email: user.email },
      data: { preferences: serializePreferences(atualizado) },
    });

    return NextResponse.json({ success: true, clearedAt: agora, cardId });
  } catch (error: any) {
    console.error("[Notificações] Falha ao limpar:", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível limpar as notificações." },
      { status: 500 }
    );
  }
}

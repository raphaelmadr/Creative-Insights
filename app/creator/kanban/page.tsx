"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, SlidersHorizontal, LayoutGrid, Layers, Archive, Link2, Search } from "lucide-react";
import KanbanBoard from "@/components/creator/KanbanBoard";
import DemandDialog, { type PersonOption } from "@/components/creator/DemandDialog";
import { type ColumnDefinition } from "@/components/creator/ColumnsSection";
import BoardSetupDialog from "@/components/creator/BoardSetupDialog";
import PublicLinkDialog from "@/components/creator/PublicLinkDialog";
import GroupsDialog from "@/components/creator/GroupsDialog";
import ArchiveDialog from "@/components/creator/ArchiveDialog";
import CardSearchDialog from "@/components/creator/CardSearchDialog";
import CardDialog, { type CardData } from "@/components/creator/CardDialog";
import { type FieldDefinition } from "@/components/creator/FieldInput";
import { Skeleton } from "@/components/Skeleton";
import {
  parseCardBadges,
  parseCardPanel,
  parseFormBuiltins,
  type GroupDefinition,
  type ColumnPlacement,
} from "@/lib/kanban";

interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  receivesCopy: boolean;
}

interface BoardDetail extends BoardSummary {
  columns: ColumnDefinition[];
  fields: FieldDefinition[];
  groups: GroupDefinition[];
  /** JSON dos mini-badges — cru, como está no banco. Ver `parseCardBadges`. */
  cardBadges: string | null;
  /** JSON das seções do card aberto. Ver `parseCardPanel`. */
  cardPanel: string | null;
  /** JSON das perguntas fixas do formulário. Ver `parseFormBuiltins`. */
  formBuiltins: string | null;
  /** O código do link público, ou nulo quando o quadro não tem um. */
  publicToken: string | null;
}

/**
 * O Kanban das demandas criativas.
 *
 * Carrega o quadro inteiro numa chamada só e mantém tudo em estado local: a
 * tela é uma só, e dividir o carregamento faria as colunas aparecerem antes dos
 * cards, com o quadro montado pela metade por um instante a cada visita.
 */
export default function KanbanPage() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newDemand, setNewDemand] = useState(false);
  /** Formulário, card e etapas: uma pergunta só, uma janela só. */
  const [editBoard, setEditBoard] = useState(false);
  const [editLink, setEditLink] = useState(false);
  const [editGroups, setEditGroups] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  /** O movimento que parou à espera de um dono. */
  const [openCard, setOpenCard] = useState<CardData | null>(null);

  /**
   * O link direto de um card (`?board=...&card=...`, montado pelo aviso do
   * Slack — ver `lib/slack-delivery.ts`) só se aplica uma vez. Sem a marca,
   * fechar o card reaberto por link e voltar a arrastar cards reabriria o
   * mesmo painel a cada nova leitura de `cards`.
   */
  const linkDireto = useRef(false);

  /**
   * A impressão digital do quadro na última leitura — a base de comparação da
   * conferência periódica. Vive numa ref, e não no estado, porque mudá-la não
   * deve redesenhar nada: ela existe para decidir se vale a pena redesenhar.
   */
  const pulso = useRef<string | null>(null);

  /**
   * Um arrasto em curso, ou uma gravação a caminho do servidor.
   *
   * Nos dois casos a tela já mostra o resultado antes da resposta, então ela
   * está de propósito à frente do banco. Recarregar nesse intervalo devolveria
   * o card ao lugar de origem no meio do movimento — o mesmo tranco que a
   * atualização otimista existe para evitar.
   */
  const ocupado = useRef(0);
  const arrastando = useRef(false);

  const load = useCallback(
    async (boardId?: string | null, opcoes?: { silencioso?: boolean }) => {
      try {
        const query = boardId ? `?boardId=${boardId}` : "";
        const res = await fetch(`/api/creator/boards${query}`);
        const data = await res.json();

        if (!res.ok) {
          /*
           * Numa conferência de fundo, o erro fica calado. A pessoa não pediu
           * nada: trocar o quadro que está na tela por uma mensagem de falha
           * porque uma requisição automática tropeçou apagaria o trabalho de
           * vista sem que ninguém tivesse tocado em coisa alguma.
           */
          if (!opcoes?.silencioso) setError(data.error || "Não foi possível carregar o quadro.");
          return;
        }

        setBoards(data.boards || []);
        setBoard(data.board || null);
        setCards(data.cards || []);
        setArchivedCount(data.archivedCount || 0);
        setActiveId(data.board?.id ?? null);
        pulso.current = typeof data.pulse === "string" ? data.pulse : null;
        setError(null);
      } catch {
        if (!opcoes?.silencioso) setError("Falha de conexão ao carregar o quadro.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // O board do link direto (`?board=...&card=...`) precisa ser o carregado
    // de início — o card do aviso do Slack pode não estar no último quadro
    // que esta pessoa deixou aberto.
    const paramsDeAbertura = new URLSearchParams(window.location.search);
    load(paramsDeAbertura.get("board") || undefined);

    /*
     * São TODOS os usuários cadastrados, não só os criadores.
     *
     * Quem toca uma demanda pode ser de mídia paga, de conteúdo ou de revisão —
     * gente que não desenha peça e que, por isso, não tem ficha de `Creator`.
     * Enquanto esta lista vinha do cadastro de criadores, essas pessoas não
     * existiam para o quadro: não apareciam na equipe de uma etapa nem podiam
     * assumir um card. `Creator` segue sendo quem ASSINA criativos, que é outro
     * assunto — ver `/api/creator/people`.
     */
    fetch("/api/creator/people")
      .then((res) => res.json())
      .then((res) => setPeople(res.data || []))
      .catch(() => setPeople([]));
  }, [load]);

  // O card aberto precisa acompanhar a recarga: sem isto, mudar a etapa pelo
  // painel deixaria o painel mostrando a etapa antiga até alguém fechá-lo.
  useEffect(() => {
    if (!openCard) return;
    const fresh = cards.find((c) => c.id === openCard.id);
    if (fresh && fresh !== openCard) setOpenCard(fresh);
  }, [cards, openCard]);

  /**
   * Abre sozinho o card do link direto, assim que o quadro certo terminar de
   * carregar. Só tenta uma vez: sem achar (card arquivado, ou já entregue e
   * fora da lista carregada), desiste em silêncio — a pessoa ainda está no
   * quadro, só sem o painel aberto.
   */
  useEffect(() => {
    if (linkDireto.current || loading) return;

    const params = new URLSearchParams(window.location.search);
    const cardId = params.get("card");
    if (!cardId) {
      linkDireto.current = true;
      return;
    }

    const alvo = cards.find((c) => c.id === cardId);
    if (alvo) setOpenCard(alvo);
    linkDireto.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("card");
    url.searchParams.delete("board");
    window.history.replaceState({}, "", url.toString());
  }, [cards, loading]);

  /**
   * Os grupos que têm para onde receber uma demanda.
   *
   * Um grupo sem etapa nenhuma não é destino: escolhê-lo manda o card para a
   * entrada do quadro, que é de outro time — a pessoa pede Parcerias e a
   * demanda cai no Backlog da Criação, com a equipe da Criação junto, sem nada
   * na tela dizendo que foi isso que aconteceu. Melhor não oferecer o que não
   * pode ser cumprido. Nas telas de configuração, todos continuam aparecendo:
   * é justamente lá que um grupo vazio ganha a primeira etapa.
   */
  /*
   * A configuração do quadro, lida uma vez por carga.
   *
   * Chamar os `parse*` dentro do JSX devolvia um array novo a cada
   * renderização, e quem os recebe usa alguns deles em dependências de efeito e
   * de memo. Aqui em cima, a identidade só muda quando o quadro muda — que é
   * exatamente quando ela deveria mudar.
   */
  const badges = useMemo(() => parseCardBadges(board?.cardBadges), [board?.cardBadges]);
  const painel = useMemo(() => parseCardPanel(board?.cardPanel), [board?.cardPanel]);
  const perguntasFixas = useMemo(
    () => parseFormBuiltins(board?.formBuiltins),
    [board?.formBuiltins]
  );

  const gruposQueRecebem = board
    ? board.groups.filter((g) => board.columns.some((c) => c.groupId === g.id))
    : [];

  /** Um diálogo aberto é alguém escrevendo — a tela não se mexe por baixo. */
  const dialogoAberto =
    !!openCard ||
    newDemand ||
    editBoard ||
    editLink ||
    editGroups ||
    showArchive;

  /*
   * O arrasto é o do navegador e os eventos sobem até a janela, então dá para
   * saber que há um em curso sem que o quadro precise avisar. Vale para card e
   * para etapa, que é justamente o que não pode ser recarregado no meio.
   */
  useEffect(() => {
    const comecou = () => { arrastando.current = true; };
    const acabou = () => { arrastando.current = false; };

    window.addEventListener("dragstart", comecou);
    window.addEventListener("dragend", acabou);
    window.addEventListener("drop", acabou);

    return () => {
      window.removeEventListener("dragstart", comecou);
      window.removeEventListener("dragend", acabou);
      window.removeEventListener("drop", acabou);
    };
  }, []);

  /**
   * O quadro acompanha o que os outros fazem, sem recarregar a página.
   *
   * O Kanban é uma esteira: o card sai da mão de um e cai na de outro. Até
   * aqui, quem estava com a tela aberta continuava vendo o card na etapa antiga
   * até apertar F5 — e quem recebia o trabalho não sabia que ele havia chegado.
   *
   * A conferência pergunta só "mudou?", e é a resposta que decide se o quadro
   * vem de novo. Perguntar custa uma linha de texto; trazer o quadro inteiro a
   * cada dez segundos, com dez pessoas de tela aberta, não caberia no único
   * núcleo da hospedagem.
   */
  useEffect(() => {
    if (!activeId) return;

    let vivo = true;

    const conferir = async () => {
      if (!vivo || document.hidden) return;
      if (dialogoAberto || arrastando.current || ocupado.current > 0) return;

      try {
        const res = await fetch(`/api/creator/boards/pulse?boardId=${activeId}`);
        if (!res.ok) return;

        const { pulse } = await res.json();
        if (!vivo || typeof pulse !== "string") return;

        // Sem base de comparação ainda: registra e espera a próxima volta.
        if (pulso.current === null) {
          pulso.current = pulse;
          return;
        }

        if (pulse !== pulso.current) {
          pulso.current = pulse;
          await load(activeId, { silencioso: true });
        }
      } catch {
        // Rede instável não é assunto da tela: a próxima volta tenta de novo.
      }
    };

    /*
     * Confere já, e não só daqui a dez segundos: este efeito reinicia sempre
     * que um diálogo abre ou fecha, e sem esta chamada quem trabalha abrindo e
     * fechando cards em sequência reiniciaria o relógio antes de ele completar
     * uma volta — ficaria sem notícia do quadro justamente enquanto trabalha.
     */
    conferir();
    const relogio = setInterval(conferir, 10_000);

    /*
     * Voltar para a aba confere na hora. É o momento em que o atraso mais
     * aparece — quem volta de outra janela quer ver o quadro de agora, não o de
     * dez segundos atrás —, e é também o que permite parar de perguntar
     * enquanto a aba está escondida: uma aba esquecida aberta a noite toda não
     * fica batendo no servidor.
     */
    const aoTrocarDeAba = () => { if (!document.hidden) conferir(); };
    document.addEventListener("visibilitychange", aoTrocarDeAba);

    return () => {
      vivo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoTrocarDeAba);
    };
  }, [activeId, dialogoAberto, load]);

  const move = async (cardId: string, columnId: string, order: string[]) => {
    /*
     * A tela muda antes da resposta do servidor. Um arrasto que espera a ida e
     * volta da rede devolve o card ao lugar de origem por um instante — parece
     * que o movimento não pegou, e a pessoa arrasta de novo.
     */
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId } : c))
    );

    /*
     * Enquanto a gravação está a caminho, a conferência periódica fica parada:
     * ela leria no banco a etapa antiga e desfaria na tela o movimento que
     * acabou de ser feito.
     */
    ocupado.current++;
    const res = await fetch("/api/creator/cards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: { cardId, columnId, order } }),
    }).finally(() => { ocupado.current--; });

    if (res.ok) {
      /*
       * Quem ficou com a demanda é decisão do servidor — a etapa pode ter
       * equipe, padrão, e quem moveu pode assumir sozinho. A tela adota o que
       * voltou em vez de recarregar o quadro inteiro: um refetch a cada arrasto
       * pisca a tela toda para atualizar um crachá.
       */
      const { assignees: donosFinais } = await res
        .json()
        .catch(() => ({ assignees: undefined }));

      if (Array.isArray(donosFinais)) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId ? { ...c, assignees: JSON.stringify(donosFinais) } : c
          )
        );
      }
      return true;
    }

    /*
     * Falhou: a verdade do banco volta à tela, desfazendo o movimento otimista.
     *
     * Não há mais o caso "a etapa exige dono e não há um": a fase atribui
     * sozinha, sempre. O que sobra aqui é falha de rede ou erro inesperado.
     */
    load(activeId);
    return false;
  };

  /**
   * A nova ordem das etapas, depois de arrastar uma para outro ponto.
   *
   * A lista inteira vai numa transação — posição é ordem relativa, e gravar
   * etapa por etapa deixaria duas na mesma posição no intervalo entre as
   * chamadas, que é justamente quando outra pessoa carrega o quadro.
   */
  const reordenarEtapas = async (ordem: ColumnPlacement[]) => {
    if (!board) return;

    /*
     * A tela muda antes da resposta, como no arrasto de card: esperar a ida e
     * volta devolve a etapa ao lugar de origem por um instante, e parece que o
     * movimento não pegou.
     */
    const porId = new Map(board.columns.map((c) => [c.id, c]));
    setBoard({
      ...board,
      columns: ordem.flatMap((p, index) => {
        const coluna = porId.get(p.id);
        return coluna ? [{ ...coluna, position: index, groupId: p.groupId }] : [];
      }),
    });

    ocupado.current++;
    const res = await fetch("/api/creator/columns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ordem }),
    }).finally(() => { ocupado.current--; });

    // Falhou: a verdade do banco volta à tela, desfazendo o otimismo.
    if (!res.ok) load(activeId);
  };

  return (
    <div className="dashboard-container board-shell">
      <section style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem", minWidth: 0, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <h1
              style={{ fontSize: "var(--text-page)", fontWeight: 800, margin: 0, wordBreak: "break-word" }}
              className="lowercase-title"
            >
              board criativo<span className="dot-green">.</span>
            </h1>
            <p style={{ color: "var(--muted)", maxWidth: "600px", lineHeight: 1.6, margin: 0 }} className="lowercase-title">
              {board?.description || "demandas da equipe criativa, do briefing à entrega."}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            {/*
              As duas portas de entrada ficam juntas, e nesta ordem.

              Abrir demanda e dar a alguém o endereço para abrir uma são a mesma
              pergunta — "como isto entra no quadro?" —, e o link estava na barra
              de configuração, entre Campos e Grupos, que é onde se ajusta o
              quadro, não onde se usa. O secundário ao lado do primário diz qual
              é o caminho de todo dia e qual é o de quando se precisa dele.
            */}
            {/* Todos os botões da barra na mesma medida: o que distingue a
                ação principal é a cor, não a altura. Ver `.btn-compact`. */}
            <button
              className="btn btn-primary btn-compact"
              onClick={() => setNewDemand(true)}
              disabled={!board}
            >
              <Plus size={15} />
              Nova demanda
            </button>

            <button
              className="btn btn-secondary btn-compact"
              onClick={() => setEditLink(true)}
              disabled={!board}
              title="Endereço para qualquer pessoa da empresa abrir demanda sem ter conta"
            >
              <Link2 size={14} />
              Link público
            </button>

            {boards.length > 1 && (
              <select
                className="field-input"
                value={activeId ?? ""}
                aria-label="Quadro"
                onChange={(e) => {
                  setLoading(true);
                  load(e.target.value);
                }}
                /* A mesma altura dos botões ao lado: um seletor mais alto que
                   a fileira reabriria o desencontro que `.btn-compact` fechou. */
                style={{ maxWidth: "240px", minHeight: "2.15rem" }}
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <span style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {/*
                A primeira das ações, antes das que ajustam o quadro.

                Procurar é o que se faz TODO dia, e com o quadro do jeito que
                está; Preferências e Grupos são o que se faz de vez em quando,
                para mudá-lo. O Arquivo fecha a fileira: é para folhear o que
                saiu, e este é para quem já sabe o que quer e não sabe onde
                está. Varre quadro e arquivo de uma vez — ver
                `CardSearchDialog`.
              */}
              <button
                className="btn btn-secondary btn-compact"
                onClick={() => setShowSearch(true)}
                disabled={!board}
                title="Procurar uma demanda pelo título, número, briefing ou responsável — no quadro e no arquivo"
              >
                <Search size={14} />
                Procurar
              </button>
              {/*
                Um botão, e não dois.
                
                "Campos" e "Etapas e cards" eram portas separadas para decisões
                encadeadas: o que se pergunta define o que o card pode mostrar.
                Separadas, quem enxugava o card não achava a pergunta que o
                enchia — ela estava atrás do outro botão, com outro nome.
              */}
              <button
                className="btn btn-secondary btn-compact"
                onClick={() => setEditBoard(true)}
                disabled={!board}
                title="O formulário, o que o card mostra e as etapas do fluxo"
              >
                <SlidersHorizontal size={14} />
                Preferências
              </button>
              <button
                className="btn btn-secondary btn-compact"
                onClick={() => setEditGroups(true)}
                disabled={!board}
                title="Agrupar as etapas em grupos — Criação, Growth, Mídia"
              >
                <Layers size={14} />
                Grupos
              </button>
              {/*
                O arquivo é um botão, e não uma coluna.
                
                Como coluna ele consumia uma faixa inteira da largura para
                mostrar um número e uma porta — espaço que o quadro precisa para
                as etapas de verdade, e que fica mais escasso a cada etapa nova.
                Aqui ele continua à mão, sem disputar a esteira.
              */}
              <button
                className="btn btn-secondary btn-compact"
                onClick={() => setShowArchive(true)}
                disabled={!board}
                title={`${archivedCount} demanda(s) fora do quadro`}
              >
                <Archive size={14} />
                Arquivo
                {archivedCount > 0 && (
                  <span
                    style={{
                      fontSize: "var(--text-eyebrow)",
                      fontWeight: 700,
                      padding: "0.05rem 0.35rem",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--surface-sunken)",
                      color: "var(--muted)",
                    }}
                  >
                    {archivedCount}
                  </span>
                )}
              </button>
            </span>
          </div>
        </div>

        {error && (
          <div
            className="glass-panel"
            role="alert"
            style={{ padding: "var(--pad-card)", color: "var(--danger)", fontSize: "var(--text-control)" }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", gap: "var(--gap-grid)" }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                height="220px"
                borderRadius="var(--radius-card)"
                /* `--surface-sunken` e não o branco com alfa do componente: no
                   tema claro aquele fundo some sobre a página. */
                style={{ flex: "0 0 300px", background: "var(--surface-sunken)" }}
              />
            ))}
          </div>
        ) : board ? (
          <KanbanBoard
            columns={board.columns}
            cards={cards}
            fields={board.fields}
            people={people}
            groups={board.groups}
            badges={badges}
            builtins={perguntasFixas}
            onOpenCard={setOpenCard}
            onMove={move}
            onReorderColumns={reordenarEtapas}
          />
        ) : (
          <div
            className="glass-panel"
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "var(--text-control)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <LayoutGrid size={28} />
            Nenhum quadro ainda.
          </div>
        )}
      </section>

      {board && (
        <>
          <DemandDialog
            open={newDemand}
            onClose={() => setNewDemand(false)}
            boardId={board.id}
            boardName={board.name}
            groups={gruposQueRecebem}
            fields={board.fields}
            builtins={perguntasFixas}
            onCreated={() => load(activeId)}
          />

          <BoardSetupDialog
            open={editBoard}
            onClose={() => setEditBoard(false)}
            boardId={board.id}
            columns={board.columns}
            groups={board.groups}
            badges={badges}
            panel={painel}
            builtins={perguntasFixas}
            fields={board.fields}
            people={people}
            onChanged={() => load(activeId)}
          />

          <PublicLinkDialog
            open={editLink}
            onClose={() => setEditLink(false)}
            boardId={board.id}
            token={board.publicToken}
            onChanged={() => load(activeId)}
          />

          <GroupsDialog
            open={editGroups}
            onClose={() => setEditGroups(false)}
            boardId={board.id}
            groups={board.groups}
            people={people}
            onChanged={() => load(activeId)}
          />

          {/*
            Abrir um card do arquivo fecha a lista: dois diálogos empilhados
            dividiriam o Esc — uma tecla fecharia os dois de uma vez — e o de
            baixo continuaria travando a rolagem do de cima.
          */}
          {/* Montado só quando abre, e não com um `open` como os vizinhos:
              é o que faz cada busca começar com o campo em branco — ver o
              cabeçalho de `CardSearchDialog`.

              Mesma regra do Arquivo: abrir um resultado fecha a busca, para
              não empilhar dois diálogos disputando o Esc. */}
          {showSearch && (
            <CardSearchDialog
              onClose={() => setShowSearch(false)}
              boardId={board.id}
              onOpenCard={(card) => {
                setShowSearch(false);
                setOpenCard(card);
              }}
            />
          )}

          <ArchiveDialog
            open={showArchive}
            onClose={() => setShowArchive(false)}
            boardId={board.id}
            onOpenCard={(card) => {
              setShowArchive(false);
              setOpenCard(card);
            }}
            onChanged={() => load(activeId)}
          />


          <CardDialog
            card={openCard}
            fields={board.fields}
            columns={board.columns}
            groups={board.groups}
            people={people}
            panel={painel}
            builtins={perguntasFixas}
            onClose={() => setOpenCard(null)}
            onChanged={() => load(activeId)}
          />
        </>
      )}
    </div>
  );
}

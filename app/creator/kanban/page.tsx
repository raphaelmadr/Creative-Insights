"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, SlidersHorizontal, Columns3, LayoutGrid, Tags, Layers } from "lucide-react";
import KanbanBoard from "@/components/creator/KanbanBoard";
import DemandDialog, { type CreatorOption } from "@/components/creator/DemandDialog";
import FieldsDialog from "@/components/creator/FieldsDialog";
import ColumnsDialog, { type ColumnDefinition } from "@/components/creator/ColumnsDialog";
import BadgesDialog from "@/components/creator/BadgesDialog";
import GroupsDialog from "@/components/creator/GroupsDialog";
import ArchiveDialog from "@/components/creator/ArchiveDialog";
import AssigneeDialog from "@/components/creator/AssigneeDialog";
import CardDialog, { type CardData } from "@/components/creator/CardDialog";
import { type FieldDefinition } from "@/components/creator/FieldInput";
import { Skeleton } from "@/components/Skeleton";
import { parseCardBadges, stageCandidates, type GroupDefinition } from "@/lib/kanban";
import { primaryAcronym, UNATTRIBUTED_ACRONYM } from "@/lib/acronyms";

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
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newDemand, setNewDemand] = useState(false);
  const [editFields, setEditFields] = useState(false);
  const [editColumns, setEditColumns] = useState(false);
  const [editBadges, setEditBadges] = useState(false);
  const [editGroups, setEditGroups] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  /** O movimento que parou à espera de um dono. */
  const [pendingMove, setPendingMove] = useState<{
    cardId: string;
    columnId: string;
    order: string[];
    columnName: string;
    cardTitle: string;
  } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [openCard, setOpenCard] = useState<CardData | null>(null);

  const load = useCallback(
    async (boardId?: string | null) => {
      try {
        const query = boardId ? `?boardId=${boardId}` : "";
        const res = await fetch(`/api/creator/boards${query}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Não foi possível carregar o quadro.");
          return;
        }

        setBoards(data.boards || []);
        setBoard(data.board || null);
        setCards(data.cards || []);
        setArchivedCount(data.archivedCount || 0);
        setActiveId(data.board?.id ?? null);
        setError(null);
      } catch {
        setError("Falha de conexão ao carregar o quadro.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();

    /*
     * Os criadores vêm da mesma lista que o painel de performance usa: o
     * responsável por uma demanda é a mesma pessoa que assina os anúncios, e
     * uma segunda lista de nomes divergiria da primeira em uma semana.
     */
    fetch("/api/creators")
      .then((res) => res.json())
      .then((res) =>
        /*
         * A sigla é normalizada aqui, na entrada, e não em cada tela que a usa.
         *
         * O cadastro guarda uma lista de apelidos ("RM, RAPHAELMADUREIRA"), e é
         * ela que casa com o nome dos anúncios. Para gravar um responsável
         * precisa haver um valor só — a canônica —, senão o `<select>` grava a
         * lista inteira, recebe de volta o texto normalizado pela rota e não
         * encontra mais a própria opção: a escolha parece não pegar.
         *
         * O balde "sem atribuição" sai da lista: ele não é uma pessoa, e quem
         * não tem dono já tem a opção "A definir".
         */
        setCreators(
          (res.data || [])
            .map((c: CreatorOption) => ({ ...c, acronym: primaryAcronym(c.acronym) }))
            .filter((c: CreatorOption) => c.acronym && c.acronym !== UNATTRIBUTED_ACRONYM)
        )
      )
      .catch(() => setCreators([]));
  }, [load]);

  // O card aberto precisa acompanhar a recarga: sem isto, mudar a etapa pelo
  // painel deixaria o painel mostrando a etapa antiga até alguém fechá-lo.
  useEffect(() => {
    if (!openCard) return;
    const fresh = cards.find((c) => c.id === openCard.id);
    if (fresh && fresh !== openCard) setOpenCard(fresh);
  }, [cards, openCard]);

  const move = async (
    cardId: string,
    columnId: string,
    order: string[],
    assigneeAcronym?: string
  ) => {
    /*
     * A tela muda antes da resposta do servidor. Um arrasto que espera a ida e
     * volta da rede devolve o card ao lugar de origem por um instante — parece
     * que o movimento não pegou, e a pessoa arrasta de novo.
     */
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId } : c))
    );

    const res = await fetch("/api/creator/cards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move: { cardId, columnId, order, assigneeAcronym } }),
    });

    if (res.ok) return true;

    /*
     * A etapa exige dono e o card não tem: a regra vive no servidor, e a tela
     * reage à recusa perguntando quem assume — em vez de duplicar a condição
     * aqui, onde ela envelheceria em silêncio no dia em que a etapa mudasse.
     */
    const data = await res.json().catch(() => ({}));
    if (data?.needsAssignee) {
      const coluna = board?.columns.find((c) => c.id === columnId);
      const card = cards.find((c) => c.id === cardId);
      setPendingMove({
        cardId,
        columnId,
        order,
        columnName: coluna?.name ?? "Esta etapa",
        cardTitle: card?.title ?? "",
      });
    }

    // Recarrega: a verdade do banco volta à tela, e o card retorna à etapa de
    // origem até a pergunta ser respondida.
    load(activeId);
    return false;
  };

  const headerButton = { padding: "0.45rem 0.85rem", fontSize: "var(--text-caption)" } as const;

  return (
    <div className="dashboard-container">
      <section style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem", minWidth: 0 }}>
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
            <button className="btn btn-primary" onClick={() => setNewDemand(true)} disabled={!board}>
              <Plus size={15} />
              Nova demanda
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
                style={{ maxWidth: "240px" }}
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <span style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="btn btn-secondary"
                style={headerButton}
                onClick={() => setEditFields(true)}
                disabled={!board}
                title="Definir o que o formulário desta equipe pergunta"
              >
                <SlidersHorizontal size={14} />
                Campos
              </button>
              <button
                className="btn btn-secondary"
                style={headerButton}
                onClick={() => setEditColumns(true)}
                disabled={!board}
                title="Renomear, colorir e reordenar as etapas"
              >
                <Columns3 size={14} />
                Etapas
              </button>
              <button
                className="btn btn-secondary"
                style={headerButton}
                onClick={() => setEditBadges(true)}
                disabled={!board}
                title="Escolher o que o card mostra sem ser aberto"
              >
                <Tags size={14} />
                Card
              </button>
              <button
                className="btn btn-secondary"
                style={headerButton}
                onClick={() => setEditGroups(true)}
                disabled={!board}
                title="Agrupar as etapas em fases — Briefing, Produção, Entrega"
              >
                <Layers size={14} />
                Fases
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
            creators={creators}
            groups={board.groups}
            badges={parseCardBadges(board.cardBadges)}
            archivedCount={archivedCount}
            onOpenCard={setOpenCard}
            onOpenArchive={() => setShowArchive(true)}
            onMove={move}
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
            columns={board.columns}
            fields={board.fields}
            creators={creators}
            onCreated={() => load(activeId)}
          />

          <FieldsDialog
            open={editFields}
            onClose={() => setEditFields(false)}
            boardId={board.id}
            fields={board.fields}
            onChanged={() => load(activeId)}
          />

          <ColumnsDialog
            open={editColumns}
            onClose={() => setEditColumns(false)}
            boardId={board.id}
            columns={board.columns}
            groups={board.groups}
            creators={creators}
            onChanged={() => load(activeId)}
          />

          <GroupsDialog
            open={editGroups}
            onClose={() => setEditGroups(false)}
            boardId={board.id}
            groups={board.groups}
            onChanged={() => load(activeId)}
          />

          <BadgesDialog
            open={editBadges}
            onClose={() => setEditBadges(false)}
            boardId={board.id}
            badges={parseCardBadges(board.cardBadges)}
            onChanged={() => load(activeId)}
          />

          {/*
            Abrir um card do arquivo fecha a lista: dois diálogos empilhados
            dividiriam o Esc — uma tecla fecharia os dois de uma vez — e o de
            baixo continuaria travando a rolagem do de cima.
          */}
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

          <AssigneeDialog
            open={!!pendingMove}
            columnName={pendingMove?.columnName ?? ""}
            cardTitle={pendingMove?.cardTitle ?? ""}
            /* Só quem responde pela etapa aparece: a pergunta é "quem assume
               isto aqui", e o quadro inteiro na lista a transformaria em "quem
               existe na empresa". */
            creators={stageCandidates(
              board.columns.find((c) => c.id === pendingMove?.columnId),
              creators
            )}
            busy={assigning}
            onClose={() => setPendingMove(null)}
            onConfirm={async (acronym) => {
              if (!pendingMove) return;
              setAssigning(true);
              const ok = await move(pendingMove.cardId, pendingMove.columnId, pendingMove.order, acronym);
              setAssigning(false);
              if (ok) setPendingMove(null);
            }}
          />

          <CardDialog
            card={openCard}
            fields={board.fields}
            columns={board.columns}
            creators={creators}
            onClose={() => setOpenCard(null)}
            onChanged={() => load(activeId)}
          />
        </>
      )}
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, SlidersHorizontal, Columns3, LayoutGrid } from "lucide-react";
import KanbanBoard from "@/components/creator/KanbanBoard";
import DemandDialog, { type CreatorOption } from "@/components/creator/DemandDialog";
import FieldsDialog from "@/components/creator/FieldsDialog";
import ColumnsDialog, { type ColumnDefinition } from "@/components/creator/ColumnsDialog";
import CardDialog, { type CardData } from "@/components/creator/CardDialog";
import { type FieldDefinition } from "@/components/creator/FieldInput";
import { Skeleton } from "@/components/Skeleton";

interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  receivesCopy: boolean;
}

interface BoardDetail extends BoardSummary {
  columns: ColumnDefinition[];
  fields: FieldDefinition[];
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
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newDemand, setNewDemand] = useState(false);
  const [editFields, setEditFields] = useState(false);
  const [editColumns, setEditColumns] = useState(false);
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
      .then((res) => setCreators(res.data || []))
      .catch(() => setCreators([]));
  }, [load]);

  // O card aberto precisa acompanhar a recarga: sem isto, mudar a etapa pelo
  // painel deixaria o painel mostrando a etapa antiga até alguém fechá-lo.
  useEffect(() => {
    if (!openCard) return;
    const fresh = cards.find((c) => c.id === openCard.id);
    if (fresh && fresh !== openCard) setOpenCard(fresh);
  }, [cards, openCard]);

  const move = async (cardId: string, columnId: string, order: string[]) => {
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
      body: JSON.stringify({ move: { cardId, columnId, order } }),
    });

    // Falhou: recarrega e a verdade do banco volta à tela.
    if (!res.ok) load(activeId);
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
              kanban<span className="dot-green">.</span>
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
            onOpenCard={setOpenCard}
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
            onChanged={() => load(activeId)}
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

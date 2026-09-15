"use client";

import React, { useMemo, useState } from "react";
import { Clock, Wand2, AlertTriangle } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsDialog";
import { type CardData } from "./CardDialog";
import type { CreatorOption } from "./DemandDialog";
import { parseValues, isOverdue, PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from "@/lib/kanban";
import { parseCopyVariations } from "@/lib/copy-parse";

/**
 * O quadro.
 *
 * O arrasto é o do próprio navegador (`draggable` + os eventos de `drop`), sem
 * biblioteca: o que se move aqui é um cartão entre quatro listas, e uma
 * dependência de arrasto custaria mais bytes no primeiro carregamento do que a
 * tela inteira. O preço é não funcionar no toque — por isso o card também mudam
 * de etapa por um seletor no seu painel, que é o caminho do celular.
 */
export default function KanbanBoard({
  columns,
  cards,
  fields,
  creators,
  onOpenCard,
  onMove,
}: {
  columns: ColumnDefinition[];
  cards: CardData[];
  fields: FieldDefinition[];
  creators: CreatorOption[];
  onOpenCard: (card: CardData) => void;
  onMove: (cardId: string, columnId: string, order: string[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const map = new Map<string, CardData[]>();
    columns.forEach((c) => map.set(c.id, []));
    cards.forEach((card) => {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    });
    return map;
  }, [columns, cards]);

  /** Os campos marcados para aparecer na frente do card. */
  const frontFields = useMemo(() => fields.filter((f) => f.showOnCard), [fields]);

  /*
   * Quantas variações cada copy carrega.
   *
   * Memorizado por `cards` e não calculado na renderização: o arrasto dispara
   * `onDragOver` continuamente, e reanalisar o markdown de cada card a cada
   * quadro do movimento é trabalho jogado fora.
   */
  const variationCounts = useMemo(() => {
    const map = new Map<string, number>();
    cards.forEach((c) => {
      if (c.origin === "COPY" && c.copyText) {
        map.set(c.id, parseCopyVariations(c.copyText).length);
      }
    });
    return map;
  }, [cards]);

  const drop = (columnId: string) => {
    if (!draggingId) return;

    const current = byColumn.get(columnId) ?? [];
    // O card vai para o fim da coluna de destino. Soltar numa posição exata
    // exigiria medir a altura de cada card durante o arrasto — e a ordem dentro
    // da etapa é ajustável pela prioridade, que já é o critério que importa.
    const order = [...current.filter((c) => c.id !== draggingId).map((c) => c.id), draggingId];

    onMove(draggingId, columnId, order);
    setDraggingId(null);
    setOverColumn(null);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--gap-grid)",
        alignItems: "flex-start",
        overflowX: "auto",
        paddingBottom: "1rem",
      }}
    >
      {columns.map((column) => {
        const list = byColumn.get(column.id) ?? [];
        const overLimit = column.wipLimit !== null && list.length > column.wipLimit;

        return (
          <section
            key={column.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(column.id);
            }}
            onDragLeave={() => setOverColumn((c) => (c === column.id ? null : c))}
            onDrop={() => drop(column.id)}
            className="glass-panel"
            style={{
              flex: "0 0 300px",
              width: "300px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap-stack)",
              padding: "var(--pad-card)",
              // A coluna sob o cursor se destaca pela borda, como o hover dos
              // cartões de criativo já faz — nada de fundo colorido novo.
              borderColor: overColumn === column.id ? "var(--primary)" : undefined,
              minHeight: "160px",
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                aria-hidden="true"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "var(--radius-pill)",
                  background: column.color || "var(--muted)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: "var(--text-cardtitle)", fontWeight: 700, flex: 1, minWidth: 0 }}>
                {column.name}
              </span>
              <span
                title={
                  column.wipLimit !== null
                    ? `${list.length} de ${column.wipLimit} no limite desta etapa`
                    : `${list.length} demanda(s)`
                }
                style={{
                  fontSize: "var(--text-eyebrow)",
                  fontWeight: 600,
                  padding: "0.1rem 0.5rem",
                  borderRadius: "var(--radius-pill)",
                  background: overLimit ? "rgba(239, 68, 68, 0.1)" : "var(--surface-sunken)",
                  color: overLimit ? "var(--danger)" : "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                {overLimit && <AlertTriangle size={10} />}
                {column.wipLimit !== null ? `${list.length}/${column.wipLimit}` : list.length}
              </span>
            </header>

            {list.length === 0 && (
              <span className="field-hint" style={{ padding: "0.5rem 0" }}>
                Nada nesta etapa.
              </span>
            )}

            {list.map((card) => {
              const values = parseValues(card.values);
              const assignee = creators.find((c) => c.acronym === card.assigneeAcronym);
              const priority = (card.priority as Priority) || "MEDIA";

              // Um prazo vencido precisa saltar aos olhos no quadro, não só
              // dentro do card — é a informação que muda o que se faz agora.
              const due = card.dueDate ? new Date(card.dueDate) : null;
              const late = !card.completedAt && isOverdue(card.dueDate);

              return (
                <article
                  key={card.id}
                  draggable
                  onDragStart={() => setDraggingId(card.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverColumn(null);
                  }}
                  onClick={() => onOpenCard(card)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenCard(card);
                    }
                  }}
                  title={card.title}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                    padding: "0.7rem",
                    borderRadius: "var(--radius-block)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--surface-sunken-border)",
                    borderLeft: `3px solid ${PRIORITY_COLOR[priority]}`,
                    cursor: "grab",
                    opacity: draggingId === card.id ? 0.5 : 1,
                    transition: "opacity 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem" }}>
                    {card.origin === "COPY" && (
                      <Wand2 size={13} color="var(--primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
                    )}
                    <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-control)", fontWeight: 600, lineHeight: 1.35 }}>
                      {card.title}
                    </span>

                    {/* Quantas peças de texto há para produzir ali dentro — a
                        diferença entre uma demanda e doze não deveria exigir
                        abrir o card. */}
                    {(variationCounts.get(card.id) ?? 0) > 1 && (
                      <span
                        title={`${variationCounts.get(card.id)} variações de copy`}
                        style={{
                          flexShrink: 0,
                          fontSize: "var(--text-eyebrow)",
                          fontWeight: 600,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--primary-glow)",
                          color: "var(--primary)",
                        }}
                      >
                        {variationCounts.get(card.id)}×
                      </span>
                    )}
                  </div>

                  {frontFields.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {frontFields.map((field) => {
                        const value = values[field.key];
                        if (value === undefined || value === null || value === "") return null;
                        return (
                          <span
                            key={field.id}
                            title={`${field.label}: ${formatFieldValue(field, value)}`}
                            style={{
                              fontSize: "var(--text-eyebrow)",
                              padding: "0.1rem 0.45rem",
                              borderRadius: "var(--radius-pill)",
                              background: "var(--card-bg)",
                              border: "1px solid var(--card-border)",
                              color: "var(--muted)",
                              maxWidth: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatFieldValue(field, value)}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span
                      title={`Prioridade ${PRIORITY_LABEL[priority]}`}
                      style={{
                        fontSize: "var(--text-eyebrow)",
                        fontWeight: 600,
                        color: PRIORITY_COLOR[priority],
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {PRIORITY_LABEL[priority]}
                    </span>

                    {due && (
                      <span
                        title={late ? "Prazo vencido" : "Prazo"}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.2rem",
                          fontSize: "var(--text-eyebrow)",
                          color: late ? "var(--danger)" : "var(--muted)",
                          fontWeight: late ? 600 : 400,
                        }}
                      >
                        <Clock size={10} />
                        {due.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    )}

                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                      {card.assigneeAcronym ? (
                        <Avatar
                          name={assignee?.name || card.assigneeAcronym}
                          src={assignee?.avatarUrl}
                          size="xs"
                        />
                      ) : (
                        <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)" }}>
                          sem dono
                        </span>
                      )}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

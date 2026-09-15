"use client";

import React, { useMemo, useState } from "react";
import { Clock, Wand2, AlertTriangle, Link2, Archive } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsDialog";
import { type CardData } from "./CardDialog";
import type { CreatorOption } from "./DemandDialog";
import {
  parseValues,
  isOverdue,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  DEFAULT_CARD_BADGES,
  type CardBadgeKey,
  type Priority,
} from "@/lib/kanban";
import { parseCopyVariations } from "@/lib/copy-parse";
import { titleShowsPieceCount } from "@/lib/copy-options";
import { parseAttachments } from "@/lib/attachments";
import { describeCardLink } from "@/lib/card-link";
import AttachmentGallery from "./AttachmentGallery";

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
  badges = DEFAULT_CARD_BADGES,
  archivedCount = 0,
  onOpenCard,
  onOpenArchive,
  onMove,
}: {
  columns: ColumnDefinition[];
  cards: CardData[];
  fields: FieldDefinition[];
  creators: CreatorOption[];
  /** Os atributos embutidos que este quadro mostra na frente do card. */
  badges?: CardBadgeKey[];
  /** Quantas demandas estão no arquivo, para o card fixo mostrar. */
  archivedCount?: number;
  onOpenCard: (card: CardData) => void;
  onOpenArchive?: () => void;
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

  const shows = useMemo(() => new Set(badges), [badges]);

  /*
   * Onde o card do arquivo mora: no fim da coluna de entrega, porque é a
   * continuação natural do fluxo — backlog, produção, revisão, entregue,
   * arquivo. Sem coluna de entrega marcada, vai para a última: o card não pode
   * simplesmente não aparecer, já que ele é a única porta para o que saiu do
   * quadro.
   */
  const archiveColumnId = useMemo(() => {
    const done = columns.find((c) => c.isDone);
    return done?.id ?? columns[columns.length - 1]?.id ?? null;
  }, [columns]);

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
              const pecas = variationCounts.get(card.id) ?? 0;
              const anexos = parseAttachments(card.attachments);
              const link = describeCardLink(card.linkUrl);

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
                        abrir o card. Os cards criados pelo gerador já dizem isso
                        no título ("… • 12 Peças"); o selo é para os de antes do
                        formato, e não aparece duas vezes no mesmo card. */}
                    {pecas > 1 && !titleShowsPieceCount(card.title, pecas) && (
                      <span
                        title={`${pecas} variações de copy`}
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
                        {pecas}×
                      </span>
                    )}
                  </div>

                  {/*
                    A fila de mini-badges.

                    Os quatro atributos embutidos — urgência, prazo, responsável
                    e etapa — saem da configuração do quadro, e as respostas do
                    formulário, do `showOnCard` de cada campo. Numa linha só, e
                    não uma por grupo: a diferença entre um card de três linhas e
                    um de cinco é quantos cabem na tela sem rolar.
                  */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    {shows.has("priority") && (
                      <span
                        className="card-badge"
                        title={`Prioridade ${PRIORITY_LABEL[priority]}`}
                        style={{
                          color: PRIORITY_COLOR[priority],
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {PRIORITY_LABEL[priority]}
                      </span>
                    )}

                    {shows.has("dueDate") && due && (
                      <span
                        className="card-badge"
                        title={
                          late
                            ? `Prazo vencido em ${due.toLocaleDateString("pt-BR")}`
                            : `Prazo: ${due.toLocaleDateString("pt-BR")}`
                        }
                        // O prazo vencido também pinta a borda: entre doze cards
                        // cinzas, texto vermelho de 0,65rem passa batido.
                        style={
                          late
                            ? { color: "var(--danger)", borderColor: "var(--danger)", fontWeight: 600 }
                            : undefined
                        }
                      >
                        <Clock size={10} />
                        {due.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    )}

                    {shows.has("assignee") &&
                      (card.assigneeAcronym ? (
                        <span
                          className="card-badge"
                          title={assignee?.name || card.assigneeAcronym}
                          style={{ paddingLeft: "0.15rem", fontWeight: 600, letterSpacing: "0.04em" }}
                        >
                          <Avatar
                            name={assignee?.name || card.assigneeAcronym}
                            src={assignee?.avatarUrl}
                            size="xs"
                          />
                          {card.assigneeAcronym}
                        </span>
                      ) : (
                        <span className="card-badge" title="Ninguém assumiu esta demanda">
                          sem dono
                        </span>
                      ))}

                    {shows.has("stage") && (
                      <span className="card-badge" title={`Etapa: ${column.name}`}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "var(--radius-pill)",
                            background: column.color || "var(--muted)",
                            flexShrink: 0,
                          }}
                        />
                        {column.name}
                      </span>
                    )}

                    {/*
                      O link não é um badge como os outros: os demais informam, e
                      este leva a algum lugar. Por isso é uma âncora de verdade —
                      abre em aba nova, aparece no menu de contexto, dá para
                      copiar — e não um `span` com `onClick`. Na cor da marca,
                      lavada, para se distinguir da fileira cinza sem gritar.
                    */}
                    {link && card.linkUrl && (
                      <a
                        href={card.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="card-badge"
                        title={`Abrir ${link.label}${link.detail ? ` · ${link.detail}` : ""}`}
                        // O card inteiro é um botão que abre o painel da demanda:
                        // sem parar o clique aqui, abrir a pasta abriria as duas
                        // coisas ao mesmo tempo.
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontWeight: 600,
                          color: link.isDrive ? "#4285F4" : "var(--primary)",
                          borderColor: link.isDrive ? "rgba(66,133,244,0.38)" : "var(--primary)",
                          background: link.isDrive ? "rgba(66,133,244,0.12)" : "var(--primary-glow)",
                        }}
                      >
                        <Link2 size={10} />
                        {link.isDrive ? "Drive" : link.label}
                      </a>
                    )}

                    {/* O clipe não passa pela configuração de badges: aqueles
                        são atributos que todo card tem e que cada quadro decide
                        mostrar; este só existe quando há algo anexado, e
                        escondê-lo esconderia conteúdo do card, não um enfeite. */}
                    <AttachmentGallery attachments={anexos} variant="badge" />

                    {frontFields.map((field) => {
                      const value = values[field.key];
                      if (value === undefined || value === null || value === "") return null;
                      return (
                        <span
                          key={field.id}
                          className="card-badge"
                          title={`${field.label}: ${formatFieldValue(field, value)}`}
                        >
                          {formatFieldValue(field, value)}
                        </span>
                      );
                    })}
                  </div>
                </article>
              );
            })}

            {/*
              O card do arquivo.

              É um card, e não um botão na barra: quem trabalha aqui lê o quadro
              como uma fileira de cartões, e o arquivo é a última etapa do mesmo
              percurso — backlog, produção, revisão, entregue, arquivo. Tem a
              mesma moldura, o mesmo espaçamento e o mesmo alvo de clique dos
              outros.

              O que o distingue é o que ele é: permanente. Não arrasta, não tem
              prioridade nem dono, não se arquiva nem se apaga — a borda
              tracejada e a cor apagada dizem isso antes de qualquer tentativa.
              E ele fica na coluna mesmo quando não há nada arquivado: some só
              quando a porta some junto, e a porta não some.
            */}
            {column.id === archiveColumnId && onOpenArchive && (
              <article
                role="button"
                tabIndex={0}
                title="Ver tudo que saiu do quadro"
                onClick={onOpenArchive}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenArchive();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.7rem",
                  borderRadius: "var(--radius-block)",
                  background: "transparent",
                  border: "1px dashed var(--card-border)",
                  cursor: "pointer",
                  transition: "border-color 0.2s ease",
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--card-border)")}
              >
                <Archive size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />

                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "var(--text-control)", fontWeight: 600, color: "var(--muted)" }}>
                    Arquivo
                  </span>
                  <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)" }}>
                    entregas de meses anteriores
                  </span>
                </span>

                {archivedCount > 0 && (
                  <span className="card-badge" style={{ flexShrink: 0 }}>
                    {archivedCount}
                  </span>
                )}
              </article>
            )}
          </section>
        );
      })}
    </div>
  );
}

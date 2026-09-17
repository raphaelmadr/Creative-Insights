"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, GripVertical } from "lucide-react";
import { type FieldDefinition } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsSection";
import { type CardData } from "./CardDialog";
import type { PersonOption } from "./DemandDialog";
import {
  groupColumns,
  reorderColumns,
  type ColumnPlacement,
  DEFAULT_CARD_BADGES,
  type CardBadgeKey,
  type GroupDefinition,
  type Priority,
} from "@/lib/kanban";
import { parseCopyVariations } from "@/lib/copy-parse";
import CardFace, { estiloDoCard } from "./CardFace";

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
  people,
  groups = [],
  badges = DEFAULT_CARD_BADGES,
  onOpenCard,
  onMove,
  onReorderColumns,
}: {
  columns: ColumnDefinition[];
  cards: CardData[];
  fields: FieldDefinition[];
  people: PersonOption[];
  /** As fases do quadro — cada uma vira uma faixa sobre as etapas dela. */
  groups?: GroupDefinition[];
  /** Os atributos embutidos que este quadro mostra na frente do card. */
  badges?: CardBadgeKey[];
  onOpenCard: (card: CardData) => void;
  onMove: (cardId: string, columnId: string, order: string[]) => void;
  /** A nova ordem das etapas, com a fase de cada uma, depois de um arrasto. */
  onReorderColumns?: (ordem: ColumnPlacement[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  /*
   * O arrasto de ETAPA é um estado separado do de card.
   *
   * Os dois usam os mesmos eventos do navegador sobre os mesmos elementos: a
   * coluna é alvo de soltura para o card e, agora, para outra coluna. Saber
   * qual gesto está em curso é o que decide se soltar move uma demanda ou
   * reordena a esteira — sem isso, arrastar uma etapa sobre outra mandaria um
   * card fantasma para lá.
   */
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [overColumnDrop, setOverColumnDrop] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const map = new Map<string, CardData[]>();
    columns.forEach((c) => map.set(c.id, []));
    cards.forEach((card) => {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    });
    return map;
  }, [columns, cards]);

  /*
   * As etapas repartidas em faixas — a fase e as colunas que ela cobre.
   *
   * A repartição é pura e mora em `lib/kanban.ts`: é a mesma pergunta que o
   * editor de etapas precisa responder ao mostrar a que fase cada coluna
   * pertence, e duas respostas divergiriam no primeiro ajuste.
   */
  const segmentos = useMemo(() => groupColumns(columns, groups), [columns, groups]);

  /* Sem nenhuma fase, nada de faixas nem do espaço reservado para elas. */
  const temFases = useMemo(() => segmentos.some((s) => s.group), [segmentos]);

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

  /**
   * A etapa arrastada assume o lugar da etapa sobre a qual foi solta.
   *
   * A regra mora em `reorderColumns`, não aqui: ela é a mesma que o servidor
   * grava, e duplicá-la na tela faria as duas divergirem na primeira mudança.
   * Daqui sai só o gesto.
   */
  const soltarEtapa = (alvoId: string) => {
    const arrastada = draggingColumn;
    setDraggingColumn(null);
    setOverColumnDrop(null);
    if (!arrastada || arrastada === alvoId || !onReorderColumns) return;

    onReorderColumns(reorderColumns(columns, arrastada, alvoId));
  };

  /**
   * A faixa de uma fase — ou o espaço que ela ocuparia.
   *
   * O espaço reservado nas etapas sem fase não é desperdício: sem ele, uma
   * coluna solta subiria e o topo do quadro viraria uma linha quebrada. Fica
   * invisível, e não ausente, para todas as colunas começarem na mesma altura.
   */
  const faixa = (group: GroupDefinition | null, cards: number) => {
    if (!temFases) return null;

    if (!group) {
      return (
        <div aria-hidden="true" style={{ visibility: "hidden", padding: "0.2rem 0", fontSize: "var(--text-eyebrow)" }}>
          &nbsp;
        </div>
      );
    }

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.2rem 0.1rem",
          // A cor da fase numa linha sob o nome, e não num fundo cheio: um
          // bloco colorido atrás de tudo competiria com a prioridade dos cards,
          // que é a cor que precisa saltar aqui dentro.
          borderBottom: `2px solid ${group.color}`,
        }}
      >
        <span
          style={{
            fontSize: "var(--text-eyebrow)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: group.color,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {group.name}
        </span>

        <span
          title={`${cards} demanda(s) neste grupo`}
          style={{ fontSize: "var(--text-eyebrow)", fontWeight: 600, color: "var(--muted)", flexShrink: 0 }}
        >
          {cards}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--gap-compact)",
        alignItems: "flex-start",
        overflowX: "auto",
        /*
         * O quadro é que rola, nos dois sentidos, e ocupa o que sobra da altura
         * da janela. `minHeight: 0` é o que permite encolher abaixo do conteúdo:
         * sem ele, um item de flex se recusa a ficar menor do que aquilo que
         * tem dentro, e a barra voltaria a ser empurrada para fora da tela pela
         * coluna mais alta.
         */
        overflowY: "auto",
        flex: 1,
        minHeight: 0,
        paddingBottom: "0.35rem",
      }}
    >
      {segmentos.map((seg) => {
        const largura = seg.columns.length;

        return (
          <div
            key={seg.group ? `g:${seg.group.id}` : `c:${seg.columns[0].id}`}
            style={{
              /*
               * A faixa cresce com o número de etapas que cobre: uma fase de
               * três colunas ocupa o triplo de uma de uma só, e as colunas
               * continuam com a mesma largura entre fases diferentes.
               */
              flex: `${largura} 0 auto`,
              minWidth: `calc(${largura} * 280px + ${largura - 1} * var(--gap-compact))`,
              // O mesmo teto das etapas que a faixa cobre, senão ela se estica
              // além delas e o título da fase descola das próprias colunas.
              maxWidth: `calc(${largura} * 400px + ${largura - 1} * var(--gap-compact))`,
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap-compact)",
            }}
          >
            {faixa(
              seg.group,
              seg.columns.reduce((total, c) => total + (byColumn.get(c.id)?.length ?? 0), 0)
            )}

            <div style={{ display: "flex", gap: "var(--gap-compact)", alignItems: "flex-start" }}>
              {seg.columns.map((column) => {
        const list = byColumn.get(column.id) ?? [];
        const overLimit = column.wipLimit !== null && list.length > column.wipLimit;

        return (
          <section
            key={column.id}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggingColumn) setOverColumnDrop(column.id);
              else setOverColumn(column.id);
            }}
            onDragLeave={() => {
              setOverColumn((c) => (c === column.id ? null : c));
              setOverColumnDrop((c) => (c === column.id ? null : c));
            }}
            onDrop={() => (draggingColumn ? soltarEtapa(column.id) : drop(column.id))}
            className="glass-panel"
            style={{
              /*
               * Entre 280 e 400px: cresce para ocupar a tela, nunca encolhe
               * a ponto de apertar, nunca estica a ponto de ficar absurda.
               *
               * `flex-shrink: 0` é o que resolve a esteira longa: a partir do
               * momento em que as etapas não cabem, elas param de se espremer e
               * o quadro passa a rolar. Antes o piso era 200px COM
               * encolhimento, então cada etapa nova comprimia todas as outras
               * até o card ficar ilegível, em vez de oferecer a rolagem.
               *
               * O teto de 400px é o outro lado, e só apareceu quando esta tela
               * passou a usar o monitor inteiro: com três etapas num monitor
               * largo, crescer sem limite dá colunas de mil pixels — espaço
               * ocupado, não aproveitado. Sobra é melhor à direita, junta, do
               * que diluída dentro de cada etapa.
               */
              flex: "1 0 280px",
              maxWidth: "400px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap-compact)",
              padding: "var(--pad-compact)",
              /*
               * A coluna sob o cursor se destaca pela borda, como o hover dos
               * cartões de criativo já faz — nada de fundo colorido novo.
               *
               * Reordenar usa a borda tracejada: o gesto é outro, e um destaque
               * idêntico ao de receber card faria os dois se confundirem
               * justamente quando os dois são possíveis.
               */
              borderColor:
                overColumnDrop === column.id
                  ? "var(--warning)"
                  : overColumn === column.id
                    ? "var(--primary)"
                    : undefined,
              borderStyle: overColumnDrop === column.id ? "dashed" : undefined,
              minHeight: "120px",
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                // Só o cabeçalho arrasta. A coluna inteira arrastável roubaria
                // o gesto dos cards, que são o que se move o dia todo aqui.
                opacity: draggingColumn === column.id ? 0.4 : 1,
              }}
            >
              {onReorderColumns && (
                <span
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    /*
                     * `setData` não é decoração: o Firefox se recusa a iniciar
                     * um arrasto cujo `dataTransfer` está vazio, e a alça
                     * simplesmente não responderia lá.
                     */
                    e.dataTransfer.setData("text/plain", column.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingColumn(column.id);
                  }}
                  onDragEnd={() => {
                    setDraggingColumn(null);
                    setOverColumnDrop(null);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Reordenar a etapa ${column.name}`}
                  title="Arraste para reordenar esta etapa"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: "grab",
                    color: "var(--muted)",
                    flexShrink: 0,
                    // A alça só aparece de verdade no hover do cabeçalho; ela é
                    // uma ferramenta de arrumação, não um enfeite permanente
                    // competindo com o nome da etapa.
                    opacity: 0.45,
                  }}
                >
                  <GripVertical size={13} />
                </span>
              )}
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

            {/*
              A descrição da etapa, logo abaixo do nome.

              O fluxo é combinado entre pessoas, e "Em revisão" não diz quem
              revisa nem o que precisa estar pronto para entrar ali. Fica no
              quadro, onde a dúvida aparece — num diálogo de configuração, só
              quem foi configurar leria.
            */}
            {column.description && (
              <span className="field-hint" style={{ lineHeight: 1.45 }}>
                {column.description}
              </span>
            )}

            {list.length === 0 && (
              <span className="field-hint" style={{ padding: "0.5rem 0" }}>
                Nada nesta etapa.
              </span>
            )}

            {list.map((card) => {
              /*
                Só o que a MOLDURA precisa fica aqui: a urgência pinta a borda
                esquerda e o arrasto apaga o card. Tudo que é conteúdo mudou-se
                para `CardFace`, que a prévia das preferências também desenha —
                é o que impede as duas de divergirem.
              */
              const priority = (card.priority as Priority) || "MEDIA";

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
                  style={estiloDoCard(priority, { arrastando: draggingId === card.id })}
                >
                  <CardFace
                    card={card}
                    column={column}
                    people={people}
                    fields={fields}
                    badges={badges}
                    pecas={variationCounts.get(card.id) ?? 0}
                  />
                </article>
              );
            })}
          </section>
        );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

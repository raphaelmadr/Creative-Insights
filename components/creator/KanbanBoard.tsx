"use client";

import React, { useMemo, useState } from "react";
import { Clock, Wand2, AlertTriangle, Link2, GripVertical } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsDialog";
import { type CardData } from "./CardDialog";
import type { PersonOption } from "./DemandDialog";
import {
  parseValues,
  labelsForCard,
  plainSummary,
  clampText,
  type CardLabel,
  isOverdue,
  groupColumns,
  parseAssignees,
  reorderColumns,
  type ColumnPlacement,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  DEFAULT_CARD_BADGES,
  type CardBadgeKey,
  type GroupDefinition,
  type Priority,
} from "@/lib/kanban";
import { parseCopyVariations } from "@/lib/copy-parse";
import { titleShowsPieceCount } from "@/lib/copy-options";
import { parseAttachments } from "@/lib/attachments";
import { describeCardLink } from "@/lib/card-link";
import AttachmentGallery from "./AttachmentGallery";
import CardLabelChip from "./CardLabelChip";

/**
 * O quadro.
 *
 * O arrasto é o do próprio navegador (`draggable` + os eventos de `drop`), sem
 * biblioteca: o que se move aqui é um cartão entre quatro listas, e uma
 * dependência de arrasto custaria mais bytes no primeiro carregamento do que a
 * tela inteira. O preço é não funcionar no toque — por isso o card também mudam
 * de etapa por um seletor no seu painel, que é o caminho do celular.
 */
/**
 * O texto escrito à mão, na frente do card.
 *
 * Menor e apagado de propósito: ele é contexto, não é o nome da demanda. Com o
 * mesmo peso do título, o card passa a ter duas coisas disputando a leitura e
 * nenhuma das duas ganha.
 */
const TEXTO_DO_CARD: React.CSSProperties = {
  fontSize: "var(--text-eyebrow)",
  color: "var(--muted)",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export default function KanbanBoard({
  columns,
  cards,
  fields,
  people,
  groups = [],
  badges = DEFAULT_CARD_BADGES,
  labels = [],
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
  /** As etiquetas do quadro — acendem sozinhas, pelo que a demanda respondeu. */
  labels?: CardLabel[];
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

  /** Os campos marcados para aparecer na frente do card. */
  const frontFields = useMemo(() => fields.filter((f) => f.showOnCard), [fields]);

  /*
   * Cada resposta aparece conforme o que ela é.
   *
   * Tudo virava pílula — inclusive um briefing de três parágrafos, espremido
   * numa pílula de uma linha com reticência no fim, ao lado de "Meta Ads". A
   * pílula é uma boa forma para valor curto e fechado: escolha, data, número.
   * Para texto escrito por alguém ela é a forma errada, porque promete que o
   * conteúdo é uma etiqueta e o conteúdo é uma frase.
   */
  const camposDeTexto = useMemo(
    () => frontFields.filter((f) => f.type === "TEXT" || f.type === "TEXTAREA"),
    [frontFields]
  );
  const camposEmPilula = useMemo(
    () => frontFields.filter((f) => f.type !== "TEXT" && f.type !== "TEXTAREA"),
    [frontFields]
  );

  const shows = useMemo(() => new Set(badges), [badges]);

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
              const values = parseValues(card.values);
              /*
                Vários responsáveis: no backlog a demanda é do time inteiro, e
                só vira de uma pessoa quando alguém a puxa para produção.
              */
              const donos = parseAssignees(card.assignees).map(
                (e) => people.find((c) => c.email === e) ?? { email: e, name: e, avatarUrl: null }
              );
              const etiquetas = labelsForCard(values, labels);
              const resumo = clampText(plainSummary(card.description));
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
                    gap: "0.3rem",
                    padding: "0.5rem 0.55rem",
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
                    {shows.has("pieces") && pecas > 1 && !titleShowsPieceCount(card.title, pecas) && (
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
                    As etiquetas, em fileira própria acima dos badges.

                    Elas respondem à pergunta que se faz antes de todas as
                    outras — isto é vídeo ou é peça estática? —, porque é ela que
                    decide para onde a demanda vai: estático é design, vídeo é
                    edição. Misturadas na fileira cinza, com data, dono e etapa,
                    essa resposta teria o mesmo peso visual do resto.
                  */}
                  {shows.has("labels") && etiquetas.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem" }}>
                      {etiquetas.map((label) => (
                        <CardLabelChip key={label.id} label={label} />
                      ))}
                    </div>
                  )}

                  {/*
                    O briefing, encurtado a duas linhas.

                    Card não é lugar de ler briefing — é lugar de reconhecer a
                    demanda. Duas linhas bastam para saber se é aquela que se
                    procura; o resto está a um clique. Por isso vem desligado por
                    padrão: ligado sem querer, ele triplica a altura de todos os
                    cards de uma vez.
                  */}
                  {shows.has("briefing") && resumo && (
                    <span style={TEXTO_DO_CARD}>{resumo}</span>
                  )}

                  {/*
                    As respostas escritas à mão, como texto.

                    Com o rótulo do campo à frente em negrito: sem ele, dois
                    campos de texto seguidos viram um parágrafo só, e não há como
                    saber onde um termina e o outro começa.
                  */}
                  {camposDeTexto.map((field) => {
                    const value = values[field.key];
                    if (value === undefined || value === null || value === "") return null;
                    return (
                      <span key={field.id} style={TEXTO_DO_CARD}>
                        <strong style={{ fontWeight: 600 }}>{field.label}:</strong>{" "}
                        {clampText(String(value))}
                      </span>
                    );
                  })}

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
                      gap: "0.2rem",
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
                    {shows.has("link") && link && card.linkUrl && (
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

                    {shows.has("attachments") && (
                      <AttachmentGallery attachments={anexos} variant="badge" />
                    )}

                    {/*
                      As respostas de valor fechado, como pílula.

                      Uma escolha múltipla vira uma pílula por escolha, e não uma
                      pílula com "Feed 1:1, Story/Reels 9:16" dentro: a lista
                      colada não cabe na largura da coluna, e o que se perde no
                      corte é justamente a segunda escolha.

                      Escolha e link se explicam sozinhos — "Meta Ads" é "Meta
                      Ads". Data, número e sim/não não: "12" não diz nada sem o
                      nome do campo na frente.
                    */}
                    {camposEmPilula.flatMap((field) => {
                      const value = values[field.key];
                      if (value === undefined || value === null || value === "") return [];

                      if (field.type === "MULTISELECT" && Array.isArray(value)) {
                        return value.filter(Boolean).map((escolha, i) => (
                          <span
                            key={`${field.id}-${i}`}
                            className="card-badge"
                            title={`${field.label}: ${String(escolha)}`}
                          >
                            {String(escolha)}
                          </span>
                        ));
                      }

                      if (field.type === "URL") {
                        const destino = describeCardLink(String(value));
                        return [
                          <a
                            key={field.id}
                            href={String(value)}
                            target="_blank"
                            rel="noreferrer"
                            className="card-badge"
                            title={`${field.label}: ${value}`}
                            // O card inteiro abre o painel da demanda: sem parar
                            // o clique aqui, os dois aconteceriam juntos.
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontWeight: 600, color: "var(--primary)" }}
                          >
                            <Link2 size={10} />
                            {destino?.label ?? field.label}
                          </a>,
                        ];
                      }

                      const precisaDoRotulo =
                        field.type === "DATE" || field.type === "NUMBER" || field.type === "CHECKBOX";

                      return [
                        <span
                          key={field.id}
                          className="card-badge"
                          title={`${field.label}: ${formatFieldValue(field, value)}`}
                        >
                          {precisaDoRotulo ? `${field.label}: ` : ""}
                          {formatFieldValue(field, value)}
                        </span>,
                      ];
                    })}
                  </div>

                  {/*
                    Quem assumiu fica sempre no mesmo canto — embaixo, à direita.

                    Antes o crachá vinha no meio da fileira que quebra linha, e a
                    posição dele mudava de card para card conforme o que viesse
                    antes: com prazo e link, descia; sem eles, subia. Procurar
                    "o que é meu" numa coluna virava ler card por card. Num lugar
                    fixo, a mesma varredura é uma olhada na borda direita.
                  */}
                  {shows.has("assignee") && (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {donos.length ? (
                        /*
                          Até três crachás; acima disso, um contador.

                          Seis nomes num card de 280px empurram o resto para fora
                          da vista — e "todo o time da Criação" se lê melhor como
                          "+3" do que como uma parede de avatares. O `title` traz
                          a lista inteira.
                        */
                        <span
                          className="card-badge"
                          title={donos.map((d) => d.name).join(", ")}
                          style={{ paddingLeft: "0.15rem", fontWeight: 600, gap: "0.2rem" }}
                        >
                          {donos.slice(0, 3).map((d) => (
                            <Avatar
                              key={d.email}
                              name={d.name}
                              src={d.avatarUrl ?? undefined}
                              size="xs"
                            />
                          ))}
                          {donos.length === 1
                            ? donos[0].name.split(" ")[0]
                            : donos.length > 3
                              ? `+${donos.length - 3}`
                              : null}
                        </span>
                      ) : (
                        <span className="card-badge" title="Ninguém assumiu esta demanda">
                          sem dono
                        </span>
                      )}
                    </div>
                  )}
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

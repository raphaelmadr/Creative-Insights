"use client";

import React, { useMemo, useState } from "react";
import { Clock, Wand2, AlertTriangle, Link2, Archive, UserCheck, Star } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsDialog";
import { type CardData } from "./CardDialog";
import type { CreatorOption } from "./DemandDialog";
import {
  parseValues,
  isOverdue,
  groupColumns,
  parseAssignees,
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
  groups = [],
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
  /** As fases do quadro — cada uma vira uma faixa sobre as etapas dela. */
  groups?: GroupDefinition[];
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
          title={`${cards} demanda(s) nesta fase`}
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
        paddingBottom: "0.5rem",
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
              flex: `${largura} 1 0`,
              minWidth: `calc(${largura} * 200px + ${largura - 1} * var(--gap-compact))`,
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
        const equipe = parseAssignees(column.assignees);
        const equipeNomes = equipe.map((a) => creators.find((c) => c.acronym === a) ?? { acronym: a, name: a, avatarUrl: null });
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
              /*
               * As etapas dividem a largura disponível em vez de ter 300px
               * cravados: com quatro colunas numa tela larga sobrava vazio, e
               * com seis a última ficava fora da vista. O piso de 200px é onde
               * um card ainda se lê; abaixo disso a fileira volta a rolar.
               */
              flex: "1 1 0",
              minWidth: "200px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--gap-compact)",
              padding: "var(--pad-compact)",
              // A coluna sob o cursor se destaca pela borda, como o hover dos
              // cartões de criativo já faz — nada de fundo colorido novo.
              borderColor: overColumn === column.id ? "var(--primary)" : undefined,
              minHeight: "120px",
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

              {/* A exigência de dono é regra da etapa, e precisa ser visível
                  antes de alguém arrastar até aqui e ser recusado. */}
              {column.requiresAssignee && (
                <UserCheck
                  size={13}
                  aria-label="Exige responsável"
                  style={{ color: "var(--muted)", flexShrink: 0 }}
                />
              )}
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

            {/*
              Quem responde por esta etapa, no alto dela.

              A regra só serve se for legível antes de alguém esbarrar nela: com
              a equipe à vista, "isto é com a Ana" se responde olhando o quadro,
              e não abrindo o editor de etapas. A estrela marca quem assume os
              cards que chegam — a diferença entre poder e pegar.
            */}
            {equipeNomes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.2rem" }}>
                {equipeNomes.map((p) => {
                  const ehPadrao = column.defaultAssignee?.toUpperCase() === p.acronym;
                  return (
                    <span
                      key={p.acronym}
                      className="card-badge"
                      title={
                        ehPadrao
                          ? `${p.name} assume os cards que chegam nesta etapa`
                          : `${p.name} responde por esta etapa`
                      }
                      style={{
                        paddingLeft: "0.15rem",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        ...(ehPadrao
                          ? { color: "var(--warning)", borderColor: "var(--warning)" }
                          : null),
                      }}
                    >
                      <Avatar name={p.name} src={p.avatarUrl ?? undefined} size="xs" />
                      {p.acronym}
                      {ehPadrao && <Star size={9} fill="var(--warning)" />}
                    </span>
                  );
                })}
              </div>
            )}

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
          </section>
        );
              })}
            </div>
          </div>
        );
      })}

      {/*
        O arquivo é a última etapa.

        Não é uma coluna do banco, e por isso não aparece no editor de etapas:
        não se renomeia, não se reordena e não se exclui. Estar no fim da fileira
        é o que o explica sem legenda — a demanda percorre as etapas e, depois de
        entregue, o mês vira e ela termina aqui.

        Não recebe arrasto: `onDragOver` não chama `preventDefault`, então o
        navegador não a aceita como destino. Arquivar continua sendo um gesto
        deliberado, com confirmação, e não uma consequência de soltar o cartão
        um pouco à direita.
      */}
      {onOpenArchive && (
        <div
          style={{
            flex: "1 1 0",
            minWidth: "200px",
            display: "flex",
            flexDirection: "column",
            gap: "var(--gap-compact)",
          }}
        >
          {/* O arquivo não pertence a fase nenhuma — mas guarda o espaço da
              faixa, senão subiria sozinho acima das outras colunas. */}
          {faixa(null, 0)}

        <section
          className="glass-panel"
          aria-label="Arquivo"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--gap-compact)",
            padding: "var(--pad-compact)",
            minHeight: "120px",
          }}
        >
          <header style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              aria-hidden="true"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "var(--radius-pill)",
                background: "var(--muted)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "var(--text-cardtitle)",
                fontWeight: 700,
                flex: 1,
                minWidth: 0,
                color: "var(--muted)",
              }}
            >
              Arquivo
            </span>
            <span
              title={`${archivedCount} demanda(s) no arquivo`}
              style={{
                fontSize: "var(--text-eyebrow)",
                fontWeight: 600,
                padding: "0.1rem 0.5rem",
                borderRadius: "var(--radius-pill)",
                background: "var(--surface-sunken)",
                color: "var(--muted)",
              }}
            >
              {archivedCount}
            </span>
          </header>

          {/*
            Um card só, cinza e sem ações — a porta para o que saiu do quadro.
            Cinza cheio, e não tracejado: ele não é um espaço vazio à espera de
            conteúdo, é um cartão que está ali de vez.
          */}
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
              padding: "0.5rem 0.55rem",
              borderRadius: "var(--radius-block)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--surface-sunken-border)",
              borderLeft: "3px solid var(--muted)",
              color: "var(--muted)",
              cursor: "pointer",
              transition: "border-color 0.2s ease",
            }}
            // `borderColor` pinta os quatro lados, inclusive a faixa da
            // esquerda: sem devolver a dela à parte, o cinza do acento se
            // perderia no primeiro passar do mouse.
            onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--surface-sunken-border)";
              e.currentTarget.style.borderLeftColor = "var(--muted)";
            }}
          >
            <Archive size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
              <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>
                Demandas arquivadas
              </span>
              <span style={{ fontSize: "var(--text-eyebrow)" }}>
                entregas de meses anteriores
              </span>
            </span>
          </article>
        </section>
        </div>
      )}
    </div>
  );
}

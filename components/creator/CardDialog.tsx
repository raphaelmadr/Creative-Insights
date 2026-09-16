"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Trash2, Send, History, Copy as CopyIcon, Check, ChevronsDownUp, ChevronsUpDown, ArchiveRestore, Archive } from "lucide-react";
import Modal from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsDialog";
import VariationCard from "./VariationCard";
import AttachmentGallery from "./AttachmentGallery";
import CardLinkField from "./CardLinkField";
import { parseCopyVariations } from "@/lib/copy-parse";
import { parseAttachments } from "@/lib/attachments";
import type { CreatorOption } from "./DemandDialog";
import { PRIORITIES, PRIORITY_LABEL, parseValues, parseAssignees, stageCandidates } from "@/lib/kanban";

export interface CardData {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  assigneeAcronym: string | null;
  values: string | null;
  origin: string;
  copyText: string | null;
  /** JSON dos anexos — cru, como está no banco. Ver `parseAttachments`. */
  attachments: string | null;
  /** O link das artes — a pasta do Drive. Ver `lib/card-link.ts`. */
  linkUrl: string | null;
  /** Fora do quadro: arquivada à mão ou pela regra de fim de mês. */
  archived: boolean;
  completedAt: string | null;
  createdAt: string;
  /** Última alteração. Num card arquivado, é quando ele saiu do quadro. */
  updatedAt: string;
}

interface Activity {
  id: string;
  type: string;
  message: string;
  authorName: string | null;
  createdAt: string;
}

/**
 * O verso do card: o briefing inteiro, a copy quando houver, e o histórico.
 *
 * O histórico é o que responde "por que isto demorou" sem ninguém precisar
 * lembrar: as idas e vindas entre etapas ficam registradas, e o comentário vive
 * ao lado delas na mesma linha do tempo — não numa aba separada, onde o que foi
 * dito perderia a relação com o que aconteceu.
 */
export default function CardDialog({
  card,
  fields,
  columns,
  creators,
  onClose,
  onChanged,
}: {
  card: CardData | null;
  fields: FieldDefinition[];
  columns: ColumnDefinition[];
  creators: CreatorOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Quais variações estão abertas, por índice.
   *
   * Todas recolhidas no início: o painel do card já carrega contexto, briefing e
   * acompanhamento, e doze variações abertas empurrariam o histórico para dois
   * mil pixels abaixo. Recolhido, cada linha ainda mostra ângulo e headline —
   * dá para achar a que interessa sem abrir uma por uma.
   */
  const [openVariations, setOpenVariations] = useState<Set<number>>(new Set());

  const loadActivities = React.useCallback(async () => {
    if (!card) return;
    try {
      const res = await fetch(`/api/creator/cards?cardId=${card.id}`);
      const data = await res.json();
      if (res.ok) setActivities(data.activities || []);
    } catch {
      // O histórico é complemento: se não carregar, o briefing ainda se lê.
      setActivities([]);
    }
  }, [card]);

  useEffect(() => {
    setComment("");
    setError(null);
    setCopied(false);
    setOpenVariations(new Set());
    loadActivities();
  }, [loadActivities]);

  if (!card) return null;

  const values = parseValues(card.values);

  /*
   * A copy do card, quebrada em variações. Vazio quando o texto não segue o
   * formato — copy escrita à mão, ou saída de um provedor que respondeu fora do
   * padrão. Nesse caso o markdown continua sendo renderizado como antes, em vez
   * de a copy sumir da tela.
   */
  const variations = card.copyText ? parseCopyVariations(card.copyText) : [];
  const anexos = parseAttachments(card.attachments);

  /*
   * O mesmo painel serve ao card do quadro e ao card arquivado — um segundo
   * visualizador só para o arquivo divergiria do primeiro na primeira mudança, e
   * quem abre um card arquivado quer ver exatamente o que via antes: briefing,
   * copy, referências e histórico. O que muda é que nada disso se edita, e o
   * botão de arquivar dá lugar ao de tirar do arquivo.
   */
  const arquivado = card.archived;
  const travado = busy || arquivado;

  /*
   * A etapa onde o card está — é ela que diz quem pode assumi-lo.
   *
   * Quem já é dono entra na lista mesmo estando fora da equipe: pode ter
   * assumido antes de a regra existir, ou ter mudado de time depois. Sem isso o
   * seletor mostraria "A definir" num card que tem responsável, e salvar
   * qualquer outro campo o apagaria sem ninguém pedir.
   */
  const etapaAtual = columns.find((c) => c.id === card.columnId) ?? null;
  const daEtapa = stageCandidates(etapaAtual, creators);
  const foraDaEquipe =
    card.assigneeAcronym && !daEtapa.some((c) => c.acronym === card.assigneeAcronym)
      ? creators.find((c) => c.acronym === card.assigneeAcronym)
      : undefined;
  const candidatos = foraDaEquipe ? [foraDaEquipe, ...daEtapa] : daEtapa;
  const allOpen = variations.length > 0 && openVariations.size === variations.length;

  const patch = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar.");
        return false;
      }
      onChanged();
      loadActivities();
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const block: React.CSSProperties = {
    padding: "var(--pad-card)",
    borderRadius: "var(--radius-block)",
    background: "var(--surface-sunken)",
    border: "1px solid var(--surface-sunken-border)",
  };

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      title={card.title}
      description={
        card.requesterName
          ? `Aberta por ${card.requesterName} em ${stamp(card.createdAt)}`
          : `Aberta em ${stamp(card.createdAt)}`
      }
      width="min(760px, 100%)"
      footer={
        <>
          {arquivado ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                if (await patch({ restore: { cardId: card.id } })) onClose();
              }}
            >
              <ArchiveRestore size={14} />
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Arquivar esta demanda?\n\nEla sai do quadro, mas continua no arquivo — com briefing, copy e histórico.")) return;
                setBusy(true);
                const res = await fetch("/api/creator/cards", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: card.id }),
                });
                setBusy(false);
                if (res.ok) {
                  onChanged();
                  onClose();
                }
              }}
            >
              <Trash2 size={14} />
              Arquivar
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      {/* Etapa, prioridade e responsável: o que muda com mais frequência fica
          no topo, editável sem abrir outra tela. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.9rem" }}>
        <div className="field">
          <label className="field-label" htmlFor="card-etapa">
            Etapa
          </label>
          <select
            id="card-etapa"
            className="field-input"
            value={card.columnId}
            disabled={travado}
            onChange={(e) => patch({ id: card.id, columnId: e.target.value })}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/*
          O responsável sai da equipe da etapa em que o card está.

          Oferecer o quadro inteiro aqui e recusar a escolha no servidor seria
          ensinar a regra pelo erro. A pessoa que já é dona aparece mesmo fora
          da equipe: ela está no card, e some-la do seletor faria a caixa
          mostrar "A definir" para um card que tem dono.
        */}
        <div className="field">
          <label className="field-label" htmlFor="card-responsavel">
            Responsável
          </label>
          <select
            id="card-responsavel"
            className="field-input"
            value={card.assigneeAcronym || ""}
            disabled={travado}
            onChange={(e) => patch({ id: card.id, assigneeAcronym: e.target.value || null })}
          >
            <option value="">A definir</option>
            {candidatos.map((c) => (
              <option key={c.acronym} value={c.acronym}>
                {c.name} ({c.acronym})
              </option>
            ))}
          </select>
          {etapaAtual && parseAssignees(etapaAtual.assignees).length > 0 && (
            <span className="field-hint">
              Quem responde por &quot;{etapaAtual.name}&quot;.
              {etapaAtual.defaultAssignee ? ` Por padrão, ${etapaAtual.defaultAssignee}.` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Prioridade</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-toggle"
              aria-pressed={card.priority === p}
              disabled={travado}
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => patch({ id: card.id, priority: p })}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {arquivado && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 0.7rem",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
            fontSize: "var(--text-control)",
            color: "var(--muted)",
          }}
        >
          <Archive size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Esta demanda está no arquivo. Tudo continua aqui; para voltar a mexer nela, restaure.
          </span>
        </div>
      )}

      {/*
        O link fica no topo, junto do que muda todo dia, e não lá embaixo com o
        briefing: quem abre o card de uma demanda em produção quase sempre está
        atrás de uma coisa só — onde estão os arquivos.

        A `key` amarra o estado do campo ao card: sem ela, abrir outro card
        reaproveitaria o rascunho do anterior, já que o diálogo é o mesmo.
      */}
      <CardLinkField
        key={card.id}
        id="card-link"
        value={card.linkUrl}
        busy={travado}
        hint="A pasta do Drive onde as imagens desta demanda estão."
        onSave={(url) => patch({ id: card.id, linkUrl: url })}
      />

      {card.description && (
        <div className="field">
          <span className="field-label">Contexto</span>
          <div style={{ ...block, fontSize: "var(--text-body)", lineHeight: 1.55 }}>
            <ReactMarkdown>{card.description}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* As referências ficam acima do briefing: elas são a parte do pedido que
          se entende antes de ler qualquer coisa. Clicar abre a imagem inteira no
          mesmo popup que abre a arte de um criativo. */}
      {anexos.length > 0 && (
        <div className="field">
          <span className="field-label">Referências</span>
          <AttachmentGallery attachments={anexos} />
        </div>
      )}

      {fields.length > 0 && (
        <div className="field">
          <span className="field-label">Briefing</span>
          <div style={{ ...block, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {fields.map((field) => (
              <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                <span
                  style={{
                    fontSize: "var(--text-eyebrow)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--muted)",
                  }}
                >
                  {field.label}
                </span>
                <span style={{ fontSize: "var(--text-control)" }}>
                  {formatFieldValue(field, values[field.key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.copyText && (
        <div className="field">
          <span className="field-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <span>
              Copy gerada
              {variations.length > 1 && (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  {" "}· {variations.length} variações
                </span>
              )}
            </span>

            <span style={{ display: "flex", gap: "0.25rem" }}>
              {/* Abrir tudo de uma vez é para quem veio comparar as variações;
                  recolher tudo, para quem já achou a que queria. */}
              {variations.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "var(--text-caption)" }}
                  onClick={() =>
                    setOpenVariations(
                      allOpen ? new Set() : new Set(variations.map((_, i) => i))
                    )
                  }
                >
                  {allOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                  {allOpen ? "Recolher" : "Expandir"}
                </button>
              )}

              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.25rem 0.6rem", fontSize: "var(--text-caption)" }}
                onClick={() => {
                  navigator.clipboard?.writeText(card.copyText || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={13} /> : <CopyIcon size={13} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </span>
          </span>

          {variations.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {variations.map((v, i) => (
                <VariationCard
                  key={v.id}
                  variation={v}
                  index={i}
                  readOnly
                  collapsible
                  open={openVariations.has(i)}
                  onToggle={() =>
                    setOpenVariations((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div style={{ ...block, fontSize: "var(--text-body)", lineHeight: 1.55 }}>
              <ReactMarkdown>{card.copyText}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <span className="field-label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <History size={14} />
          Acompanhamento
        </span>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            className="field-input"
            style={{ flex: 1, minWidth: 0 }}
            value={comment}
            disabled={travado}
            placeholder={arquivado ? "Arquivada — sem novas atualizações." : "Escreva uma atualização…"}
            aria-label="Novo comentário"
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && comment.trim()) {
                if (await patch({ comment: { cardId: card.id, text: comment } })) setComment("");
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={travado || !comment.trim()}
            onClick={async () => {
              if (await patch({ comment: { cardId: card.id, text: comment } })) setComment("");
            }}
          >
            <Send size={14} />
            Enviar
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
          {activities.length === 0 ? (
            <span className="field-hint">Nenhum registro ainda.</span>
          ) : (
            activities.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                <Avatar name={a.authorName || "?"} size="xs" />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "var(--text-caption)", lineHeight: 1.45 }}>
                    <strong>{a.authorName || "Alguém"}</strong>{" "}
                    {a.type === "COMMENT" ? (
                      <span style={{ color: "var(--muted)" }}>comentou:</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>{a.message}</span>
                    )}
                  </span>
                  {a.type === "COMMENT" && (
                    <span style={{ fontSize: "var(--text-body)", lineHeight: 1.5 }}>{a.message}</span>
                  )}
                  <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)" }}>
                    {stamp(a.createdAt)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

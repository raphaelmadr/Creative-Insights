"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Wand2, Paperclip, Link2, Clock, Trash2, PackageCheck } from "lucide-react";
import Modal from "@/components/Modal";
import { Skeleton } from "@/components/Skeleton";
import { type CardData } from "./CardDialog";
import { parseAssignees } from "@/lib/kanban";
import { parseAttachments } from "@/lib/attachments";
import { describeCardLink } from "@/lib/card-link";
import { PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from "@/lib/kanban";

/**
 * O arquivo do quadro.
 *
 * Existe porque o quadro passou a esvaziar sozinho: a entrega fica o mês em que
 * aconteceu e some quando o mês vira. Some da tela — nunca do banco —, e sem um
 * lugar para consultá-la, "some" e "foi apagada" seriam a mesma coisa para quem
 * olha. Vale também para o arquivamento à mão, que já era invisível antes disto.
 *
 * A lista é de reconhecimento, não de leitura: título, quando saiu, prazo, dono
 * e os sinais de que há copy, referências e link dentro. O conteúdo inteiro se
 * vê abrindo o card — no mesmo painel de sempre, que sabe se apresentar em
 * modo somente-leitura.
 */
export default function ArchiveDialog({
  open,
  onClose,
  boardId,
  onOpenCard,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  onOpenCard: (card: CardData) => void;
  onChanged: () => void;
}) {
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/creator/cards?boardId=${boardId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível ler o arquivo.");
        return;
      }
      setCards(data.cards || []);
      setError(null);
    } catch {
      setError("Falha de conexão ao ler o arquivo.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  // Buscado a cada abertura, e não uma vez só: entre uma consulta e outra o mês
  // pode ter virado, e a lista guardada estaria faltando justamente o que a
  // pessoa veio procurar.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restaurar = async (card: CardData) => {
    setBusy(card.id);
    setError(null);
    try {
      const res = await fetch("/api/creator/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: { cardId: card.id } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível restaurar.");
        return;
      }
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      onChanged();
    } catch {
      setError("Falha de conexão ao restaurar.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Apaga o arquivo inteiro, sem volta.
   *
   * A confirmação diz o número e diz o que vai junto — briefing, copy, anexos e
   * histórico. "Tem certeza?" não informa nada: a pessoa que clicou por engano
   * também tem certeza de que clicou.
   *
   * O servidor confere de novo que só administrador pode, e é lá que mora o
   * filtro de "apenas arquivados". Esta tela não manda apagar nada além do
   * quadro que está aberto.
   */
  const esvaziar = async () => {
    if (
      !confirm(
        `Apagar em definitivo ${cards.length} demanda(s) do arquivo?\n\n` +
          `Briefing, copy, anexos e histórico vão junto. Não há como desfazer, ` +
          `e não há cópia em outro lugar.`
      )
    ) {
      return;
    }

    setBusy("tudo");
    setError(null);
    try {
      const res = await fetch("/api/creator/cards/purge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível esvaziar o arquivo.");
        return;
      }
      setCards([]);
      onChanged();
    } catch {
      setError("Falha de conexão ao esvaziar o arquivo.");
    } finally {
      setBusy(null);
    }
  };

  const quando = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Arquivo do quadro"
      description="Tudo que saiu do quadro — arquivado à mão ou pela virada do mês. Nada foi apagado."
      width="min(720px, 100%)"
      footer={
        <>
          {/*
            Fica à esquerda, longe do botão de fechar, e só existe quando há o
            que apagar. Um botão vermelho encostado no "Fechar" cobra atenção
            justamente de quem só queria sair da tela.
          */}
          {cards.length > 0 && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={esvaziar}
              disabled={busy !== null}
              style={{ marginRight: "auto" }}
              title="Apagar em definitivo tudo o que está no arquivo"
            >
              <Trash2 size={14} />
              {busy === "tudo" ? "Apagando…" : "Esvaziar arquivo"}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy !== null}>
            Fechar
          </button>
        </>
      }
    >
      {loading ? (
        [0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            height="58px"
            borderRadius="var(--radius-block)"
            style={{ background: "var(--surface-sunken)" }}
          />
        ))
      ) : cards.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
            padding: "2rem 1rem",
            color: "var(--muted)",
            fontSize: "var(--text-control)",
            textAlign: "center",
          }}
        >
          <Archive size={26} />
          Nada no arquivo ainda.
        </div>
      ) : (
        cards.map((card) => {
          const anexos = parseAttachments(card.attachments);
          const link = describeCardLink(card.linkUrl);
          const priority = (card.priority as Priority) || "MEDIA";

          return (
            <div
              key={card.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.6rem 0.75rem",
                borderRadius: "var(--radius-block)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--surface-sunken-border)",
                borderLeft: `3px solid ${PRIORITY_COLOR[priority]}`,
              }}
            >
              <button
                type="button"
                title="Abrir a demanda arquivada"
                onClick={() => onOpenCard(card)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  alignItems: "flex-start",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-control)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    maxWidth: "100%",
                  }}
                >
                  {card.origin === "COPY" && (
                    <Wand2 size={12} color="var(--primary)" style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {card.title}
                  </span>
                </span>

                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
                  {/* A última alteração de um card arquivado é o arquivamento —
                      não há escrita depois dele. */}
                  <span className="card-badge" title="Saiu do quadro em">
                    <Archive size={10} />
                    {quando(card.updatedAt)}
                  </span>

                  {card.completedAt && (
                    <span className="card-badge" title="Entregue em">
                      <Clock size={10} />
                      entregue {quando(card.completedAt)}
                    </span>
                  )}

                  {parseAssignees(card.assignees).length > 0 && (
                    /* A parte antes do @, e não o endereço inteiro: o crachá
                       vive numa linha com data e link, e um e-mail corporativo
                       completo empurra os dois para fora dela. */
                    <span
                      className="card-badge"
                      style={{ fontWeight: 600 }}
                      title={parseAssignees(card.assignees).join(", ")}
                    >
                      {parseAssignees(card.assignees)
                        .map((e) => e.split("@")[0])
                        .join(", ")}
                    </span>
                  )}

                  {link && (
                    <span className="card-badge">
                      <Link2 size={10} />
                      {link.isDrive ? "Drive" : link.label}
                    </span>
                  )}

                  {/* Demanda arquivada é justamente onde se procura arte
                      antiga: dizer que ela já tem entrega poupa abrir
                      o card para descobrir. */}
                  {card.deliveryUrl && (
                    <span className="card-badge" style={{ color: "var(--primary)", fontWeight: 600 }} title="Esta demanda já tem entrega registrada">
                      <PackageCheck size={10} />
                      entrega
                    </span>
                  )}

                  {anexos.length > 0 && (
                    <span className="card-badge">
                      <Paperclip size={10} />
                      {anexos.length}
                    </span>
                  )}

                  <span className="card-badge" style={{ color: PRIORITY_COLOR[priority], fontWeight: 600 }}>
                    {PRIORITY_LABEL[priority]}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy === card.id}
                title="Trazer de volta ao quadro"
                onClick={() => restaurar(card)}
                style={{ flexShrink: 0, padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              >
                <ArchiveRestore size={13} />
                Restaurar
              </button>
            </div>
          );
        })
      )}

      {cards.length >= 200 && (
        <span className="field-hint">
          Mostrando as 200 mais recentes.
        </span>
      )}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

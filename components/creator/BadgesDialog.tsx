"use client";

import React, { useState } from "react";
import { Clock } from "lucide-react";
import Modal from "@/components/Modal";
import { CARD_BADGES, PRIORITY_COLOR, PRIORITY_LABEL, type CardBadgeKey } from "@/lib/kanban";

/**
 * O que o card mostra na frente.
 *
 * Fica ao lado de "Campos" e "Etapas", e não em Configurações, pelo mesmo
 * motivo que aquelas duas: quem decide o que precisa ver no quadro é quem olha
 * o quadro todo dia, não quem administra a plataforma.
 *
 * As respostas do formulário continuam sendo marcadas uma a uma em "Campos" —
 * aqui ficam só os quatro atributos que todo card tem de nascença e que nenhum
 * campo pergunta. Duplicar a lista de campos aqui daria dois lugares para
 * responder à mesma pergunta, e eles discordariam.
 */
export default function BadgesDialog({
  open,
  onClose,
  boardId,
  badges,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  badges: CardBadgeKey[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * A escolha grava na hora, como as cores das etapas.
   *
   * O estado vem das propriedades e não de uma cópia local: o quadro recarrega
   * depois de cada gravação, e uma segunda fonte de verdade aqui dentro ficaria
   * para trás no dia em que a gravação falhasse — mostrando marcado o que o
   * banco recusou.
   */
  const toggle = async (key: CardBadgeKey) => {
    const next = badges.includes(key) ? badges.filter((b) => b !== key) : [...badges, key];

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: boardId, cardBadges: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar.");
        return;
      }
      onChanged();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  };

  /** O badge como ele sai no card — a prévia usa a mesma pílula, não uma imitação. */
  const preview = (key: CardBadgeKey) => {
    switch (key) {
      case "priority":
        return (
          <span
            className="card-badge"
            style={{
              color: PRIORITY_COLOR.ALTA,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {PRIORITY_LABEL.ALTA}
          </span>
        );
      case "dueDate":
        return (
          <span className="card-badge">
            <Clock size={10} />
            30/09
          </span>
        );
      case "assignee":
        return <span className="card-badge" style={{ fontWeight: 600, letterSpacing: "0.04em" }}>RM</span>;
      case "stage":
        return (
          <span className="card-badge">
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "var(--radius-pill)",
                background: "var(--info)",
                flexShrink: 0,
              }}
            />
            Em produção
          </span>
        );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mini-badges do card"
      description="O que cada card mostra direto na etapa, sem precisar ser aberto."
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {CARD_BADGES.map((badge) => (
        <div
          key={badge.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.6rem 0.75rem",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>{badge.label}</span>
              {preview(badge.key)}
            </span>
            <span className="field-hint">{badge.hint}</span>
          </div>

          <button
            type="button"
            className="btn btn-toggle"
            aria-pressed={badges.includes(badge.key)}
            disabled={busy}
            style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)", flexShrink: 0 }}
            onClick={() => toggle(badge.key)}
          >
            {badges.includes(badge.key) ? "No card" : "Oculto"}
          </button>
        </div>
      ))}

      <span className="field-hint">
        As respostas do formulário aparecem no card pelo botão <strong>Campos</strong>, uma a uma.
      </span>

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

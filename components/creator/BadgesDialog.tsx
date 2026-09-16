"use client";

import React, { useState } from "react";
import { Clock, Link2, Paperclip } from "lucide-react";
import Modal from "@/components/Modal";
import CardLabelChip from "./CardLabelChip";
import { type FieldDefinition } from "./FieldInput";
import { useRascunho } from "./useRascunho";
import {
  CARD_BADGES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  type CardBadgeKey,
} from "@/lib/kanban";

/**
 * O que o card mostra na frente — tudo, num lugar só.
 *
 * Antes a resposta estava repartida em três: os atributos de nascença aqui, as
 * respostas do formulário na tela de campos, e briefing, peças de copy, link e
 * anexos em lugar nenhum — eram decisão cravada no componente do quadro. Quem
 * quisesse enxugar o card precisava saber qual das três mandava em quê, e a
 * terceira não mandava: era código.
 *
 * São duas origens de dado, e por isso duas listas — mas uma tela só, porque a
 * pergunta de quem abre esta janela é uma só: o que aparece no card?
 *
 * Fica ao lado de "Campos" e "Etapas", e não em Configurações, pelo mesmo
 * motivo que aquelas duas: quem decide o que precisa ver no quadro é quem olha
 * o quadro todo dia, não quem administra a plataforma.
 */
export default function BadgesDialog({
  open,
  onClose,
  boardId,
  badges,
  fields,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  badges: CardBadgeKey[];
  /** Os campos do formulário — cada um com o seu próprio `showOnCard`. */
  fields: FieldDefinition[];
  onChanged: () => void;
}) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, { badges, campos: fields });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gravar = async (url: string, body: object) => {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
    return data;
  };

  const toggleBadge = (key: CardBadgeKey) =>
    setDraft({
      ...draft,
      badges: draft.badges.includes(key)
        ? draft.badges.filter((b) => b !== key)
        : [...draft.badges, key],
    });

  /*
   * O campo continua guardando a resposta no PRÓPRIO `showOnCard` — o rascunho
   * é só o lugar onde a escolha espera o Salvar. Uma segunda chave para a mesma
   * pergunta acabaria discordando, e a tela de campos, que mostra "visível no
   * card" ao lado de cada um, passaria a mentir.
   */
  const toggleField = (field: FieldDefinition) =>
    setDraft({
      ...draft,
      campos: draft.campos.map((f) =>
        f.id === field.id ? { ...f, showOnCard: !f.showOnCard } : f
      ),
    });

  /**
   * Um PUT para o quadro, se os badges mudaram, e um por campo alterado.
   *
   * São dois destinos porque são dois donos do dado — o quadro guarda o que ele
   * mesmo mostra, o campo guarda a própria visibilidade —, mas uma pergunta só
   * para quem está olhando, e por isso um botão só.
   */
  const salvar = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      if (JSON.stringify(draft.badges) !== JSON.stringify(badges)) {
        await gravar("/api/creator/boards", { id: boardId, cardBadges: draft.badges });
      }

      for (const campo of draft.campos) {
        const original = fields.find((f) => f.id === campo.id);
        if (original && original.showOnCard !== campo.showOnCard) {
          await gravar("/api/creator/fields", { id: campo.id, showOnCard: campo.showOnCard });
        }
      }

      adotar(draft);
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Fechar com alteração pendente avisa — é o que o clique fora da janela faz. */
  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas na exibição do card. Fechar e perdê-las?")) return;
    onClose();
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
      case "labels":
        return (
          <CardLabelChip
            label={{ id: "x", name: "Vídeo", color: "var(--info)", fieldKey: "formato", match: ["video"] }}
          />
        );
      case "briefing":
        return (
          <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)" }}>
            Produto: iPhone 17 · Público: …
          </span>
        );
      case "pieces":
        return (
          <span
            className="card-badge"
            style={{
              fontWeight: 600,
              background: "var(--primary-glow)",
              color: "var(--primary)",
              border: "none",
            }}
          >
            12×
          </span>
        );
      case "link":
        return (
          <span
            className="card-badge"
            style={{
              fontWeight: 600,
              color: "#4285F4",
              borderColor: "rgba(66,133,244,0.38)",
              background: "rgba(66,133,244,0.12)",
            }}
          >
            <Link2 size={10} />
            Drive
          </span>
        );
      case "attachments":
        return (
          <span className="card-badge">
            <Paperclip size={10} />2
          </span>
        );
    }
  };

  const linha = (
    titulo: string,
    dica: string,
    amostra: React.ReactNode,
    ligado: boolean,
    alternar: () => void
  ) => (
    <div
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
          <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>{titulo}</span>
          {amostra}
        </span>
        <span className="field-hint">{dica}</span>
      </div>

      <button
        type="button"
        className="btn btn-toggle"
        aria-pressed={ligado}
        disabled={busy}
        style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)", flexShrink: 0 }}
        onClick={alternar}
      >
        {ligado ? "No card" : "Oculto"}
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="O que o card mostra"
      description="Tudo o que pode aparecer na frente do card, sem precisar abri-lo — o que o card já traz e o que a demanda respondeu."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={fechar} disabled={busy}>
            {sujo ? "Cancelar" : "Fechar"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (await salvar()) onClose();
            }}
            disabled={busy || !sujo}
            title={sujo ? "Gravar as alterações" : "Nada alterado"}
          >
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      <span className="field-label">Do card</span>

      {CARD_BADGES.map((badge) =>
        <React.Fragment key={badge.key}>
          {linha(badge.label, badge.hint, preview(badge.key), draft.badges.includes(badge.key), () =>
            toggleBadge(badge.key)
          )}
        </React.Fragment>
      )}

      <span className="field-label" style={{ marginTop: "0.4rem" }}>
        Do formulário
      </span>

      {draft.campos.length === 0 ? (
        <span className="field-hint">
          Este quadro ainda não tem campos. Crie um em <strong>Campos</strong>.
        </span>
      ) : (
        draft.campos.map((field) =>
          <React.Fragment key={field.id}>
            {linha(
              field.label,
              /*
               * A dica diz o que a pessoa escreveu ali, quando o campo tem uma
               * — é o que distingue dois campos de nome parecido na hora de
               * decidir qual dos dois merece espaço no card.
               */
              field.helpText || `A resposta de "${field.label}" na abertura da demanda.`,
              <span className="card-badge">{exemploDoCampo(field)}</span>,
              field.showOnCard,
              () => toggleField(field)
            )}
          </React.Fragment>
        )
      )}

      {sujo && (
        <span className="field-hint">
          Há alterações não salvas. Elas só vão ao quadro no <strong>Salvar alterações</strong>.
        </span>
      )}

      <span className="field-hint">
        As etiquetas coloridas — Vídeo, Feed, Stories — são configuradas em{" "}
        <strong>Etiquetas</strong>; aqui só se decide se elas aparecem.
      </span>

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

/** Uma resposta plausível do campo, para a prévia não ser um retângulo vazio. */
function exemploDoCampo(field: FieldDefinition): string {
  const primeira = (() => {
    if (!field.options) return null;
    try {
      const parsed = JSON.parse(field.options);
      if (Array.isArray(parsed)) return parsed[0] ? String(parsed[0]) : null;
      // Campo dependente: as opções vêm agrupadas pelo valor do campo pai.
      const grupos = Object.values(parsed as Record<string, unknown>);
      const primeiroGrupo = grupos.find(Array.isArray) as unknown[] | undefined;
      return primeiroGrupo?.[0] ? String(primeiroGrupo[0]) : null;
    } catch {
      return null;
    }
  })();

  if (primeira) return primeira;
  if (field.type === "DATE") return "30/09/2026";
  if (field.type === "URL") return "drive.google.com/…";
  if (field.type === "NUMBER") return "12";
  return field.placeholder || "texto respondido";
}

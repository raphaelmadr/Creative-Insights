"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import CardLabelChip from "./CardLabelChip";
import { LABEL_COLORS, DEFAULT_LABEL_COLOR, type CardLabel } from "@/lib/kanban";
import { type FieldDefinition } from "./FieldInput";
import { useRascunho } from "./useRascunho";

/**
 * As etiquetas do quadro.
 *
 * Uma etiqueta não é um texto que alguém digita no card: é uma regra sobre o
 * que a demanda já respondeu. Por isso a tela pergunta duas coisas — qual campo
 * observar e quais palavras acendem a etiqueta —, e não oferece um botão de
 * "marcar etiqueta" em card nenhum. Marcada à mão, ela envelheceria na primeira
 * vez que o formato mudasse e ninguém voltasse para corrigir; assim ela não tem
 * como discordar do briefing.
 *
 * Grava a lista inteira de uma vez, e não etiqueta por etiqueta como fazem as
 * fases: aqui não há linha no banco por etiqueta, há uma configuração só. E
 * como os campos são de texto, gravar a cada tecla mandaria uma requisição por
 * letra digitada.
 */
export default function LabelsDialog({
  open,
  onClose,
  boardId,
  labels,
  fields,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  labels: CardLabel[];
  fields: FieldDefinition[];
  onChanged: () => void;
}) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, labels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mexer = (id: string, mudanca: Partial<CardLabel>) =>
    setDraft((prev) => prev.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));

  /*
   * Campos de escolha só: uma etiqueta que observa um campo de texto livre
   * dependeria de quem escreveu ter usado exatamente a mesma palavra, e
   * acenderia por acaso. Os campos de lista têm vocabulário fechado, que é o
   * que torna a regra confiável.
   */
  const observaveis = fields.filter((f) => f.type === "SELECT" || f.type === "MULTISELECT");

  const adicionar = () =>
    setDraft((prev) => [
      ...prev,
      {
        id: `e${Date.now().toString(36)}`,
        name: "",
        color: DEFAULT_LABEL_COLOR,
        fieldKey: observaveis[0]?.key ?? "",
        match: [],
      },
    ]);

  /** Fechar com alteração pendente avisa — é o que o clique fora da janela faz. */
  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas nas etiquetas. Fechar e perdê-las?")) return;
    onClose();
  };

  const salvar = async () => {
    const incompleta = draft.find((l) => !l.name.trim() || !l.fieldKey || !l.match.length);
    if (incompleta) {
      setError(
        `A etiqueta "${incompleta.name.trim() || "sem nome"}" está incompleta: precisa de nome, campo e ao menos uma palavra.`
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: boardId, cardLabels: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar.");
        return;
      }
      adotar(draft);
      onChanged();
      onClose();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Etiquetas do card"
      description="Cada etiqueta acende sozinha, a partir do que a demanda respondeu — ninguém precisa marcá-la."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={fechar} disabled={busy}>
            {sujo ? "Cancelar" : "Fechar"}
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={busy || !sujo}>
            {busy ? "Salvando…" : "Salvar etiquetas"}
          </button>
        </>
      }
    >
      {observaveis.length === 0 && (
        <span className="field-hint">
          Este quadro ainda não tem campo de escolha. Crie um em <strong>Campos</strong> — uma
          etiqueta precisa de uma lista de opções para observar.
        </span>
      )}

      {draft.map((label) => (
        <div
          key={label.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            padding: "0.7rem 0.75rem",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              className="field-input"
              value={label.name}
              placeholder="Nome da etiqueta"
              style={{ flex: 1, minWidth: 0 }}
              onChange={(e) => mexer(label.id, { name: e.target.value })}
            />
            {label.name.trim() && <CardLabelChip label={label} />}
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              title="Remover etiqueta"
              onClick={() => setDraft((prev) => prev.filter((l) => l.id !== label.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {LABEL_COLORS.map((c) => (
              <button
                key={c.token}
                type="button"
                className="btn btn-toggle"
                aria-pressed={label.color === c.token}
                title={c.label}
                style={{ padding: "0.3rem 0.6rem", fontSize: "var(--text-caption)" }}
                onClick={() => mexer(label.id, { color: c.token })}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "var(--radius-pill)",
                    background: c.token,
                    display: "inline-block",
                  }}
                />
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <label className="field" style={{ flex: "1 1 150px", minWidth: 0 }}>
              <span className="field-label">Quando o campo</span>
              <select
                className="field-input"
                value={label.fieldKey}
                onChange={(e) => mexer(label.id, { fieldKey: e.target.value })}
              >
                {observaveis.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ flex: "2 1 220px", minWidth: 0 }}>
              <span className="field-label">contiver</span>
              <input
                className="field-input"
                value={label.match.join(", ")}
                placeholder="video, youtube"
                onChange={(e) =>
                  mexer(label.id, {
                    match: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
              <span className="field-hint">
                Separadas por vírgula. Basta uma delas aparecer na resposta — sem
                distinguir maiúsculas nem acentos, então <strong>video</strong> acha
                “Vídeo 9:16”.
              </span>
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={adicionar}
        disabled={observaveis.length === 0}
      >
        <Plus size={15} />
        Nova etiqueta
      </button>

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

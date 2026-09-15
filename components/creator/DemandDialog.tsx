"use client";

import React, { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import FieldInput, { type FieldDefinition } from "./FieldInput";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/kanban";

export interface CreatorOption {
  acronym: string;
  name: string;
  /** Vem da conta Google do criador, quando ele tem uma. Ver `Creator`. */
  avatarUrl?: string | null;
}

/**
 * O formulário de entrada de uma demanda.
 *
 * Metade dele é fixa — título, prazo, prioridade, responsável — e metade é
 * desenhada a partir dos campos do quadro. A parte fixa não vira campo
 * definível porque o próprio Kanban depende dela: é com prioridade e prazo que
 * o card se ordena e se destaca, e um quadro em que alguém apagou o campo
 * "prazo" perderia isso sem perceber.
 */
export default function DemandDialog({
  open,
  onClose,
  boardId,
  boardName,
  fields,
  creators,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  fields: FieldDefinition[];
  creators: CreatorOption[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIA");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada abertura começa limpa: sem isto, o rascunho abandonado de uma demanda
  // reaparece dentro da próxima, misturado ao que a pessoa está escrevendo.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("MEDIA");
    setDueDate("");
    setAssignee("");
    setValues({});
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!title.trim()) {
      setError("A demanda precisa de um título.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/creator/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          title,
          description,
          priority,
          dueDate: dueDate || null,
          assigneeAcronym: assignee || null,
          values,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Não foi possível abrir a demanda.");
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Falha de conexão ao abrir a demanda.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova demanda"
      description={`Entra no quadro "${boardName}".`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Enviando…" : "Abrir demanda"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="demanda-titulo">
          Título <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
        </label>
        <input
          id="demanda-titulo"
          className="field-input"
          value={title}
          placeholder="Ex.: Criativo de Black Friday para retargeting"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="demanda-descricao">
          Contexto
        </label>
        <textarea
          id="demanda-descricao"
          className="field-input field-prose"
          value={description}
          placeholder="O que quem for produzir precisa saber antes de começar."
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <span className="field-label">Prioridade</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-toggle"
              aria-pressed={priority === p}
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.9rem" }}>
        <div className="field">
          <label className="field-label" htmlFor="demanda-prazo">
            Prazo
          </label>
          <input
            id="demanda-prazo"
            type="date"
            className="field-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="demanda-responsavel">
            Responsável
          </label>
          <select
            id="demanda-responsavel"
            className="field-input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">A definir</option>
            {creators.map((c) => (
              <option key={c.acronym} value={c.acronym}>
                {c.name} ({c.acronym})
              </option>
            ))}
          </select>
          <span className="field-hint">A mesma sigla que identifica o criador nos anúncios.</span>
        </div>
      </div>

      {fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={values[field.key]}
          onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
        />
      ))}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

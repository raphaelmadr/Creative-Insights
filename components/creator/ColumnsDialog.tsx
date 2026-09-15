"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";

export interface ColumnDefinition {
  id: string;
  name: string;
  color: string | null;
  isIntake: boolean;
  isDone: boolean;
  wipLimit: number | null;
  position: number;
}

/**
 * As etapas do quadro.
 *
 * Duas marcas importam e são exclusivas dentro do quadro: a coluna de
 * **entrada**, onde toda demanda nova aparece, e a de **entrega**, que carimba
 * a conclusão do card. Sem elas explícitas, a primeira e a última coluna
 * passariam a ter significado só pela posição — e reordenar o quadro mudaria,
 * sem aviso, onde as demandas caem.
 */

/** As cores possíveis para o topo de uma coluna — todas do design system. */
const COLORS = [
  { token: "var(--muted)", label: "Neutro" },
  { token: "var(--info)", label: "Azul" },
  { token: "var(--warning)", label: "Âmbar" },
  { token: "var(--success)", label: "Verde" },
  { token: "var(--danger)", label: "Vermelho" },
];

export default function ColumnsDialog({
  open,
  onClose,
  boardId,
  columns,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  columns: ColumnDefinition[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/columns", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar a coluna.");
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Etapas do quadro"
      description="As colunas por onde a demanda passa, na ordem."
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {columns.map((column) => (
        <div
          key={column.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            padding: "var(--pad-card)",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              aria-hidden="true"
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "var(--radius-pill)",
                background: column.color || "var(--muted)",
                flexShrink: 0,
              }}
            />
            <input
              className="field-input"
              style={{ flex: 1, minWidth: 0 }}
              defaultValue={column.name}
              aria-label={`Nome da etapa ${column.name}`}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== column.name) send("PUT", { id: column.id, name });
              }}
            />
            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${column.name}"`}
              aria-label={`Remover ${column.name}`}
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `Remover a etapa "${column.name}"?\n\nAs demandas que estão nela vão para a primeira etapa do quadro.`
                  )
                ) {
                  send("DELETE", { id: column.id });
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {COLORS.map((c) => (
              <button
                key={c.token}
                type="button"
                className="btn btn-toggle"
                aria-pressed={(column.color || "var(--muted)") === c.token}
                title={c.label}
                style={{ padding: "0.3rem 0.6rem", fontSize: "var(--text-caption)" }}
                onClick={() => send("PUT", { id: column.id, color: c.token })}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "var(--radius-pill)",
                    background: c.token,
                  }}
                />
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={column.isIntake}
              title="Toda demanda nova entra por esta etapa"
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => send("PUT", { id: column.id, isIntake: !column.isIntake })}
            >
              Entrada
            </button>

            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={column.isDone}
              title="Chegar aqui marca a demanda como entregue"
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => send("PUT", { id: column.id, isDone: !column.isDone })}
            >
              Entrega
            </button>

            <input
              type="number"
              min={0}
              className="field-input"
              style={{ width: "120px" }}
              placeholder="Limite"
              aria-label={`Limite de cards em ${column.name}`}
              defaultValue={column.wipLimit ?? ""}
              onBlur={(e) =>
                send("PUT", { id: column.id, wipLimit: e.target.value === "" ? null : e.target.value })
              }
            />
            <span className="field-hint">Limite de cards — em branco, sem limite.</span>
          </div>
        </div>
      ))}

      <div className="field">
        <label className="field-label" htmlFor="coluna-nova">
          Nova etapa
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            id="coluna-nova"
            className="field-input"
            style={{ flex: 1, minWidth: 0 }}
            value={newName}
            placeholder="Ex.: Aprovação do cliente"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !newName.trim()}
            onClick={async () => {
              if (await send("POST", { boardId, name: newName, color: "var(--muted)" })) {
                setNewName("");
              }
            }}
          >
            <Plus size={15} />
            Adicionar
          </button>
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

"use client";

import React, { useState } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import Modal from "@/components/Modal";
import { GROUP_COLORS, DEFAULT_GROUP_COLOR, type GroupDefinition } from "@/lib/kanban";

/**
 * As fases do quadro — os grupos de etapas.
 *
 * Mesma forma do editor de etapas — nome à esquerda, paleta abaixo, lixeira à
 * direita — porque é a mesma operação: uma lista curta de coisas que o time
 * define para si. Um segundo desenho para a mesma tarefa só faria quem já sabe
 * mexer em etapas ter de aprender de novo.
 *
 * Quais etapas entram em cada fase se decide no editor de etapas, e não aqui:
 * é lá que a pessoa está olhando a etapa quando a pergunta aparece.
 */
export default function GroupsDialog({
  open,
  onClose,
  boardId,
  groups,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  groups: GroupDefinition[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/groups", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar a fase.");
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
      title="Fases do quadro"
      description="Os blocos que agrupam as etapas — cada fase vira uma faixa colorida sobre as colunas dela."
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {groups.length === 0 && (
        <span className="field-hint">
          Nenhuma fase ainda. Sem fases, as etapas aparecem soltas, lado a lado.
        </span>
      )}

      {groups.map((group) => (
        <div
          key={group.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            padding: "var(--pad-card)",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            // A borda do bloco já mostra a cor da fase aplicada — é exatamente
            // o que vai aparecer na faixa, e não uma amostra ao lado dela.
            border: `1px solid ${group.color}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Layers size={15} style={{ color: group.color, flexShrink: 0 }} />
            <input
              className="field-input"
              style={{ flex: 1, minWidth: 0 }}
              defaultValue={group.name}
              aria-label={`Nome da fase ${group.name}`}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== group.name) send("PUT", { id: group.id, name });
              }}
            />
            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${group.name}"`}
              aria-label={`Remover ${group.name}`}
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `Remover a fase "${group.name}"?\n\nAs etapas dela continuam no quadro, apenas sem faixa.`
                  )
                ) {
                  send("DELETE", { id: group.id });
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {GROUP_COLORS.map((c) => (
              <button
                key={c.token}
                type="button"
                className="btn btn-toggle"
                aria-pressed={group.color === c.token}
                title={c.label}
                style={{ padding: "0.3rem 0.6rem", fontSize: "var(--text-caption)" }}
                onClick={() => send("PUT", { id: group.id, color: c.token })}
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
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="field-input"
          style={{ flex: 1, minWidth: 0 }}
          value={newName}
          placeholder="Nome da fase — ex.: Briefing, Produção, Entrega"
          aria-label="Nome da nova fase"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              if (await send("POST", { boardId, name: newName, color: DEFAULT_GROUP_COLOR })) {
                setNewName("");
              }
            }
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !newName.trim()}
          onClick={async () => {
            if (await send("POST", { boardId, name: newName, color: DEFAULT_GROUP_COLOR })) {
              setNewName("");
            }
          }}
        >
          <Plus size={15} />
          Criar fase
        </button>
      </div>

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

"use client";

import React, { useState } from "react";
import { Plus, Trash2, UserCheck, Users, Star } from "lucide-react";
import Modal from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { parseAssignees, type GroupDefinition } from "@/lib/kanban";
import type { CreatorOption } from "./DemandDialog";

export interface ColumnDefinition {
  id: string;
  name: string;
  color: string | null;
  /** O que acontece nesta etapa — aparece no topo da coluna. */
  description: string | null;
  /** A partir daqui o card precisa de dono. */
  requiresAssignee: boolean;
  /** JSON de siglas de quem responde por esta etapa. Ver `parseAssignees`. */
  assignees: string | null;
  /** Quem assume quando o card chega aqui. */
  defaultAssignee: string | null;
  /** A fase a que esta etapa pertence, ou nulo. */
  groupId: string | null;
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
  groups = [],
  creators = [],
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  columns: ColumnDefinition[];
  /** As fases do quadro, para dizer a que bloco cada etapa pertence. */
  groups?: GroupDefinition[];
  /** A equipe, para escolher quem responde por cada etapa. */
  creators?: CreatorOption[];
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
      {columns.map((column) => {
        const equipe = parseAssignees(column.assignees);
        const padrao = column.defaultAssignee?.toUpperCase() ?? null;

        return (
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

          {/*
            A descrição da etapa.

            Salva ao sair do campo, como o nome logo acima: um botão de salvar
            por etapa encheria o diálogo de botões, e o fluxo aqui é escrever,
            ver o resultado no quadro, ajustar.
          */}
          <textarea
            className="field-input field-prose"
            defaultValue={column.description ?? ""}
            placeholder="O que acontece nesta etapa? Quem faz, e o que precisa estar pronto para entrar aqui."
            aria-label={`Descrição da etapa ${column.name}`}
            style={{ minHeight: "56px" }}
            onBlur={(e) => {
              const description = e.target.value.trim();
              if (description !== (column.description ?? "")) {
                send("PUT", { id: column.id, description });
              }
            }}
          />

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

          {/*
            A fase a que a etapa pertence.

            A etapa vai para junto das irmãs de fase ao ser marcada — a faixa
            precisa de colunas vizinhas para existir, e ninguém deveria ter de
            reordenar o quadro à mão para consegui-la. Ver `groupColumns`.
          */}
          {groups.length > 0 && (
            <div className="field">
              <label className="field-label" htmlFor={`fase-${column.id}`}>
                Fase
              </label>
              <select
                id={`fase-${column.id}`}
                className="field-input"
                value={column.groupId ?? ""}
                // A cor da fase escolhida na própria caixa: sem ela, só se
                // descobre qual faixa é depois de fechar o diálogo.
                style={{ borderColor: groups.find((g) => g.id === column.groupId)?.color }}
                onChange={(e) => send("PUT", { id: column.id, groupId: e.target.value || null })}
              >
                <option value="">Sem fase</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/*
            Quem responde por esta etapa.

            Duas coisas num controle só: clicar no nome põe e tira a pessoa da
            equipe; clicar na estrela diz qual delas assume por padrão. Separar
            em duas listas — "quem pode" e "quem é o padrão" — obrigaria a
            manter as duas em dia, e a segunda sairia da primeira no primeiro
            dia em que alguém trocasse de time.
          */}
          {creators.length > 0 && (
            <div className="field">
              <label className="field-label">
                <Users size={13} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />
                Responsáveis desta etapa
              </label>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {creators.map((c) => {
                  const dentro = equipe.includes(c.acronym.toUpperCase());
                  const ehPadrao = dentro && padrao === c.acronym.toUpperCase();

                  return (
                    <span
                      key={c.acronym}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.15rem" }}
                    >
                      <button
                        type="button"
                        className="btn btn-toggle"
                        aria-pressed={dentro}
                        title={dentro ? `Tirar ${c.name} desta etapa` : `${c.name} responde por esta etapa`}
                        style={{ padding: "0.25rem 0.55rem", fontSize: "var(--text-caption)", gap: "0.35rem" }}
                        onClick={() => {
                          const proxima = dentro
                            ? equipe.filter((a) => a !== c.acronym.toUpperCase())
                            : [...equipe, c.acronym.toUpperCase()];
                          send("PUT", {
                            id: column.id,
                            assignees: proxima,
                            // Tirar da equipe quem era o padrão tira o padrão
                            // junto: o servidor recusaria a combinação, e o
                            // clique pareceria não ter pegado.
                            ...(ehPadrao ? { defaultAssignee: null } : {}),
                          });
                        }}
                      >
                        <Avatar name={c.name} src={c.avatarUrl} size="xs" />
                        {c.acronym}
                      </button>

                      {dentro && (
                        <button
                          type="button"
                          className="btn btn-icon"
                          aria-pressed={ehPadrao}
                          title={
                            ehPadrao
                              ? `${c.name} deixa de assumir por padrão`
                              : `${c.name} assume os cards que chegarem aqui`
                          }
                          style={{
                            width: "1.6rem",
                            height: "1.6rem",
                            padding: "0.2rem",
                            color: ehPadrao ? "var(--warning)" : "var(--muted)",
                          }}
                          onClick={() =>
                            send("PUT", {
                              id: column.id,
                              defaultAssignee: ehPadrao ? null : c.acronym,
                            })
                          }
                        >
                          <Star size={13} fill={ehPadrao ? "var(--warning)" : "none"} />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>

              <span className="field-hint">
                {equipe.length === 0
                  ? "Sem ninguém marcado, qualquer pessoa do quadro pode assumir."
                  : padrao
                    ? `O card que chegar aqui passa a ser de ${padrao}. Só estas pessoas aparecem no seletor de responsável.`
                    : "Só estas pessoas aparecem no seletor de responsável. Marque a estrela de quem assume por padrão."}
              </span>
            </div>
          )}

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

            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={column.requiresAssignee}
              title="Um card só entra nesta etapa com responsável definido"
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => send("PUT", { id: column.id, requiresAssignee: !column.requiresAssignee })}
            >
              <UserCheck size={13} />
              Exige responsável
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
        );
      })}

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

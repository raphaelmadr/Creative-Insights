"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import {  type GroupDefinition } from "@/lib/kanban";
import { useRascunho } from "./useRascunho";

export interface ColumnDefinition {
  id: string;
  name: string;
  color: string | null;
  /** O que acontece nesta etapa — aparece no topo da coluna. */
  description: string | null;
  /** A partir daqui o card precisa de dono. */
  /** JSON de siglas de quem responde por esta etapa. Ver `parseAssignees`. */
  /** Quem assume quando o card chega aqui. */
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
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  columns: ColumnDefinition[];
  /** As fases do quadro, para dizer a que bloco cada etapa pertence. */
  groups?: GroupDefinition[];
  onChanged: () => void;
}) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, columns);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    const res = await fetch("/api/creator/columns", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível salvar a coluna.");
    return data;
  };

  const mexer = (id: string, mudanca: Partial<ColumnDefinition>) =>
    setDraft(
      draft.map((c) => {
        if (c.id === id) return { ...c, ...mudanca };
        /*
         * Entrada é exclusiva no quadro — o servidor desmarca as demais ao
         * gravar. O rascunho faz o mesmo na hora, senão a tela mostraria duas
         * entradas marcadas até alguém salvar e descobrir qual das duas venceu.
         */
        return mudanca.isIntake === true ? { ...c, isIntake: false } : c;
      })
    );

  /** Um PUT por etapa alterada, com todas as edições dela juntas. */
  const salvar = async (): Promise<boolean> => {
    const alteradas = draft.filter((c) => {
      const original = columns.find((o) => o.id === c.id);
      return original && JSON.stringify(original) !== JSON.stringify(c);
    });

    if (alteradas.length === 0) return true;

    if (alteradas.some((c) => !c.name.trim())) {
      setError("Uma etapa não pode ficar sem nome.");
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      for (const c of alteradas) {
        await send("PUT", {
          id: c.id,
          name: c.name.trim(),
          description: c.description ?? "",
          color: c.color,
          groupId: c.groupId,
          isIntake: c.isIntake,
          isDone: c.isDone,
          wipLimit: c.wipLimit,
        });
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

  /*
   * Criar e remover mudam a estrutura e valem na hora — mas nunca por cima de
   * edição pendente. Gravar o que está em aberto ANTES é o que permite adotar a
   * lista nova em seguida sem declarar salvo algo que não foi.
   */
  const criar = async () => {
    const nome = newName.trim();
    if (!nome || !(await salvar())) return;

    setBusy(true);
    setError(null);
    try {
      const { column } = await send("POST", { boardId, name: nome, color: "var(--muted)" });
      adotar([...draft, column]);
      setNewName("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remover = async (column: ColumnDefinition) => {
    if (
      !confirm(
        `Remover a etapa "${column.name}"?\n\nAs demandas que estão nela vão para a primeira etapa do quadro.`
      )
    ) {
      return;
    }
    if (!(await salvar())) return;

    setBusy(true);
    setError(null);
    try {
      await send("DELETE", { id: column.id });
      adotar(draft.filter((c) => c.id !== column.id));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Fechar com alteração pendente avisa — é o que o clique fora da janela faz. */
  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas nas etapas. Fechar e perdê-las?")) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Etapas do quadro"
      description="As colunas por onde a demanda passa, na ordem."
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
      {draft.map((column) => {

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
              /*
                * Controlado pelo rascunho, e não `defaultValue` gravando no
                * `blur`: com o valor solto no DOM, sair da janela sem passar por
                * outro campo levava o texto junto.
                */
              value={column.name}
              aria-label={`Nome da etapa ${column.name}`}
              onChange={(e) => mexer(column.id, { name: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${column.name}"`}
              aria-label={`Remover ${column.name}`}
              disabled={busy}
              onClick={() => remover(column)}
            >
              <Trash2 size={15} />
            </button>
          </div>

          <textarea
            className="field-input field-prose"
            value={column.description ?? ""}
            placeholder="O que acontece nesta etapa? Quem faz, e o que precisa estar pronto para entrar aqui."
            aria-label={`Descrição da etapa ${column.name}`}
            style={{ minHeight: "56px" }}
            onChange={(e) => mexer(column.id, { description: e.target.value })}
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
                onClick={() => mexer(column.id, { color: c.token })}
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
                onChange={(e) => mexer(column.id, { groupId: e.target.value || null })}
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
            A equipe NÃO se define aqui — ela mora na fase, em "Fases".

            A fase é o time: "Produção" nomeia um conjunto de pessoas tanto
            quanto um trecho do fluxo, e repetir a mesma equipe em cada etapa
            dela era descrever três vezes o mesmo fato — e garantir que um dia
            as três divergissem. Ver `ownershipOf` em `lib/kanban.ts`.
          */}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={column.isIntake}
              title="Toda demanda nova entra por esta etapa"
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => mexer(column.id, { isIntake: !column.isIntake })}
            >
              Entrada
            </button>

            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={column.isDone}
              title="Chegar aqui marca a demanda como entregue"
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => mexer(column.id, { isDone: !column.isDone })}
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
              value={column.wipLimit ?? ""}
              onChange={(e) =>
                mexer(column.id, {
                  wipLimit: e.target.value === "" ? null : Number(e.target.value),
                })
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
            onClick={criar}
          >
            <Plus size={15} />
            Adicionar
          </button>
        </div>
      </div>

      {sujo && (
        <span className="field-hint">
          Há alterações não salvas. Elas só vão ao quadro no <strong>Salvar alterações</strong>.
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

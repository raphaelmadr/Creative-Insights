"use client";

import React, { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import Modal from "@/components/Modal";
import { type FieldDefinition } from "./FieldInput";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  FIELD_TYPES_WITH_OPTIONS,
  parseOptions,
  parseOptionsMap,
  type FieldType,
} from "@/lib/kanban";

/**
 * O editor dos campos do quadro.
 *
 * Fica no Kanban, não em Configurações: quem sabe o que precisa perguntar é
 * quem recebe as demandas, e essa pessoa não é necessariamente administradora
 * da plataforma. Mandá-la a outra tela para acrescentar "Formato" é atrito num
 * ajuste de dez segundos.
 */

interface Draft {
  label: string;
  type: FieldType;
  options: string;
  /** A chave do campo pai, ou "" para campo independente. */
  dependsOn: string;
  /** Com pai: as opções de cada valor dele, uma por linha. Ver `optionsFor`. */
  optionsByParent: Record<string, string>;
  placeholder: string;
  helpText: string;
  required: boolean;
  showOnCard: boolean;
}

const EMPTY: Draft = {
  label: "",
  type: "TEXT",
  options: "",
  dependsOn: "",
  optionsByParent: {},
  placeholder: "",
  helpText: "",
  required: false,
  showOnCard: false,
};

/** Um campo que pode ser pai de outro: escolha única, com opções próprias. */
interface ParentOption {
  key: string;
  label: string;
  values: string[];
}

/** As opções são digitadas uma por linha — mais simples de revisar que vírgulas. */
const splitOptions = (raw: string) =>
  raw
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

function DraftForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  parents,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
  parents: ParentOption[];
}) {
  const needsOptions = FIELD_TYPES_WITH_OPTIONS.includes(draft.type);
  const pai = parents.find((p) => p.key === draft.dependsOn) ?? null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "var(--pad-card)",
        borderRadius: "var(--radius-block)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--surface-sunken-border)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        <div className="field">
          <label className="field-label" htmlFor="campo-rotulo">
            Pergunta
          </label>
          <input
            id="campo-rotulo"
            className="field-input"
            value={draft.label}
            placeholder="Ex.: Formato da peça"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="campo-tipo">
            Tipo
          </label>
          <select
            id="campo-tipo"
            className="field-input"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {needsOptions && parents.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="campo-depende">
            Depende de
          </label>
          <select
            id="campo-depende"
            className="field-input"
            value={draft.dependsOn}
            onChange={(e) => setDraft({ ...draft, dependsOn: e.target.value })}
          >
            <option value="">Nada — as opções são sempre as mesmas</option>
            {parents.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Com um pai escolhido, este campo só oferece as opções do valor que a pessoa
            marcar lá — &quot;Formato&quot; mostra outra lista para cada canal.
          </span>
        </div>
      )}

      {needsOptions && !pai && (
        <div className="field">
          <label className="field-label" htmlFor="campo-opcoes">
            Opções
          </label>
          <textarea
            id="campo-opcoes"
            className="field-input field-prose"
            value={draft.options}
            placeholder={"Uma por linha:\nEstático 1:1\nVídeo 9:16"}
            onChange={(e) => setDraft({ ...draft, options: e.target.value })}
          />
          <span className="field-hint">Uma opção por linha.</span>
        </div>
      )}

      {/*
        Uma caixa por valor do pai, e não uma sintaxe dentro de uma caixa só.
        Os valores do pai já são conhecidos — pedir que sejam redigitados com
        algum separador seria inventar uma linguagem só para errá-la.
      */}
      {needsOptions && pai && (
        <div className="field">
          <label className="field-label">Opções por {pai.label.toLowerCase()}</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {pai.values.length === 0 && (
              <span className="field-hint">
                &quot;{pai.label}&quot; ainda não tem opções — cadastre-as primeiro.
              </span>
            )}
            {pai.values.map((valor) => (
              <div key={valor} className="field">
                <label className="field-label" htmlFor={`campo-opcoes-${valor}`}>
                  {valor}
                </label>
                <textarea
                  id={`campo-opcoes-${valor}`}
                  className="field-input field-prose"
                  value={draft.optionsByParent[valor] ?? ""}
                  placeholder={"Uma por linha"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      optionsByParent: { ...draft.optionsByParent, [valor]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <span className="field-hint">
            Valor sem nenhuma opção some do formulário em vez de abrir um seletor vazio.
          </span>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="campo-ajuda">
          Texto de ajuda
        </label>
        <input
          id="campo-ajuda"
          className="field-input"
          value={draft.helpText}
          placeholder="Aparece abaixo do campo, em cinza."
          onChange={(e) => setDraft({ ...draft, helpText: e.target.value })}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        <button
          type="button"
          className="btn btn-toggle"
          aria-pressed={draft.required}
          style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
          onClick={() => setDraft({ ...draft, required: !draft.required })}
        >
          Obrigatório
        </button>
        <button
          type="button"
          className="btn btn-toggle"
          aria-pressed={draft.showOnCard}
          style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
          onClick={() => setDraft({ ...draft, showOnCard: !draft.showOnCard })}
        >
          Mostrar na frente do card
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy}>
          <Check size={14} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function FieldsDialog({
  open,
  onClose,
  boardId,
  fields,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  fields: FieldDefinition[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/fields", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar o campo.");
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

  /*
   * Quem pode ser pai: os SELECT do quadro, menos o que está sendo editado.
   *
   * MULTISELECT fica de fora porque o valor precisa ser UM para servir de chave
   * no mapa — com várias marcas, não há uma lista a escolher.
   */
  const parents: ParentOption[] = fields
    .filter((f) => f.type === "SELECT" && f.id !== editingId)
    .map((f) => ({ key: f.key, label: f.label, values: parseOptions(f.options) }));

  const payload = () => ({
    label: draft.label,
    type: draft.type,
    dependsOn: draft.dependsOn || null,
    // A forma acompanha a dependência: lista sem pai, mapa com pai. É o mesmo
    // par que `normalizeOptions` espera do outro lado.
    options: draft.dependsOn
      ? Object.fromEntries(
          Object.entries(draft.optionsByParent).map(([valor, texto]) => [
            valor,
            splitOptions(texto),
          ])
        )
      : splitOptions(draft.options),
    placeholder: draft.placeholder,
    helpText: draft.helpText,
    required: draft.required,
    showOnCard: draft.showOnCard,
  });

  const create = async () => {
    if (!draft.label.trim()) {
      setError("A pergunta precisa de um nome.");
      return;
    }
    if (await send("POST", { boardId, ...payload() })) {
      setDraft(EMPTY);
      setAdding(false);
    }
  };

  const update = async () => {
    if (!editingId) return;
    if (await send("PUT", { id: editingId, ...payload() })) {
      setDraft(EMPTY);
      setEditingId(null);
    }
  };

  const startEdit = (field: FieldDefinition) => {
    setAdding(false);
    setEditingId(field.id);
    setError(null);
    setDraft({
      label: field.label,
      type: field.type as FieldType,
      options: field.dependsOn ? "" : parseOptions(field.options).join("\n"),
      dependsOn: field.dependsOn || "",
      optionsByParent: Object.fromEntries(
        Object.entries(parseOptionsMap(field.options)).map(([valor, lista]) => [
          valor,
          lista.join("\n"),
        ])
      ),
      placeholder: field.placeholder || "",
      helpText: field.helpText || "",
      required: field.required,
      showOnCard: field.showOnCard,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Campos do formulário"
      description="O que este quadro pergunta a quem abre uma demanda."
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {fields.length === 0 && !adding && (
        <span className="field-hint">
          Este quadro ainda não pergunta nada além do título e do prazo.
        </span>
      )}

      {fields.map((field) =>
        editingId === field.id ? (
          <DraftForm
            key={field.id}
            draft={draft}
            setDraft={setDraft}
            onSubmit={update}
            onCancel={() => {
              setEditingId(null);
              setDraft(EMPTY);
            }}
            submitLabel="Salvar campo"
            busy={busy}
            parents={parents}
          />
        ) : (
          <div
            key={field.id}
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
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
              <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>
                {field.label}
                {field.required && (
                  <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }} aria-hidden="true">
                    *
                  </span>
                )}
              </span>
              <span className="field-hint">
                {FIELD_TYPE_LABEL[field.type as FieldType] ?? field.type}
                {field.showOnCard ? " · visível no card" : ""}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "0.3rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => startEdit(field)}
            >
              Editar
            </button>

            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${field.label}"`}
              aria-label={`Remover ${field.label}`}
              disabled={busy}
              onClick={() => {
                /*
                 * As respostas já dadas continuam gravadas no card — ver a rota
                 * de campos. Dizer isso aqui evita a leitura de que remover a
                 * pergunta apaga o histórico de quem já respondeu.
                 */
                if (confirm(`Remover "${field.label}" do formulário?\n\nAs respostas já enviadas continuam guardadas nos cards.`)) {
                  send("DELETE", { id: field.id });
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )
      )}

      {adding ? (
        <DraftForm
          draft={draft}
          setDraft={setDraft}
          onSubmit={create}
          onCancel={() => {
            setAdding(false);
            setDraft(EMPTY);
          }}
          submitLabel="Criar campo"
          busy={busy}
          parents={parents}
        />
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setEditingId(null);
            setDraft(EMPTY);
            setError(null);
            setAdding(true);
          }}
        >
          <Plus size={15} />
          Novo campo
        </button>
      )}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

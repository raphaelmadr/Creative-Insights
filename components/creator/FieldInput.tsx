"use client";

import React from "react";
import { optionsFor, type FieldType } from "@/lib/kanban";
import DatePicker from "@/components/DatePicker";

/**
 * Um campo definível, desenhado.
 *
 * O quadro decide quais campos existem, então esta é a única peça que sabe
 * traduzir "tipo" em controle de formulário — e ela usa as classes do design
 * system (`.field`, `.field-label`, `.field-input`, `.field-hint`), nunca
 * estilo próprio. Um campo inventado aqui seria a única entrada da plataforma
 * que não se parece com as outras.
 */

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string | null;
  /** A chave do campo de que este depende — ver `optionsFor`. */
  dependsOn?: string | null;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  showOnCard: boolean;
  position: number;
}

export default function FieldInput({
  field,
  value,
  values = {},
  parentLabel,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  /**
   * Os demais valores do formulário.
   *
   * Um campo dependente precisa saber o que foi escolhido no pai para montar a
   * própria lista — "formato" só sabe o que oferecer depois de ler "canal".
   */
  values?: Record<string, unknown>;
  /** O RÓTULO do campo pai, para a dica falar como a tela e não como o banco. */
  parentLabel?: string;
  onChange: (value: unknown) => void;
}) {
  const options = optionsFor(field, values);
  const id = `campo-${field.key}`;

  /*
   * Campo dependente com o pai em branco: a lista está vazia por motivo, e
   * dizer qual é a diferença entre "escolha o canal primeiro" e um seletor
   * quebrado.
   */
  const esperandoPai = !!field.dependsOn && options.length === 0;

  const label = (
    <label className="field-label" htmlFor={id}>
      {field.label}
      {field.required && (
        <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }} aria-hidden="true">
          *
        </span>
      )}
    </label>
  );

  const hint = esperandoPai ? (
    <span className="field-hint">
      Escolha &quot;{parentLabel ?? field.dependsOn}&quot; primeiro — as opções daqui dependem dele.
    </span>
  ) : field.helpText ? (
    <span className="field-hint">{field.helpText}</span>
  ) : null;

  switch (field.type as FieldType) {
    case "TEXTAREA":
      return (
        <div className="field">
          {label}
          {/*
            `.field-input` sem `.field-textarea`: a variante de várias linhas do
            design system usa fonte de código, certa para prompt e JSON e errada
            para um briefing, que é texto corrido. `.field-prose` só acrescenta
            a altura mínima e a fonte do resto da interface.
          */}
          <textarea
            id={id}
            className="field-input field-prose"
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder || ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {hint}
        </div>
      );

    case "SELECT":
      return (
        <div className="field">
          {label}
          <select
            id={id}
            className="field-input"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Selecione…</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );

    case "MULTISELECT": {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field">
          {label}
          {/*
            Pílulas em vez de um `<select multiple>`: o nativo obriga a segurar
            Ctrl para marcar a segunda opção, não mostra o que está marcado sem
            rolar, e no celular vira uma lista de altura fixa. O alternador
            segmentado do design system já é o controle de "marque o que vale".
          */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {options.map((o) => {
              const active = chosen.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={active}
                  style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                  onClick={() =>
                    onChange(active ? chosen.filter((c) => c !== o) : [...chosen, o])
                  }
                >
                  {o}
                </button>
              );
            })}
          </div>
          {hint}
        </div>
      );
    }

    case "CHECKBOX":
      return (
        <div className="field">
          <label
            className="field-label"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
          >
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              style={{ accentColor: "var(--primary)", width: "16px", height: "16px" }}
            />
            {field.label}
            {field.required && (
              <span style={{ color: "var(--danger)" }} aria-hidden="true">
                *
              </span>
            )}
          </label>
          {hint}
        </div>
      );

    case "NUMBER":
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="number"
            className="field-input"
            value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
            placeholder={field.placeholder || ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {hint}
        </div>
      );

    case "DATE":
      return (
        <div className="field">
          {label}
          {/* Um campo de data qualquer do formulário pode ser passado ou
              futuro — aniversário de campanha, data de veiculação —, então aqui
              os atalhos de prazo ficam de fora. */}
          <DatePicker
            id={id}
            value={typeof value === "string" ? value.slice(0, 10) : ""}
            onChange={onChange}
            presets={false}
          />
          {hint}
        </div>
      );

    case "URL":
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="url"
            className="field-input"
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder || "https://"}
            onChange={(e) => onChange(e.target.value)}
          />
          {hint}
        </div>
      );

    default:
      return (
        <div className="field">
          {label}
          <input
            id={id}
            type="text"
            className="field-input"
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder || ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {hint}
        </div>
      );
  }
}

/** O valor de um campo em uma linha, para o card e para o painel de leitura. */
export function formatFieldValue(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";

  switch (field.type as FieldType) {
    case "CHECKBOX":
      return value === true ? "Sim" : "Não";
    case "MULTISELECT":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "DATE": {
      const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("pt-BR");
    }
    case "NUMBER":
      return Number(value).toLocaleString("pt-BR");
    default:
      return String(value);
  }
}

"use client";

import React, { useState } from "react";
import { Link2, ExternalLink, Check, X, Pencil } from "lucide-react";
import { describeCardLink, normalizeCardLink } from "@/lib/card-link";

/**
 * O link da demanda — a pasta do Drive com as artes.
 *
 * Não se parece com os outros campos de propósito. Os demais são perguntas de
 * briefing, respondidas uma vez e lidas depois; este é um destino, e o gesto que
 * importa nele é **abrir**, não editar. Por isso, com link salvo, ele deixa de
 * ser um campo de texto e vira um bloco com o azulejo da marca, o que o link é
 * ("Google Drive · pasta", lido do próprio endereço) e um botão de abrir em
 * primeiro plano — editar fica atrás de um lápis.
 *
 * O azulejo usa a cor da marca lavada com a borda cheia, como o `BrandIcon` das
 * integrações: legível nos dois temas sem precisar de variante por tema.
 */
const DRIVE = "#4285F4";

export default function CardLinkField({
  value,
  onSave,
  busy = false,
  id,
  label = "Link",
  hint,
}: {
  value: string | null;
  /** Recebe a URL normalizada, ou `null` quando o link é removido. */
  onSave: (url: string | null) => void;
  busy?: boolean;
  id?: string;
  label?: string;
  hint?: string;
}) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  const descricao = describeCardLink(value);
  const cor = descricao?.isDrive ? DRIVE : "var(--primary)";

  const salvar = () => {
    const texto = draft.trim();

    if (!texto) {
      onSave(null);
      setError(null);
      setEditing(false);
      return;
    }

    const limpo = normalizeCardLink(texto);
    if (!limpo) {
      setError("Esse endereço não parece um link. Cole a URL inteira, começando por https://");
      return;
    }

    setDraft(limpo);
    setError(null);
    setEditing(false);
    onSave(limpo);
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={id} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Link2 size={14} />
        {label}
      </label>

      {editing ? (
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
          <input
            id={id}
            className="field-input"
            value={draft}
            disabled={busy}
            placeholder="Cole o link da pasta do Google Drive"
            autoFocus={!!value}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                salvar();
              }
              if (e.key === "Escape") {
                setDraft(value ?? "");
                setError(null);
                setEditing(!value);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={salvar}
            title="Salvar o link"
            style={{ flexShrink: 0 }}
          >
            <Check size={14} />
            Salvar
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.6rem 0.7rem",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "34px",
              height: "34px",
              flexShrink: 0,
              borderRadius: "10px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: descricao?.isDrive ? "rgba(66,133,244,0.14)" : "var(--primary-glow)",
              border: `1px solid ${descricao?.isDrive ? "rgba(66,133,244,0.38)" : "var(--primary)"}`,
              color: cor,
            }}
          >
            <Link2 size={17} />
          </span>

          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <span style={{ fontSize: "var(--text-control)", fontWeight: 600, color: cor }}>
              {descricao?.label ?? "Link"}
              {descricao?.detail && (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {descricao.detail}</span>
              )}
            </span>
            <span
              className="field-hint"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={value ?? undefined}
            >
              {value}
            </span>
          </span>

          <a
            href={value ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            title="Abrir em uma aba nova"
            style={{ flexShrink: 0, padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
          >
            <ExternalLink size={13} />
            Abrir
          </a>

          <button
            type="button"
            className="btn btn-icon"
            title="Trocar o link"
            aria-label="Trocar o link"
            disabled={busy}
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
            style={{ flexShrink: 0 }}
          >
            <Pencil size={14} />
          </button>

          <button
            type="button"
            className="btn btn-icon"
            title="Remover o link"
            aria-label="Remover o link"
            disabled={busy}
            onClick={() => {
              setDraft("");
              onSave(null);
              setEditing(true);
            }}
            style={{ flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error ? (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}

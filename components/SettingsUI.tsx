"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { BrandIcon, brandOf, type BrandId } from "./BrandIcon";

/**
 * Os blocos das telas de configuração.
 *
 * As cinco páginas repetiam o mesmo `<h3>` com estilo inline, o mesmo `<label>`
 * com o mesmo objeto de estilo e a mesma pílula de status — cada uma com
 * pequenas divergências de tamanho e cor, porque foram escritas em momentos
 * diferentes. Quem mexe nisso todo mês encontrava cinco telas parecidas mas não
 * iguais, e nenhuma dizia onde obter a credencial que estava pedindo.
 */

export const FIELD_STYLE: React.CSSProperties = {
  padding: "0.7rem 0.8rem",
  borderRadius: "10px",
  border: "1px solid var(--card-border)",
  background: "var(--background-main)",
  color: "var(--foreground)",
  fontFamily: "monospace",
  fontSize: "0.86rem",
  width: "100%",
  boxSizing: "border-box",
};

/** "Configurada" / "Falta configurar", com a mesma forma em toda a área. */
export function StatusPill({ ok, okLabel = "Configurada", pendingLabel = "Falta configurar" }: {
  ok: boolean;
  okLabel?: string;
  pendingLabel?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
        fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap",
        color: ok ? "#16a34a" : "#b45309",
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.14)",
        border: `1px solid ${ok ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
        borderRadius: "999px", padding: "0.18rem 0.55rem",
      }}
    >
      {ok ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
      {ok ? okLabel : pendingLabel}
    </span>
  );
}

/** O link para o passo a passo do próprio fornecedor. */
export function DocsLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
        fontSize: "0.76rem", fontWeight: 600, color: "var(--primary)",
        textDecoration: "none", whiteSpace: "nowrap",
      }}
    >
      {label}
      <ExternalLink size={12} />
    </a>
  );
}

/**
 * Uma seção de configuração.
 *
 * O cabeçalho carrega a marca, o nome, o estado e o link do passo a passo — as
 * quatro coisas que alguém precisa antes de tocar em qualquer campo.
 */
export function SettingsSection({
  brand,
  title,
  description,
  status,
  children,
  action,
}: {
  brand?: BrandId;
  title?: string;
  description?: string;
  status?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const info = brand ? brandOf(brand) : null;
  const heading = title ?? info?.label ?? "";

  return (
    <section
      style={{
        display: "flex", flexDirection: "column", gap: "1.1rem",
        padding: "1.35rem",
        borderRadius: "14px",
        border: "1px solid var(--card-border)",
        background: "var(--card-bg)",
        // Fita da cor da marca na esquerda: identifica a seção antes da leitura.
        borderLeft: info ? `4px solid ${info.color}` : "1px solid var(--card-border)",
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", flexWrap: "wrap" }}>
        {brand && <BrandIcon id={brand} />}

        <div style={{ flex: 1, minWidth: "12rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>{heading}</h3>
            {status !== undefined && <StatusPill ok={status} />}
          </div>

          {description && (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.55 }}>{description}</p>
          )}

          {info?.docsUrl && info.docsLabel && <DocsLink href={info.docsUrl} label={info.docsLabel} />}
        </div>

        {action}
      </header>

      {children}
    </section>
  );
}

/** Um campo de texto rotulado, com dica opcional embaixo. */
export function SettingsField({
  label,
  value,
  onChange,
  secret,
  placeholder,
  hint,
  mono = true,
  type,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  secret?: boolean;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.86rem", minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <input
        type={type ?? (secret ? "password" : "text")}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...FIELD_STYLE, fontFamily: mono ? FIELD_STYLE.fontFamily : "inherit" }}
      />
      {hint && (
        <span style={{ fontSize: "0.76rem", color: "var(--muted)", opacity: 0.85, lineHeight: 1.5 }}>{hint}</span>
      )}
    </label>
  );
}

/** Duas colunas que viram uma em tela estreita. */
export function FieldGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 1 ? "100%" : "15rem"}, 1fr))`,
        gap: "1.1rem",
      }}
    >
      {children}
    </div>
  );
}

/** O botão de salvar, igual em todas as telas. */
export function SaveButton({ saving, label = "Salvar alterações" }: { saving: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        background: "var(--primary)", color: "#fff", border: "none",
        padding: "0.6rem 1.35rem", borderRadius: "10px",
        fontWeight: 600, fontSize: "0.86rem",
        cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
        display: "inline-flex", alignItems: "center", gap: "0.5rem", whiteSpace: "nowrap",
      }}
    >
      {saving ? "Salvando..." : label}
    </button>
  );
}


/**
 * Um popup para detalhe que não precisa ficar na tela.
 *
 * O "Status das integrações" listava sete caixas abertas no topo da página —
 * informação de consulta, lida uma vez a cada tantas semanas, ocupando a
 * primeira dobra e empurrando para baixo os campos que a pessoa veio editar.
 * Some o número no resumo, o detalhe atrás de um clique.
 */
export function SettingsModal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative",
          display: "flex", flexDirection: "column",
          width: "100%", maxWidth: "34rem", maxHeight: "85vh",
          borderRadius: "16px", overflow: "hidden",
          // Tokens do tema: o popup vive num portal, fora da árvore da página.
          background: "var(--card-bg)",
          color: "var(--foreground)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <header
          style={{
            flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.3rem",
            padding: "1.1rem 3rem 0.9rem 1.2rem", borderBottom: "1px solid var(--card-border)",
          }}
        >
          <strong style={{ fontSize: "0.98rem" }}>{title}</strong>
          {description && (
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.55 }}>{description}</span>
          )}
        </header>

        {/* Só o conteúdo rola: o cabeçalho fica à vista numa lista longa. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 1.2rem" }}>{children}</div>

        <button
          type="button"
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar"
          style={{
            position: "absolute", top: "0.75rem", right: "0.75rem",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "28px", height: "28px", borderRadius: "100px",
            background: "var(--background-main)", border: "1px solid var(--card-border)",
            color: "var(--foreground)", cursor: "pointer",
          }}
        >
          <X size={15} />
        </button>
      </div>
    </div>,
    document.body
  );
}

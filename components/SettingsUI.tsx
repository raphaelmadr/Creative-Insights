"use client";

import React, { createContext, useContext, useState } from "react";
import Modal from "./Modal";
import { ExternalLink, Settings2, ShieldAlert, ShieldCheck } from "lucide-react";
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
  fontSize: "var(--text-control)",
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
        fontSize: "var(--text-eyebrow)", fontWeight: 700, whiteSpace: "nowrap",
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
        fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--primary)",
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
/**
 * Como gravar, para quem está dentro de um diálogo.
 *
 * As telas de configuração são um `<form>` só com um `submit` no rodapé. Os
 * campos passaram a viver em diálogos, que o React renderiza num portal — fora
 * do `<form>` —, então `type="submit"` não alcança mais o formulário. O
 * contexto leva a função de gravar até lá sem repeti-la nas oito seções.
 */
const SettingsSaveContext = createContext<{ save: () => void; saving: boolean } | null>(null);

export function SettingsSaveProvider({
  save, saving, children,
}: {
  save: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <SettingsSaveContext.Provider value={{ save, saving }}>
      {children}
    </SettingsSaveContext.Provider>
  );
}

export function SettingsSection({
  brand,
  title,
  description,
  status,
  children,
  action,
  inline = false,
}: {
  brand?: BrandId;
  title?: string;
  description?: string;
  status?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Para o raro bloco que não é formulário e deve ficar aberto na página. */
  inline?: boolean;
}) {
  const info = brand ? brandOf(brand) : null;
  const heading = title ?? info?.label ?? "";
  const [open, setOpen] = useState(false);
  const gravar = useContext(SettingsSaveContext);

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
            <h3 style={{ margin: 0, fontSize: "var(--text-cardtitle)", fontWeight: 700, color: "var(--foreground)" }}>{heading}</h3>
            {status !== undefined && <StatusPill ok={status} />}
          </div>

          {description && (
            <p style={{ margin: 0, fontSize: "var(--text-control)", color: "var(--muted)", lineHeight: 1.55 }}>{description}</p>
          )}

          {info?.docsUrl && info.docsLabel && <DocsLink href={info.docsUrl} label={info.docsLabel} />}
        </div>

        {action}

        {/* Regra do projeto: formulário abre por um botão, nunca fica aberto
            na página. Aqui o cartão apresenta a integração e o estado dela; as
            credenciais ficam atrás do "Configurar". */}
        {!inline && (
          <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary" style={{ alignSelf: "center" }}>
            <Settings2 size={15} />
            Configurar
          </button>
        )}
      </header>

      {inline && children}

      {!inline && (
        <Modal
          open={open}
          title={heading}
          description={description}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
                Fechar
              </button>
              {gravar && (
                <button type="button" onClick={gravar.save} disabled={gravar.saving} className="btn btn-primary">
                  {gravar.saving ? "Salvando..." : "Salvar alterações"}
                </button>
              )}
            </>
          }
        >
          {children}
        </Modal>
      )}
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
    <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "var(--text-control)", minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <input
        type={type ?? (secret ? "password" : "text")}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...FIELD_STYLE, fontFamily: mono ? FIELD_STYLE.fontFamily : "inherit" }}
      />
      {hint && (
        <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", opacity: 0.85, lineHeight: 1.5 }}>{hint}</span>
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
    <button type="submit" disabled={saving} className="btn btn-primary" >
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
/**
 * Apelido de `Modal`, mantido porque as telas de configuração já o chamavam
 * assim. Havia duas implementações de diálogo na plataforma — esta e a de
 * `components/Modal.tsx` — com tamanhos, sombras e botão de fechar diferentes.
 */
export function SettingsModal({
  title, description, onClose, children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal open title={title} description={description} onClose={onClose}>
      {children}
    </Modal>
  );
}

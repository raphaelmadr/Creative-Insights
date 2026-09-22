"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, X, Search } from "lucide-react";

/**
 * Caixa suspensa com busca.
 *
 * Existe porque as duas listas do gerador de copy não cabem num `<select>`: o
 * catálogo tem 82 produtos e a conta do Meta passa de 100 públicos, todos com
 * nomes longos e prefixados pela convenção da conta (`[SITE] [VIEW CONTENT -
 * IPHONE 17] [30D]`). Rolar cem linhas atrás de um nome é pior do que digitar
 * três letras.
 *
 * Nada de estilo próprio: o gatilho é um `.field-input` como qualquer outro
 * campo, o painel é um `.glass-panel` e os tokens de tipo e espaço são os do
 * sistema. Só a posição do painel é inline, porque é geometria, não estética.
 */

export interface SearchSelectOption {
  id: string;
  label: string;
  /** Segunda linha, em cinza — categoria, tamanho do público. */
  hint?: string;
  /** Valor alinhado à direita — preço, alcance. */
  trailing?: string;
  /** Texto extra considerado na busca e que não aparece na lista. */
  keywords?: string;
}

interface SearchSelectBase {
  options: SearchSelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  allowClear?: boolean;
}

/**
 * Os dois modos são tipos DIFERENTES, e não um `value` que aceita as duas
 * formas: quem usa a caixa em modo múltiplo recebe uma lista no `onChange`, e
 * quem usa em modo único recebe um id ou nulo. Com um tipo só, o compilador
 * deixaria passar um `value` de texto num campo múltiplo — e o defeito
 * apareceria em tela, como uma seleção que some a cada clique.
 */
type SearchSelectProps =
  | (SearchSelectBase & {
      multiple?: false;
      value: string | null;
      onChange: (id: string | null) => void;
    })
  | (SearchSelectBase & {
      multiple: true;
      value: string[];
      onChange: (ids: string[]) => void;
    });

export default function SearchSelect(props: SearchSelectProps) {
  const {
    options,
    placeholder = "Selecione…",
    emptyLabel = "Nenhum resultado.",
    disabled = false,
    loading = false,
    id,
    allowClear = true,
  } = props;

  const multiple = props.multiple === true;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  /** A seleção sempre como lista, para o corpo do componente ser um só. */
  const selecionados = useMemo(
    () => (props.multiple ? props.value : props.value ? [props.value] : []),
    [props.multiple, props.value]
  );

  const escolher = (optionId: string) => {
    if (props.multiple) {
      const atual = props.value;
      /* Alterna, e o painel FICA ABERTO: escolher cinco produtos reabrindo a
         caixa cinco vezes é o gesto que o modo múltiplo existe para evitar. */
      props.onChange(
        atual.includes(optionId) ? atual.filter((v) => v !== optionId) : [...atual, optionId]
      );
      return;
    }
    props.onChange(optionId);
    setOpen(false);
  };

  const limpar = () => {
    if (props.multiple) props.onChange([]);
    else props.onChange(null);
  };

  /** O que o gatilho mostra: o rótulo escolhido, ou todos, separados por vírgula. */
  const resumo = useMemo(() => {
    const rotulos = selecionados
      .map((v) => options.find((o) => o.id === v)?.label)
      .filter((l): l is string => !!l);
    return rotulos.length ? rotulos.join(", ") : null;
  }, [selecionados, options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;

    /*
     * Cada palavra da busca precisa aparecer em algum lugar do item, em qualquer
     * ordem. Com a frase inteira, "iphone 17" não encontraria "iPhone 17 Pro
     * Max 256GB" se houvesse qualquer palavra entre as duas — e é justamente
     * assim que os nomes de público desta conta são escritos.
     */
    const termos = q.split(/\s+/);
    return options.filter((o) => {
      const alvo = `${o.label} ${o.hint ?? ""} ${o.trailing ?? ""} ${o.keywords ?? ""}`.toLowerCase();
      return termos.every((t) => alvo.includes(t));
    });
  }, [options, query]);

  // Fecha ao clicar fora. Sem isto o painel fica aberto atrás do próximo campo
  // em que a pessoa clicar, cobrindo o formulário.
  useEffect(() => {
    if (!open) return;

    const aoClicar = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    searchBox.current?.focus();

    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [open]);

  return (
    <div ref={wrapper} style={{ position: "relative" }}>
      <button
        id={id}
        type="button"
        className="field-input"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          textAlign: "left",
          cursor: disabled || loading ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: resumo ? "var(--foreground)" : "var(--muted)",
          }}
        >
          {loading ? "Carregando…" : resumo ?? placeholder}
        </span>

        {resumo && allowClear && !loading && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar seleção"
            title="Limpar seleção"
            onClick={(e) => {
              e.stopPropagation();
              limpar();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                limpar();
              }
            }}
            style={{ display: "inline-flex", color: "var(--muted)", flexShrink: 0 }}
          >
            <X size={14} />
          </span>
        )}

        <ChevronDown size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
      </button>

      {open && (
        <div
          className="glass-panel"
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            maxHeight: "300px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 0.6rem",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            <Search size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
            <input
              ref={searchBox}
              value={query}
              placeholder="Buscar…"
              aria-label="Buscar na lista"
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--foreground)",
                fontFamily: "inherit",
                fontSize: "var(--text-control)",
              }}
            />
          </div>

          {multiple && selecionados.length > 0 && (
            <div
              style={{
                padding: "0.4rem 0.6rem",
                borderBottom: "1px solid var(--card-border)",
                fontSize: "var(--text-eyebrow)",
                color: "var(--muted)",
              }}
            >
              {selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"} — clique para
              tirar da lista
            </div>
          )}

          <div style={{ overflowY: "auto", padding: "0.25rem" }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "1rem 0.6rem",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: "var(--text-caption)",
                }}
              >
                {emptyLabel}
              </div>
            ) : (
              filtered.map((option) => {
                const active = selecionados.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => escolher(option.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.45rem 0.55rem",
                      borderRadius: "var(--radius-block)",
                      background: active ? "var(--primary-glow)" : "transparent",
                      color: "var(--foreground)",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                    onMouseOver={(e) => {
                      if (!active) e.currentTarget.style.background = "var(--surface-sunken)";
                    }}
                    onMouseOut={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                      <span
                        style={{
                          fontSize: "var(--text-control)",
                          fontWeight: active ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {option.label}
                      </span>
                      {option.hint && (
                        <span
                          style={{
                            fontSize: "var(--text-eyebrow)",
                            color: "var(--muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {option.hint}
                        </span>
                      )}
                    </span>

                    {option.trailing && (
                      <span
                        style={{
                          fontSize: "var(--text-caption)",
                          color: "var(--muted)",
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {option.trailing}
                      </span>
                    )}

                    {active && <Check size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

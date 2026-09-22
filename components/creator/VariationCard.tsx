"use client";

import React from "react";
import { Trash2, Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import type { CopyVariation } from "@/lib/copy-parse";
import { countWords } from "@/lib/copy-options";

/**
 * Uma variação de copy — no gerador, editável; no Kanban, só de leitura.
 *
 * Um componente só, e não dois, porque a consistência entre as duas telas
 * precisa ser estrutural. Com um cartão de edição no gerador e outro de leitura
 * no quadro, a primeira mudança de estilo faria os dois divergirem — é
 * exatamente o que aconteceu antes com os cartões de criativo, e o motivo de
 * `CreativeCardPrimitives` existir.
 *
 * O que muda entre os modos é o controle de cada campo (campo de formulário ou
 * texto) e o cabeçalho (nome editável ou botão de recolher). A moldura, o
 * espaçamento e o bloco de justificativa são os mesmos nos dois.
 */
export default function VariationCard({
  variation,
  index,
  onChange,
  onRemove,
  canRemove = false,
  readOnly = false,
  collapsible = false,
  open = true,
  onToggle,
  bodyLabel = "Corpo",
  bodyMaxWords,
}: {
  variation: CopyVariation;
  index: number;
  onChange?: (next: CopyVariation) => void;
  onRemove?: () => void;
  canRemove?: boolean;
  /** Leitura: o card do Kanban mostra a copy aprovada, não um formulário. */
  readOnly?: boolean;
  /** Recolhível: doze variações abertas são uma rolagem sem fim. */
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  /** Como o corpo se chama nesta peça — "Roteiro" num vídeo. */
  bodyLabel?: string;
  /**
   * O teto de palavras pedido ao modelo.
   *
   * Existe para o limite ser VERIFICÁVEL. Instruir o modelo e torcer é como o
   * teto anterior se perdia: ninguém contava, ninguém sabia se tinha sido
   * respeitado, e a decisão de encurtar caía na equipe criativa sem aviso.
   */
  bodyMaxWords?: number;
}) {
  const set = (campo: keyof CopyVariation, valor: string) =>
    onChange?.({ ...variation, [campo]: valor });

  const expanded = collapsible ? open : true;

  const eyebrow: React.CSSProperties = {
    fontSize: "var(--text-eyebrow)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "var(--muted)",
  };

  /** Rótulo e valor de um campo, no modo leitura. */
  const readField = (label: string, value: string) =>
    value ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
        <span style={eyebrow}>{label}</span>
        <span style={{ fontSize: "var(--text-control)", lineHeight: 1.5 }}>{value}</span>
      </div>
    ) : null;

  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: expanded ? "0.6rem" : "0",
        padding: "var(--pad-card)",
        borderRadius: "var(--radius-block)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--surface-sunken-border)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
        {collapsible && (
          <button
            type="button"
            className="btn btn-icon"
            aria-expanded={expanded}
            aria-label={expanded ? `Recolher variação ${index + 1}` : `Expandir variação ${index + 1}`}
            onClick={onToggle}
            style={{ flexShrink: 0, width: "1.5rem", height: "1.5rem", padding: "0.15rem" }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}

        <span
          style={{
            fontSize: "var(--text-eyebrow)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--primary)",
            flexShrink: 0,
          }}
        >
          Variação {index + 1}
        </span>

        {readOnly ? (
          /*
           * Recolhido, o cabeçalho ainda diz do que se trata: ângulo e headline
           * numa linha. Uma fileira de "Variação 1, 2, 3" fechadas economizaria
           * espaço e obrigaria a abrir uma por uma para achar qualquer coisa —
           * o contrário do que recolher serve para fazer.
           */
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "var(--text-control)",
              color: expanded ? "var(--muted)" : "var(--foreground)",
            }}
            title={[variation.angle, variation.headline].filter(Boolean).join(" · ")}
          >
            {variation.angle && (
              <span style={{ color: "var(--muted)" }}>{variation.angle}</span>
            )}
            {variation.angle && variation.headline && !expanded && (
              <span style={{ color: "var(--muted)" }}> · </span>
            )}
            {!expanded && variation.headline}
          </span>
        ) : (
          <input
            className="field-input"
            value={variation.angle}
            placeholder="ângulo"
            aria-label={`Ângulo da variação ${index + 1}`}
            onChange={(e) => set("angle", e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "0.2rem 0.45rem",
              fontSize: "var(--text-caption)",
              background: "transparent",
              borderColor: "transparent",
            }}
          />
        )}

        {/*
          Descartar é o gesto mais comum depois de ler doze variações, e sem ele
          a única saída seria apagar o texto campo por campo. O último card não
          se remove: uma tela de resultado sem nenhuma variação não teria como
          voltar a ter, a não ser gerando tudo de novo.
        */}
        {!readOnly && onRemove && (
          <button
            type="button"
            className="btn btn-icon"
            title={canRemove ? "Descartar esta variação" : "É a última variação"}
            aria-label={`Descartar variação ${index + 1}`}
            onClick={onRemove}
            disabled={!canRemove}
            style={{ flexShrink: 0 }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </header>

      {expanded && (
        <>
          {readOnly ? (
            <>
              {readField("Headline", variation.headline)}
              {readField(bodyLabel, variation.body)}
              {readField("CTA", variation.cta)}
            </>
          ) : (
            <>
              <div className="field">
                <label className="field-label" htmlFor={`headline-${variation.id}`}>
                  Headline
                </label>
                <input
                  id={`headline-${variation.id}`}
                  className="field-input"
                  value={variation.headline}
                  onChange={(e) => set("headline", e.target.value)}
                />
              </div>

              <div className="field">
                <label
                  className="field-label"
                  htmlFor={`corpo-${variation.id}`}
                  style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}
                >
                  <span>{bodyLabel}</span>
                  {bodyMaxWords !== undefined && (
                    <span
                      style={{
                        fontSize: "var(--text-eyebrow)",
                        fontWeight: 400,
                        color:
                          countWords(variation.body) > bodyMaxWords ? "var(--danger)" : "var(--muted)",
                      }}
                    >
                      {countWords(variation.body)} / {bodyMaxWords} palavras
                    </span>
                  )}
                </label>
                <textarea
                  id={`corpo-${variation.id}`}
                  className="field-input field-prose"
                  value={variation.body}
                  onChange={(e) => set("body", e.target.value)}
                  style={{ minHeight: bodyMaxWords && bodyMaxWords > 100 ? "180px" : "80px" }}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor={`cta-${variation.id}`}>
                  CTA
                </label>
                <input
                  id={`cta-${variation.id}`}
                  className="field-input"
                  value={variation.cta}
                  onChange={(e) => set("cta", e.target.value)}
                />
              </div>
            </>
          )}

          {variation.rationale && (
            <div
              style={{
                display: "flex",
                gap: "0.45rem",
                alignItems: "flex-start",
                padding: "0.55rem 0.65rem",
                borderRadius: "var(--radius-block)",
                // Um degrau acima do fundo do card: o bloco precisa se ler como
                // anotação sobre a copy, não como mais um campo dela.
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
              }}
            >
              <Lightbulb size={13} style={{ color: "var(--warning)", flexShrink: 0, marginTop: "2px" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: 0 }}>
                <span style={eyebrow}>Por que deve funcionar</span>
                <span style={{ fontSize: "var(--text-caption)", lineHeight: 1.5, color: "var(--muted)" }}>
                  {variation.rationale}
                </span>
              </span>
            </div>
          )}
        </>
      )}
    </article>
  );
}

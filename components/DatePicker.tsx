"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  MONTH_NAMES,
  WEEK_DAYS,
  formatDisplay,
  generateCalendarGrid,
  parseDateInput,
  toDateInputValue,
  todayUtcDay,
} from "@/lib/calendar";

/** A geometria do painel, usada para decidir se ele abre para baixo ou para cima. */
const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 390;

/**
 * O seletor de uma data só.
 *
 * Duas peças que já existiam, juntas: o gatilho é um `.field-input`, como no
 * `SearchSelect` — dentro de um formulário, um controle precisa parecer com os
 * campos ao lado dele —, e o mês é a mesma grade do `DateRangePicker` do painel,
 * com os mesmos `.btn-day`, a mesma semana abreviada e a mesma navegação. Nada
 * de estilo novo: o que muda é a quantidade de datas, não o desenho delas.
 *
 * O que havia antes era `<input type="date">`, que cada navegador desenha de um
 * jeito — calendário do sistema no Chrome, três caixinhas no Firefox, nada
 * parecido com o resto da plataforma em nenhum dos dois.
 *
 * O calendário é desenhado num portal, preso ao gatilho por coordenadas fixas, e
 * não posicionado dentro do campo. Não é preciosismo: `.glass-panel` e
 * `.modal-panel` fecham em `overflow: hidden`, então um painel absoluto dentro
 * deles aparece **cortado** quando o campo está perto da borda de baixo — foi
 * exatamente o que aconteceu com a data de entrega do gerador de copy, no pé do
 * cartão de resultado. No portal ele também sobe sozinho quando não há espaço
 * embaixo, em vez de sair pela dobra da tela.
 */
export default function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Selecione a data…",
  min,
  disabled = false,
  presets = true,
}: {
  /** "AAAA-MM-DD", ou vazio. O mesmo formato do campo que ele substitui. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  /** Primeiro dia selecionável, também em "AAAA-MM-DD". */
  min?: string;
  disabled?: boolean;
  /** Os atalhos de prazo. Desligue quando a data não for futura. */
  presets?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  /** Onde o gatilho está na tela — o painel é preso a estas coordenadas. */
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number } | null>(null);

  const selected = useMemo(() => (value ? parseDateInput(value) : null), [value]);
  const hoje = useMemo(() => todayUtcDay(), []);
  const minimo = useMemo(() => (min ? parseDateInput(min) : null), [min]);

  const inicial = selected ?? hoje;
  const [viewYear, setViewYear] = useState(inicial.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(inicial.getUTCMonth());

  useEffect(() => {
    if (!open) return;

    // O painel vive no `body`, fora da árvore do campo: sem checá-lo também,
    // clicar num dia fecharia o calendário antes de a escolha ser registrada.
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (wrapper.current?.contains(alvo) || painel.current?.contains(alvo)) return;
      setOpen(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    /*
     * Coordenada fixa precisa ser recalculada quando a página rola — inclusive
     * quando quem rola é o corpo de um diálogo, e por isso o ouvinte é de
     * captura. Sem isso o calendário fica boiando longe do campo.
     */
    const reposicionar = () => {
      const r = wrapper.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.top, bottom: r.bottom, left: r.left });
    };

    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);

    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [open]);

  /*
   * Abrir no mês da data escolhida acontece no gesto de abrir, e não num efeito
   * de sincronia: com efeito, quem navegasse até outubro e fechasse o painel
   * sem escolher nada voltaria a outubro na próxima abertura, longe do prazo
   * que está gravado.
   */
  const abrir = () => {
    const base = selected ?? hoje;
    setViewYear(base.getUTCFullYear());
    setViewMonth(base.getUTCMonth());

    const r = wrapper.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.top, bottom: r.bottom, left: r.left });

    setOpen((v) => !v);
  };

  const mesAnterior = () => {
    setViewMonth((m) => (m === 0 ? 11 : m - 1));
    if (viewMonth === 0) setViewYear((y) => y - 1);
  };

  const proximoMes = () => {
    setViewMonth((m) => (m === 11 ? 0 : m + 1));
    if (viewMonth === 11) setViewYear((y) => y + 1);
  };

  const escolher = (date: Date) => {
    onChange(toDateInputValue(date));
    setOpen(false);
  };

  const emDias = (dias: number) => {
    const d = new Date(hoje.getTime() + dias * 86400000);
    escolher(d);
  };

  const grid = generateCalendarGrid(viewYear, viewMonth);

  return (
    <div ref={wrapper} style={{ position: "relative" }}>
      <button
        id={id}
        type="button"
        className="field-input"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={abrir}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <CalendarIcon size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selected ? "var(--foreground)" : "var(--muted)",
          }}
        >
          {selected ? formatDisplay(selected) : placeholder}
        </span>

        {selected && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar data"
            title="Limpar data"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }
            }}
            style={{ display: "inline-flex", color: "var(--muted)", flexShrink: 0 }}
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && anchor && createPortal(
        <div
          ref={painel}
          className="glass-panel"
          role="dialog"
          aria-label="Escolher data"
          style={{
            position: "fixed",
            /*
             * Abaixo do campo; acima quando não couber embaixo e houver mais
             * espaço em cima. `PANEL_HEIGHT` é a altura máxima do calendário com
             * os atalhos — medir o painel de verdade exigiria renderizá-lo antes
             * para depois movê-lo, e o salto apareceria na tela.
             */
            ...(anchor.bottom + PANEL_HEIGHT > window.innerHeight && anchor.top > PANEL_HEIGHT
              ? { top: Math.max(8, anchor.top - PANEL_HEIGHT - 4) }
              : { top: anchor.bottom + 4 }),
            left: Math.min(Math.max(8, anchor.left), Math.max(8, window.innerWidth - PANEL_WIDTH - 8)),
            zIndex: 9999,
            width: `min(${PANEL_WIDTH}px, calc(100vw - 16px))`,
            padding: "var(--pad-card)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          <header style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Mês anterior"
              onClick={mesAnterior}
              style={{ color: "var(--muted)" }}
            >
              <ChevronLeft size={16} />
            </button>
            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "var(--text-cardtitle)",
                fontWeight: 600,
              }}
            >
              {MONTH_NAMES[viewMonth]} de {viewYear}
            </span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Próximo mês"
              onClick={proximoMes}
              style={{ color: "var(--muted)" }}
            >
              <ChevronRight size={16} />
            </button>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
            {WEEK_DAYS.map((d, i) => (
              <div
                key={i}
                style={{
                  textAlign: "center",
                  fontSize: "var(--text-caption)",
                  color: "var(--muted)",
                  padding: "4px 0",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {grid.map((semana, si) => (
              <React.Fragment key={si}>
                {semana.map((date, di) => {
                  if (!date) return <div key={di} />;

                  const escolhida = !!selected && date.getTime() === selected.getTime();
                  const ehHoje = date.getTime() === hoje.getTime();
                  const bloqueada = !!minimo && date.getTime() < minimo.getTime();

                  return (
                    <div key={di} style={{ padding: "2px 0" }}>
                      <button
                        type="button"
                        className="btn btn-day"
                        aria-pressed={escolhida}
                        aria-label={formatDisplay(date)}
                        disabled={bloqueada}
                        onClick={() => escolher(date)}
                        // Hoje ganha o contorno, e não o preenchimento: o cheio
                        // é da data escolhida, e dois cheios na mesma grade
                        // fariam parecer que há duas seleções.
                        style={
                          ehHoje && !escolhida
                            ? { borderColor: "var(--primary)", color: "var(--primary)", fontWeight: 600 }
                            : undefined
                        }
                      >
                        {date.getUTCDate()}
                      </button>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {presets && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid var(--card-border)",
              }}
            >
              {[
                { label: "Hoje", dias: 0 },
                { label: "Amanhã", dias: 1 },
                { label: "3 dias", dias: 3 },
                { label: "1 semana", dias: 7 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => emDias(p.dias)}
                  style={{ padding: "0.3rem 0.6rem", fontSize: "var(--text-caption)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

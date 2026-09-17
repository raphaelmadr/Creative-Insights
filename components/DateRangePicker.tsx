"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
// A grade e as conversões de data moram em `lib/calendar.ts` — o seletor de
// data única do gerador de copy desenha o mesmo mês a partir delas.
import {
  MONTH_NAMES,
  WEEK_DAYS,
  formatDisplay,
  generateCalendarGrid,
  parseDateInput,
  toDateInputValue,
  todayUtcDay,
} from "@/lib/calendar";

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}

export default function DateRangePicker({ dateFrom, dateTo, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Parse external state
  const initialStart = dateFrom ? parseDateInput(dateFrom) : new Date();
  const initialEnd = dateTo ? parseDateInput(dateTo) : new Date();

  // Internal component state
  const [start, setStart] = useState<Date | null>(initialStart);
  const [end, setEnd] = useState<Date | null>(initialEnd);
  
  // The month currently being viewed on the left calendar
  const [viewYear, setViewYear] = useState(initialStart.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(initialStart.getUTCMonth());
  
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  /*
   * Hoje, no fuso do negócio — não no do navegador.
   *
   * Vem de `todayUtcDay()` porque a resposta precisa ser a MESMA para todo
   * mundo: com `new Date()` local, quem abrisse a tela de outro fuso veria
   * outro dia marcado, e depois das 21h em São Paulo o próprio horário de
   * Brasília já viraria o dia seguinte em UTC. Este componente carregava uma
   * segunda cópia dessa conversão dentro de `applyPreset`, e `app/page.tsx`
   * uma terceira; três lugares para a mesma pergunta é três lugares para ela
   * divergir.
   *
   * Calculado uma vez: a grade não precisa reagir à virada da meia-noite, e
   * recalcular a cada render só trocaria o dia debaixo do cursor de quem está
   * com o seletor aberto nesse instante.
   */
  const hoje = useMemo(() => todayUtcDay(), []);

  useEffect(() => {
    setStart(dateFrom ? parseDateInput(dateFrom) : new Date());
    setEnd(dateTo ? parseDateInput(dateTo) : new Date());
  }, [dateFrom, dateTo]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync view month when opening
  useEffect(() => {
    if (isOpen) {
      if (start) {
        setViewYear(start.getUTCFullYear());
        setViewMonth(start.getUTCMonth());
      }
    }
  }, [isOpen, start]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleDateClick = (date: Date) => {
    if (!start || (start && end)) {
      // Start new selection
      setStart(date);
      setEnd(null);
    } else {
      // Complete selection
      if (date < start) {
        setEnd(start);
        setStart(date);
      } else {
        setEnd(date);
      }
    }
  };

  const isSelected = (date: Date) => {
    if (!start && !end) return false;
    if (start && !end) return date.getTime() === start.getTime();
    if (start && end) {
      return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    }
    return false;
  };
  
  const isBoundary = (date: Date) => {
    return (start && date.getTime() === start.getTime()) || (end && date.getTime() === end.getTime());
  };

  const isInRangeHover = (date: Date) => {
    if (start && !end && hoverDate) {
      const min = Math.min(start.getTime(), hoverDate.getTime());
      const max = Math.max(start.getTime(), hoverDate.getTime());
      return date.getTime() > min && date.getTime() < max;
    }
    return false;
  };

  const applyPreset = (preset: string) => {
    const tUTC = hoje;
    let newStart = tUTC;
    let newEnd = tUTC;

    if (preset === "today") {
      newStart = tUTC;
      newEnd = tUTC;
    } else if (preset === "yesterday") {
      const y = new Date(tUTC.getTime() - 86400000);
      newStart = y;
      newEnd = y;
    } else if (preset === "7_days") {
      newStart = new Date(tUTC.getTime() - 7 * 86400000);
    } else if (preset === "15_days") {
      newStart = new Date(tUTC.getTime() - 15 * 86400000);
    } else if (preset === "this_month") {
      newStart = new Date(Date.UTC(tUTC.getUTCFullYear(), tUTC.getUTCMonth(), 1));
    } else if (preset === "last_month") {
      const prevMonth = tUTC.getUTCMonth() === 0 ? 11 : tUTC.getUTCMonth() - 1;
      const prevYear = tUTC.getUTCMonth() === 0 ? tUTC.getUTCFullYear() - 1 : tUTC.getUTCFullYear();
      newStart = new Date(Date.UTC(prevYear, prevMonth, 1));
      newEnd = new Date(Date.UTC(prevYear, prevMonth + 1, 0));
    } else if (preset === "all_time") {
      newStart = new Date(Date.UTC(2023, 0, 1)); // Arbitrary past date
    }

    setStart(newStart);
    setEnd(newEnd);
    setViewYear(newStart.getUTCFullYear());
    setViewMonth(newStart.getUTCMonth());
  };

  const handleApply = () => {
    if (start) {
      const finalEnd = end || start;
      onChange(toDateInputValue(start), toDateInputValue(finalEnd));
      setIsOpen(false);
    }
  };

  const renderCalendar = (y: number, m: number) => {
    const grid = generateCalendarGrid(y, m);
    return (
      <div style={{ flex: 1, minWidth: "250px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", fontWeight: 600, fontSize: "var(--text-cardtitle)" }}>
          {MONTH_NAMES[m]} de {y}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "0.5rem" }}>
          {WEEK_DAYS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: "var(--text-caption)", color: "var(--muted)", fontWeight: 400, padding: "4px 0" }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0px 0" }}>
          {grid.map((week, wI) => (
            <React.Fragment key={wI}>
              {week.map((date, dI) => {
                if (!date) return <div key={dI} />;
                const isSel = isSelected(date);
                const isHovRange = isInRangeHover(date);
                const isBound = isBoundary(date);
                const isStart = start && date.getTime() === start.getTime();
                const isEnd = end && date.getTime() === end.getTime();
                const isBoth = isStart && isEnd;
                
                // Styling logic for background glow connecting the dates
                let bgStyle = {};
                let borderRad = "0";
                
                if ((isSel || isHovRange) && !isBound) {
                  bgStyle = { background: "var(--primary-glow)", color: "var(--foreground)" };
                } else if (isBound) {
                  bgStyle = { background: "var(--primary-glow)" };
                  if (start && end) {
                    if (isStart) borderRad = "50% 0 0 50%";
                    else if (isEnd) borderRad = "0 50% 50% 0";
                    if (isBoth) borderRad = "50%"; 
                  } else if (start && !end && hoverDate) {
                    if (isStart && hoverDate > start) borderRad = "50% 0 0 50%";
                    else if (isStart && hoverDate < start) borderRad = "0 50% 50% 0";
                    else borderRad = "50%";
                  } else {
                    borderRad = "50%";
                    bgStyle = { background: "transparent" };
                  }
                }

                return (
                  <div key={dI} style={{ padding: "4px 0", position: "relative" }}>
                    {/* The highlight bar for ranges */}
                    {(isSel || isHovRange) && <div style={{ position: "absolute", top: "4px", bottom: "4px", left: 0, right: 0, ...bgStyle, borderRadius: borderRad, zIndex: 1 }} />}
                    
                    {/*
                      Hoje ganha o contorno, e não o preenchimento: o cheio é da
                      seleção, e dois cheios na mesma grade fariam parecer que
                      há duas escolhas. Mesmo idioma do seletor de data única
                      em `components/DatePicker.tsx`.

                      Some quando o dia já é limite do período: aí ele já está
                      destacado, e somar contorno a preenchimento só suja.
                    */}
                    <button
                      onClick={() => handleDateClick(date)}
                      onMouseEnter={() => setHoverDate(date)}
                      aria-pressed={!!isBound}
                      aria-current={date.getTime() === hoje.getTime() ? "date" : undefined}
                      className="btn btn-day"
                      style={
                        date.getTime() === hoje.getTime() && !isBound
                          ? { position: "relative", zIndex: 2, borderColor: "var(--primary)", color: "var(--primary)", fontWeight: 600 }
                          : { position: "relative", zIndex: 2 }
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
      </div>
    );
  };

  // Calculate the adjacent month
  const nextMonthViewMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const nextMonthViewYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  return (
    <div ref={wrapperRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger Button */}
      {/* `filter-control`, e não `.btn`: este gatilho vive na barra de filtros da
          home e precisa da geometria dos vizinhos. Como `.btn-secondary` ele
          herdava o raio de pílula e era o único redondo da fileira. */}
      <button onClick={() => setIsOpen(!isOpen)} className="filter-control" style={{ width: "270px" }} >
        <CalendarIcon size={16} style={{ opacity: 0.8 }} />
        <span style={{ flex: 1, textAlign: "left" }}>
          {dateFrom && dateTo ? `${formatDisplay(initialStart)} ~ ${formatDisplay(initialEnd)}` : "Selecionar período"}
        </span>
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="datePickerPopover">
          
          <div className="datePickerLayout">
            {/* Sidebar Presets */}
            <div className="datePickerPresets">
              {[
                { label: "Hoje", val: "today" },
                { label: "Ontem", val: "yesterday" },
                { label: "Últimos 7 dias", val: "7_days" },
                { label: "Últimos 15 dias", val: "15_days" },
                { label: "Este mês", val: "this_month" },
                { label: "Mês passado", val: "last_month" },
                { label: "Sempre", val: "all_time" }
              ].map(preset => (
                <button key={preset.val} onClick={() => applyPreset(preset.val)} className="btn btn-ghost" style={{ textAlign: "left", color: "var(--foreground)" }} onMouseOver={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--primary-glow)"} onMouseOut={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"} >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendars Area */}
            <div className="datePickerCalendars">
              
              {/* Prev Button */}
              <button onClick={handlePrevMonth} className="btn btn-icon" style={{ position: "absolute", left: "1.5rem", top: "1.5rem", color: "var(--muted)" }} >
                <ChevronLeft size={20} />
              </button>

              {/* Next Button */}
              <button onClick={handleNextMonth} className="btn btn-icon" style={{ position: "absolute", right: "1.5rem", top: "1.5rem", color: "var(--muted)" }} >
                <ChevronRight size={20} />
              </button>

              {renderCalendar(viewYear, viewMonth)}
              <div style={{ width: "1px", background: "var(--card-border)" }} />
              {renderCalendar(nextMonthViewYear, nextMonthViewMonth)}
            </div>
          </div>

          {/* Footer Area */}
          <div className="datePickerFooter">
            <div className="datePickerFooterInner" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <div style={{ padding: "0.4rem 0.75rem", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "6px", fontSize: "var(--text-control)", fontWeight: 600 }}>
                {start ? formatDisplay(start) : "DD/MM/YYYY"}
              </div>
              <span style={{ color: "var(--muted)" }}>-</span>
              <div style={{ padding: "0.4rem 0.75rem", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "6px", fontSize: "var(--text-control)", fontWeight: 600 }}>
                {end ? formatDisplay(end) : "DD/MM/YYYY"}
              </div>
            </div>
            
            <div className="datePickerFooterInner" style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setIsOpen(false)} className="btn btn-secondary" style={{ color: "var(--foreground)" }} >
                Cancelar
              </button>
              <button onClick={handleApply} disabled={!start} className="btn btn-primary" >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

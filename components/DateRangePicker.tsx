"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

// --- Date Utils ---
function toDateInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateInput(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDisplay(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function generateCalendarGrid(year: number, month: number) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
  
  const grid: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];
  
  // Padding for first week
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push(null);
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(Date.UTC(year, month, day)));
    if (currentWeek.length === 7) {
      grid.push(currentWeek);
      currentWeek = [];
    }
  }
  
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    grid.push(currentWeek);
  }
  
  return grid;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
const WEEK_DAYS = ["do", "se", "te", "qu", "qu", "se", "sá"];

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
    const now = new Date();
    const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const tUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", fontWeight: 600, fontSize: "0.95rem" }}>
          {MONTH_NAMES[m]} de {y}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "0.5rem" }}>
          {WEEK_DAYS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500, padding: "4px 0" }}>
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
                    
                    <button
                      onClick={() => handleDateClick(date)}
                      onMouseEnter={() => setHoverDate(date)}
                      style={{
                        position: "relative", zIndex: 2,
                        width: "32px", height: "32px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "50%",
                        fontSize: "0.85rem", fontWeight: isBound ? 600 : 500,
                        background: isBound ? "var(--primary)" : "transparent",
                        color: isBound ? "#fff" : "var(--foreground)",
                        cursor: "pointer", border: "none", outline: "none",
                        transition: "all 0.1s"
                      }}
                      onMouseOver={(e) => {
                        if (!isBound) (e.currentTarget as HTMLButtonElement).style.background = isSel || isHovRange ? "transparent" : "rgba(0,0,0,0.05)";
                      }}
                      onMouseOut={(e) => {
                        if (!isBound) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }}
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
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--card-bg)", padding: "0.4rem 0.75rem", 
          borderRadius: "8px", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)", whiteSpace: "nowrap", width: "270px",
          color: "var(--foreground)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer"
        }}
      >
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
                <button
                  key={preset.val}
                  onClick={() => applyPreset(preset.val)}
                  style={{
                    textAlign: "left", padding: "0.4rem 0.5rem", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 500,
                    background: "transparent", border: "none", cursor: "pointer", color: "var(--foreground)",
                    transition: "background 0.1s"
                  }}
                  onMouseOver={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--primary-glow)"}
                  onMouseOut={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendars Area */}
            <div className="datePickerCalendars">
              
              {/* Prev Button */}
              <button 
                onClick={handlePrevMonth}
                style={{ position: "absolute", left: "1.5rem", top: "1.5rem", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}
              >
                <ChevronLeft size={20} />
              </button>

              {/* Next Button */}
              <button 
                onClick={handleNextMonth}
                style={{ position: "absolute", right: "1.5rem", top: "1.5rem", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}
              >
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
              <div style={{ padding: "0.4rem 0.75rem", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                {start ? formatDisplay(start) : "DD/MM/YYYY"}
              </div>
              <span style={{ color: "var(--muted)" }}>-</span>
              <div style={{ padding: "0.4rem 0.75rem", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                {end ? formatDisplay(end) : "DD/MM/YYYY"}
              </div>
            </div>
            
            <div className="datePickerFooterInner" style={{ display: "flex", gap: "0.75rem" }}>
              <button 
                onClick={() => setIsOpen(false)}
                style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", color: "var(--foreground)" }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleApply}
                disabled={!start}
                style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "var(--primary)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", color: "#fff", opacity: (!start) ? 0.5 : 1 }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

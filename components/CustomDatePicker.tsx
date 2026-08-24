"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface CustomDatePickerProps {
  value: string; // Formato YYYY-MM-DD
  onChange: (date: string) => void;
  min?: string;
  max?: string;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function CustomDatePicker({ value, onChange, min, max }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // O calendário interno mantém o estado do mês sendo visualizado,
  // que pode ser diferente do mês selecionado
  const initialDate = value ? new Date(`${value}T00:00:00Z`) : new Date();
  const [viewMonth, setViewMonth] = useState(initialDate.getUTCMonth());
  const [viewYear, setViewYear] = useState(initialDate.getUTCFullYear());
  
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Fecha o calendário ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Atualiza posição do portal
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX
      });
      
      // Reseta a visualização para o mês selecionado ao abrir
      if (value) {
        const selected = new Date(`${value}T00:00:00Z`);
        setViewMonth(selected.getUTCMonth());
        setViewYear(selected.getUTCFullYear());
      }
    }
  }, [isOpen, value]);

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

  const handleDateSelect = (day: number) => {
    const d = new Date(Date.UTC(viewYear, viewMonth, day));
    onChange(d.toISOString().split("T")[0]);
    setIsOpen(false);
  };

  const getDaysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 1)).getUTCDay();

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const minDate = min ? new Date(`${min}T00:00:00Z`) : null;
  const maxDate = max ? new Date(`${max}T00:00:00Z`) : null;
  const selectedDate = value ? new Date(`${value}T00:00:00Z`) : null;

  // Renderiza dias em branco antes do início do mês
  const blanks = Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} style={{ padding: "0.4rem" }} />);
  
  // Renderiza os dias
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const currentDate = new Date(Date.UTC(viewYear, viewMonth, day));
    
    // Verifica limites
    const isDisabled = (minDate && currentDate < minDate) || (maxDate && currentDate > maxDate);
    
    // Verifica seleção
    const isSelected = selectedDate && 
                       currentDate.getUTCFullYear() === selectedDate.getUTCFullYear() && 
                       currentDate.getUTCMonth() === selectedDate.getUTCMonth() && 
                       currentDate.getUTCDate() === selectedDate.getUTCDate();
                       
    // Verifica hoje
    const today = new Date();
    const isToday = currentDate.getUTCFullYear() === today.getUTCFullYear() &&
                    currentDate.getUTCMonth() === today.getUTCMonth() &&
                    currentDate.getUTCDate() === today.getUTCDate();

    return (
      <button
        key={`day-${day}`}
        disabled={!!isDisabled}
        onClick={() => handleDateSelect(day)}
        style={{
          padding: "0.4rem",
          margin: "0.1rem",
          borderRadius: "8px",
          border: "none",
          background: isSelected ? "var(--primary)" : isToday ? "var(--card-border)" : "transparent",
          color: isSelected ? "#fff" : "var(--foreground)",
          opacity: isDisabled ? 0.3 : 1,
          cursor: isDisabled ? "not-allowed" : "pointer",
          fontWeight: isSelected || isToday ? 700 : 500,
          fontSize: "0.85rem",
          transition: "all 0.2s ease",
          boxShadow: isSelected ? "0 4px 10px rgba(16, 185, 129, 0.3)" : "none",
        }}
        onMouseOver={e => {
          if (!isDisabled && !isSelected) e.currentTarget.style.background = "var(--card-border)";
        }}
        onMouseOut={e => {
          if (!isDisabled && !isSelected) e.currentTarget.style.background = isToday ? "var(--card-border)" : "transparent";
        }}
      >
        {day}
      </button>
    );
  });

  const displayDate = selectedDate 
    ? `${selectedDate.getUTCDate().toString().padStart(2, '0')}/${(selectedDate.getUTCMonth() + 1).toString().padStart(2, '0')}/${selectedDate.getUTCFullYear()}`
    : "Selecione";

  const calendarPopover = isOpen && typeof document !== "undefined" ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: dropdownPos.top,
        left: dropdownPos.left,
        zIndex: 9999,
        background: "var(--card-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        padding: "1rem",
        boxShadow: "0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px var(--card-border)",
        width: "280px",
        animation: "fadeIn 0.2s ease-out"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <button 
          onClick={handlePrevMonth}
          style={{ background: "transparent", border: "none", color: "var(--foreground)", opacity: 0.7, cursor: "pointer", padding: "0.2rem", borderRadius: "4px" }}
          onMouseOver={e => e.currentTarget.style.opacity = "1"}
          onMouseOut={e => e.currentTarget.style.opacity = "0.7"}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--foreground)" }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button 
          onClick={handleNextMonth}
          style={{ background: "transparent", border: "none", color: "var(--foreground)", opacity: 0.7, cursor: "pointer", padding: "0.2rem", borderRadius: "4px" }}
          onMouseOver={e => e.currentTarget.style.opacity = "1"}
          onMouseOut={e => e.currentTarget.style.opacity = "0.7"}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: "0.5rem" }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--foreground)", opacity: 0.5 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }}>
        {blanks}
        {days}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          padding: "0.3rem 0.75rem", borderRadius: "100px",
          background: isOpen ? "var(--card-border)" : "transparent",
          color: "var(--foreground)", border: "1px solid var(--card-border)",
          fontSize: "0.8rem", outline: "none", cursor: "pointer",
          transition: "all 0.2s", fontWeight: 500, fontFamily: "inherit"
        }}
        onMouseOver={e => e.currentTarget.style.background = "var(--card-border)"}
        onMouseOut={e => { if (!isOpen) e.currentTarget.style.background = "transparent" }}
      >
        {displayDate}
        <Calendar size={14} style={{ opacity: 0.7 }} />
      </button>
      {calendarPopover}
    </>
  );
}

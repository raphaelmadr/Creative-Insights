"use client";

import React, { useState, useEffect } from "react";
import Datepicker from "react-tailwindcss-datepicker";

interface CustomDateRangePickerProps {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  onChange: (from: string, to: string) => void;
}

export default function CustomDateRangePicker({ dateFrom, dateTo, maxDate, onChange }: CustomDateRangePickerProps) {
  const [value, setValue] = useState({ 
    startDate: dateFrom || null,
    endDate: dateTo || null 
  });

  // Sync internal state if props change from outside
  useEffect(() => {
    setValue({ startDate: dateFrom, endDate: dateTo });
  }, [dateFrom, dateTo]);

  const handleValueChange = (newValue: any) => {
    setValue(newValue); 
    if (newValue && newValue.startDate && newValue.endDate) {
      onChange(newValue.startDate, newValue.endDate);
    }
  };

  return (
    <div style={{ width: "260px", fontFamily: "var(--font-sans), sans-serif" }}>
      <style>{`
        /* Minimalist overrides to fit the platform's glass UI */
        .react-tailwindcss-datepicker-container input {
          background: var(--card-bg) !important;
          color: var(--foreground) !important;
          border: 1px solid var(--card-border) !important;
          border-radius: 8px !important;
          box-shadow: var(--card-shadow) !important;
          font-family: inherit !important;
          font-weight: 600 !important;
          font-size: 0.85rem !important;
          padding: 0.5rem 0.8rem 0.5rem 2.5rem !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
        }
        .react-tailwindcss-datepicker-container input:hover {
          border-color: var(--primary) !important;
        }
        /* Make the calendar popover match MD2 / Platform look */
        .react-tailwindcss-datepicker-container > div > div.absolute {
          background: var(--card-bg) !important;
          border: 1px solid var(--card-border) !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15) !important;
          border-radius: 12px !important;
          z-index: 9999 !important;
        }
        .react-tailwindcss-datepicker-container .text-gray-900 {
          color: var(--foreground) !important;
        }
      `}</style>
      <Datepicker 
        primaryColor="emerald"
        value={value as any}
        onChange={handleValueChange}
        displayFormat={"DD/MM/YYYY"}
        i18n={"pt-br"}
        maxDate={maxDate ? new Date(maxDate) : undefined}
        separator="-"
        placeholder="Selecione o período"
        containerClassName="react-tailwindcss-datepicker-container relative w-full text-gray-900 dark:text-gray-100"
        popoverDirection="down"
      />
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export interface ToastItem {
  id: string;
  title: string;
  isNew: boolean;
  isError?: boolean;
}

interface ToastStackProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
  syncProgress?: number;
  isSyncingMeta?: boolean;
  syncMessage?: string;
}

const TOAST_TIMEOUT = 5000;

function ToastCard({ toast, index, isHovered, removeToast, syncProgress, isSyncingMeta, syncMessage, totalToasts }: any) {
  useEffect(() => {
    if (!isHovered) {
      const timer = setTimeout(() => {
        removeToast(toast.id);
      }, TOAST_TIMEOUT);
      return () => clearTimeout(timer);
    }
  }, [isHovered, toast.id, removeToast]);

  const yOffset = isHovered ? -(index * 60) : -(index * 14);
  const scale = isHovered ? 1 : 1 - index * 0.05;
  const opacity = isHovered ? 1 : index > 2 ? 0 : 1 - index * 0.2;

  // We show the spinner only on the top-most toast if it matches the current syncing title
  // But wait, the original code used global isSyncingMeta for the single toast.
  // We can just render the spinner if isSyncingMeta is true and this is the first toast.
  // However, the original code changed the toast title and showed the spinner.
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.8 }}
      animate={{ 
        opacity, 
        y: yOffset, 
        scale,
        zIndex: totalToasts - index
      }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        background: toast.isError ? "rgba(239, 68, 68, 0.9)" : toast.isNew ? "rgba(16, 185, 129, 0.8)" : "rgba(30, 30, 30, 0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "#fff",
        border: toast.isError ? "1px solid rgba(239, 68, 68, 0.4)" : toast.isNew ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(255, 255, 255, 0.15)",
        padding: "0.6rem 1rem",
        borderRadius: "2rem",
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "0.5rem",
        fontWeight: 500,
        transformOrigin: "bottom right",
        pointerEvents: "auto",
        minWidth: "max-content"
      }}
    >
      {(isSyncingMeta && index === 0 && toast.title.includes("Sincronizando")) ? (
        <>
          <div style={{ position: "relative", width: "16px", height: "16px", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" fill="none" />
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="62.83" strokeDashoffset={62.83 - (62.83 * (syncProgress || 0)) / 100} style={{ transition: "stroke-dashoffset 0.3s ease", strokeLinecap: "round" }} />
            </svg>
          </div>
          <span style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>{syncMessage || toast.title}</span>
        </>
      ) : (
        <span style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>{toast.title}</span>
      )}
      
      <button 
        onClick={() => removeToast(toast.id)}
        style={{ 
          background: 'transparent', border: 'none', color: '#fff', 
          cursor: 'pointer', opacity: 0.6, padding: '0.2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: '0.25rem', transition: 'opacity 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
        onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
        title="Fechar"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastStack({ toasts, removeToast, syncProgress, isSyncingMeta, syncMessage }: ToastStackProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        width: "350px", // A safe width to catch hover even when expanded
        height: isHovered ? `${Math.max(toasts.length, 1) * 60}px` : "60px",
        pointerEvents: toasts.length > 0 ? "auto" : "none"
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <AnimatePresence mode="popLayout">
          {toasts.map((toast, index) => (
            <ToastCard
              key={toast.id}
              toast={toast}
              index={index}
              isHovered={isHovered}
              removeToast={removeToast}
              syncProgress={syncProgress}
              isSyncingMeta={isSyncingMeta}
              syncMessage={syncMessage}
              totalToasts={toasts.length}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Play, X } from "lucide-react";
import SafeImage from "./SafeImage";

/**
 * Os primitivos visuais dos cartões de criativo.
 *
 * Moram fora do cartão da home porque a análise de similaridade passava a usar a
 * mesma linguagem — pílulas de métrica com o mesmo tom, os mesmos ícones de
 * canal, o mesmo formato de moeda. Duplicá-los faria as duas telas divergirem
 * na primeira mudança de estilo.
 */

export type MetricTone = "good" | "watch" | "bad" | "neutral";

export const TONE_STYLES: Record<MetricTone, { bg: string; border: string; text: string }> = {
  good: { bg: "rgba(39, 174, 96, 0.08)", border: "rgba(39, 174, 96, 0.15)", text: "var(--success)" },
  watch: { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.15)", text: "var(--warning)" },
  bad: { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.15)", text: "var(--danger)" },
  neutral: { bg: "rgba(128, 128, 128, 0.05)", border: "rgba(128, 128, 128, 0.15)", text: "var(--foreground)" },
};

export function MetricMiniCard({ label, value, tone, title }: { label: string; value: string; tone: MetricTone; title?: string }) {
  const c = TONE_STYLES[tone];
  return (
    <div
      title={title}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0.05rem",
        padding: "0.28rem 0.45rem",
        borderRadius: "8px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span style={{ fontSize: "0.56rem", lineHeight: 1.2, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <strong style={{ fontSize: "0.78rem", lineHeight: 1.25, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</strong>
    </div>
  );
}

export function formatCurrencyCompact(value: number): string {
  if (Number.isNaN(value)) return "R$ 0";
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

export function formatCurrencyFull(value: number): string {
  if (Number.isNaN(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const approvedValueTone = (val: number) => {
  if (val > 1000) return "good";
  if (val > 0) return "neutral";
  return "watch";
};

export const FbIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

export const TikTokIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);

export const InstaIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

export const MessengerIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.14 2 11.243c0 2.898 1.446 5.485 3.737 7.215v3.42l3.4-1.874c.915.253 1.878.384 2.863.384 5.523 0 10-4.14 10-9.243C22 6.14 17.523 2 12 2zm1.09 12.44-2.827-3.02-5.46 3.02 5.97-6.338 2.88 3.018 5.405-3.018-5.968 6.338z"/>
  </svg>
);

export const AudienceIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);


/**
 * A peça em tamanho grande, sobre a página.
 *
 * Vídeo e imagem passam pelo mesmo popup: no cartão a mídia é sempre uma
 * miniatura, e é aqui que ela ganha tamanho — o vídeo com controles, a imagem
 * inteira em `contain`. Antes o vídeo era um player embutido no cartão, de
 * 200px, que competia com o clique de abrir a peça e não dava para assistir.
 *
 * O quadro abraça a mídia (`inline-flex` mais o `max-height` da própria peça):
 * como bloco, sobrava moldura vazia dos lados das peças verticais. `children`
 * entra sobre a mídia, dentro do recorte arredondado, para cada tela pôr as
 * suas sobreposições.
 */
export function MediaLightbox({
  imageUrl,
  videoUrl,
  alt,
  onClose,
  children,
}: {
  imageUrl?: string | null;
  videoUrl?: string | null;
  alt: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Sem isto a página de trás rola sob o popup enquanto se olha a peça.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const mediaStyle: React.CSSProperties = {
    display: "block",
    maxWidth: "min(92vw, 900px)",
    maxHeight: "88vh",
    objectFit: "contain",
  };

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Criativo ${alt}`}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem"
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", display: "inline-flex", borderRadius: "16px", overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)", maxWidth: "min(92vw, 900px)", maxHeight: "88vh"
        }}
      >
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={imageUrl || ""}
            controls
            autoPlay
            preload="metadata"
            style={mediaStyle}
          />
        ) : (
          <SafeImage src={imageUrl || ""} alt={alt} style={mediaStyle} />
        )}

        {children}

        <button
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar"
          style={{
            position: "absolute", top: "10px", right: "10px", zIndex: 2,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "30px", height: "30px", borderRadius: "100px",
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)", cursor: "pointer"
          }}
        >
          <X size={15} />
        </button>
      </motion.div>
    </div>,
    document.body
  );
}

/** Selo de "é um vídeo" sobre a miniatura, com o convite de assistir. */
export function PlayBadge() {
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 5,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none"
      }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "44px", height: "44px", borderRadius: "100px",
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.28)", boxShadow: "0 4px 14px rgba(0,0,0,0.35)"
        }}
      >
        <Play size={18} color="#fff" fill="#fff" style={{ marginLeft: "2px" }} />
      </span>
    </div>
  );
}

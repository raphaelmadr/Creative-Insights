"use client";

import React from "react";
import { motion } from "framer-motion";
import { Avatar } from "./Avatar";
import SafeImage from "./SafeImage";
import styles from "./CreativeView.module.css";
import { Image as ImageIcon, Copy, Check, Sparkles, Loader2, ChevronDown } from "lucide-react";
import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        background: "transparent", border: "none", cursor: "pointer", opacity: 0.5,
        display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "2px",
        transition: "opacity 0.2s"
      }}
      onMouseOver={e => e.currentTarget.style.opacity = "1"}
      onMouseOut={e => e.currentTarget.style.opacity = "0.5"}
      title="Copiar nome do anúncio"
    >
      {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} color="var(--foreground)" />}
    </button>
  );
}

function CreativeHypothesis({ creative }: { creative: any }) {
  const [hypothesis, setHypothesis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAnalyze = () => {
    setLoading(true);
    fetch("/api/hypothesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creative)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) setHypothesis(data.hypothesis);
        else setHypothesis("Não foi possível gerar hipótese para este anúncio.");
        setLoading(false);
      })
      .catch(() => {
        setHypothesis("Erro ao conectar com a IA.");
        setLoading(false);
      });
  };

  if (!hypothesis && !loading) {
    return (
      <button 
        onClick={handleAnalyze}
        style={{ 
          position: "absolute", top: "10px", right: "10px", zIndex: 10,
          background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", 
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", 
          padding: "6px", transition: "all 0.2s" 
        }}
        title="Analisar criativo com IA"
        onMouseOver={e => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.4)"; e.currentTarget.style.color = "white"; }}
        onMouseOut={e => { e.currentTarget.style.background = "rgba(0,0,0,0.4)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
      >
        <Sparkles size={16} />
      </button>
    );
  }

  const MAX_LENGTH = 150;
  const isLong = hypothesis && hypothesis.length > MAX_LENGTH;
  const displayText = (hypothesis && !isExpanded && isLong) ? hypothesis.substring(0, MAX_LENGTH) + "..." : hypothesis;

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(16, 185, 129, 0.1)", borderRadius: "0.5rem", borderLeft: "3px solid #10b981" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", color: "#10b981", fontWeight: 600, fontSize: "0.8rem" }}>
        <Sparkles size={14} /> 
        AI Director Analysis
      </div>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.7, fontSize: "0.85rem" }}>
          <Loader2 size={14} className="spin" style={{ animation: "spin 2s linear infinite" }} />
          Analisando criativo...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.9, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>
            {displayText}
          </p>
          {isLong && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                background: "none", border: "none", color: "#10b981",
                fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer", padding: 0,
                textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem"
              }}
            >
              {isExpanded ? (
                <>Ver menos</>
              ) : (
                <>Ler mais <ChevronDown size={12} /></>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type MetricTone = "good" | "watch" | "bad" | "neutral";

const TONE_STYLES: Record<MetricTone, { bg: string; border: string; text: string }> = {
  good: { bg: "rgba(39, 174, 96, 0.08)", border: "rgba(39, 174, 96, 0.15)", text: "var(--success)" },
  watch: { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.15)", text: "var(--warning)" },
  bad: { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.15)", text: "var(--danger)" },
  neutral: { bg: "rgba(128, 128, 128, 0.05)", border: "rgba(128, 128, 128, 0.15)", text: "var(--foreground)" },
};

function MetricMiniCard({ label, value, tone, title }: { label: string; value: string; tone: MetricTone; title?: string }) {
  const c = TONE_STYLES[tone];
  return (
    <div
      title={title}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0.15rem",
        padding: "0.4rem 0.5rem",
        borderRadius: "8px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span style={{ fontSize: "0.6rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <strong style={{ fontSize: "0.8rem", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</strong>
    </div>
  );
}

function formatCurrencyCompact(value: number): string {
  if (Number.isNaN(value)) return "R$ 0";
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

function formatCurrencyFull(value: number): string {
  if (Number.isNaN(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const approvedValueTone = (val: number) => {
  if (val > 1000) return "good";
  if (val > 0) return "neutral";
  return "watch";
};

const FbIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

const TikTokIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);

const InstaIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const MessengerIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.14 2 11.243c0 2.898 1.446 5.485 3.737 7.215v3.42l3.4-1.874c.915.253 1.878.384 2.863.384 5.523 0 10-4.14 10-9.243C22 6.14 17.523 2 12 2zm1.09 12.44-2.827-3.02-5.46 3.02 5.97-6.338 2.88 3.018 5.405-3.018-5.968 6.338z"/>
  </svg>
);

const AudienceIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

interface CreativeCardProps {
  creative: any;
  creators: any[];
  hoveredPreview: any;
  setHoveredPreview: (val: any) => void;
  tier?: "super" | "winner";
}

export function CreativeCard({ creative, creators, hoveredPreview, setHoveredPreview, tier }: CreativeCardProps) {
  const isHovered = hoveredPreview?.cardId === creative.id;
  
  const creatorAcronym = (creative.designer || "").trim().toUpperCase();
  const matchingCreator = creators.find(c => {
    const acronyms = c.acronym.split(",").map((s: string) => s.trim().toUpperCase());
    return acronyms.includes(creatorAcronym);
  });
  
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } }}
      className={`glass-panel ${styles.card}`}
      style={{
        position: "relative",
        zIndex: isHovered ? 1000 : 1,
        transition: "all 0.3s ease",
        boxShadow: isHovered ? "0 0 0 2px var(--primary), 0 20px 40px rgba(0,0,0,0.5)" : "none"
      }}
    >
      <div 
        className={styles.imageWrapper} 
        style={{ position: "relative", cursor: creative.videoUrl ? "default" : "zoom-in", overflow: "hidden" }}
        onClick={(e) => {
          if (creative.videoUrl) return; 
          const url = creative.image_url || creative.thumbnail_url;
          if (url) setHoveredPreview({ url, isVideo: false, adName: creative.ad_name, cardId: creative.id });
        }}
      >
      {creative.videoUrl ? (
        <video 
          src={creative.videoUrl} 
          poster={creative.thumbnail_url || creative.image_url || ""}
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "8px", transition: "transform 0.3s ease" }} 
          controls
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
        />
      ) : creative.image_url ? (
        <SafeImage 
          src={creative.image_url} 
          alt={creative.ad_name} 
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "8px", transition: "transform 0.3s ease" }} 
        />
      ) : (
        <div style={{ width: "100%", aspectRatio: "1 / 1", background: "var(--card-border)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ImageIcon size={32} opacity={0.3} />
        </div>
      )}
      
      {matchingCreator && (
        <div style={{
          position: "absolute",
          top: "8px",
          left: "8px",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          padding: "4px 8px 4px 4px",
          borderRadius: "100px",
          color: "white",
          pointerEvents: "none"
        }} title={`Criador: ${matchingCreator.name}`}>
          <Avatar src={matchingCreator.avatarUrl} name={matchingCreator.name} size="xs" isActive={matchingCreator.active !== false} />
          <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{matchingCreator.name.split(" ")[0]}</span>
        </div>
      )}
    </div>
    
    <div className={styles.info}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.25rem" }}>
            <h4 style={{ 
              margin: 0, fontSize: "0.8rem", lineHeight: 1.3, opacity: 0.9, wordBreak: "break-all", fontWeight: 600,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.6em"
            }}>
              {creative.ad_name}
            </h4>
            <CopyButton text={creative.ad_name} />
          </div>
        </div>
        <div style={{ flex: "2 1 200px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          <MetricMiniCard
            label="Invest."
            value={formatCurrencyCompact(parseFloat(creative.spend))}
            title={formatCurrencyFull(parseFloat(creative.spend))}
            tone="neutral"
          />
          <MetricMiniCard
            label="CPA"
            value={formatCurrencyCompact(parseFloat(creative.cpa))}
            title={formatCurrencyFull(parseFloat(creative.cpa))}
            tone="neutral"
          />
          <MetricMiniCard
            label="Rec. Bruta"
            value={formatCurrencyCompact(parseFloat(creative.grossValue))}
            title={formatCurrencyFull(parseFloat(creative.grossValue))}
            tone="good"
          />
          <MetricMiniCard
            label="Rec. Líquida"
            value={formatCurrencyCompact(parseFloat(creative.riskApprovedValue))}
            title={formatCurrencyFull(parseFloat(creative.riskApprovedValue))}
            tone={approvedValueTone(parseFloat(creative.riskApprovedValue))}
          />
        </div>
      </div>
      
      <CreativeHypothesis creative={creative} />

      <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--card-border)", paddingTop: "0.5rem" }}>
        {creative.createdTime ? (
          <span style={{ fontSize: "0.65rem", color: "var(--foreground)", opacity: 0.5, fontWeight: 500 }} title="Anúncio rodando desde">
            Desde {new Date(creative.createdTime).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </span>
        ) : <span />}
        
        {creative.platform === "TIKTOK" ? (
          <div style={{ display: "flex", gap: "0.4rem", opacity: 0.5, color: "var(--foreground)" }} title="TikTok Ads">
            <TikTokIcon size={12} />
          </div>
        ) : creative.platform === "META" ? (
          <div style={{ display: "flex", gap: "0.4rem", opacity: 0.5, color: "var(--foreground)" }} title={creative.publisherPlatforms ? `Canais: ${creative.publisherPlatforms}` : "Meta Ads"}>
            <FbIcon size={12} />
            {creative.publisherPlatforms?.includes("instagram") && <InstaIcon size={12} />}
            {creative.publisherPlatforms?.includes("messenger") && <MessengerIcon size={12} />}
            {creative.publisherPlatforms?.includes("audience_network") && <AudienceIcon size={12} />}
          </div>
        ) : null}
      </div>
    </div>
  </motion.div>
  );
}

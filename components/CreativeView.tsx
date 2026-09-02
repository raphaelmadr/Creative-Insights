"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNotifications } from "./NotificationProvider";
import { Sparkles, Activity, Target, TrendingUp, Award, Image as ImageIcon, Loader2, ChevronDown, ChevronRight, Calendar, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { useCacheFetch } from "@/hooks/useCacheFetch";

const FbIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

const InstaIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);

const MessengerIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2C6.48 2 2 6.13 2 11.23c0 2.87 1.45 5.43 3.73 7.08v3.6l3.41-1.87c.91.26 1.87.4 2.86.4 5.52 0 10-4.13 10-9.23S17.52 2 12 2zm1.09 12.35-2.8-2.98-5.46 2.98 5.97-6.35 2.8 2.98 5.46-2.98-5.97 6.35z"/>
  </svg>
);

const AudienceIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

const TikTokIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
);
import styles from "./CreativeView.module.css";
import SafeImage from "./SafeImage";

const PAGE_SIZE = 8;
const PAGE_SIZE_GROUPS = 3;

function formatCurrencyCompact(value: number): string {
  if (Number.isNaN(value)) return "R$ 0";
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

function formatCurrencyFull(value: number): string {
  if (Number.isNaN(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Botão de copiar
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

// Sub-componente para carregar a hipótese de forma assíncrona
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

// Psicologia das cores: verde = info boa, amarelo = ficar de olho, vermelho = info ruim
type MetricTone = "good" | "watch" | "bad" | "neutral";

const TONE_STYLES: Record<MetricTone, { bg: string; border: string; text: string }> = {
  good: { bg: "rgba(39, 174, 96, 0.08)", border: "rgba(39, 174, 96, 0.15)", text: "var(--success)" },
  watch: { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.15)", text: "var(--warning)" },
  bad: { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.15)", text: "var(--danger)" },
  neutral: { bg: "rgba(128, 128, 128, 0.05)", border: "rgba(128, 128, 128, 0.15)", text: "var(--foreground)" },
};

function ctrTone(ctr: number): MetricTone {
  if (ctr >= 2) return "good";
  if (ctr >= 1) return "watch";
  return "bad";
}

function approvedValueTone(value: number): MetricTone {
  if (value >= 5000) return "good";
  if (value >= 1000) return "watch";
  return "bad";
}

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

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysAgoUTC(days: number): Date {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function InfiniteScrollTrigger({ remaining, onLoadMore, label = "Carregando mais" }: { remaining: number; onLoadMore: () => void; label?: string }) {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const onLoadMoreRef = React.useRef(onLoadMore);
  
  React.useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);
  
  React.useEffect(() => {
    if (!triggerRef.current || remaining <= 0) return;
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        onLoadMoreRef.current();
      }
    }, { rootMargin: "300px" });
    
    observer.observe(triggerRef.current);
    
    return () => observer.disconnect();
  }, [remaining]);

  if (remaining <= 0) return null;

  return (
    <div
      ref={triggerRef}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem",
        margin: "1.5rem auto 0", padding: "0.6rem 1.4rem",
        color: "var(--foreground)", opacity: 0.5, fontSize: "0.85rem"
      }}
    >
      <Loader2 size={16} className="spin" style={{ animation: "spin 2s linear infinite" }} />
      {label} ({remaining} restantes)
    </div>
  );
}

export default function CreativeView({ dateFrom, dateTo, statusFilter, channelFilter, onMetricsUpdate, selectedDesigner, creators = [], hideOldAds = true }: { dateFrom: string; dateTo: string; statusFilter?: string; channelFilter?: string; onMetricsUpdate?: (metrics: any) => void; selectedDesigner: string | null; creators: any[]; hideOldAds?: boolean }) {
  const { syncCounter } = useNotifications();
  const statusParam = statusFilter || "ACTIVE";
  const url = `/api/db-ads?from=${dateFrom}&to=${dateTo}&status=${statusParam}`;
  const { data: fetchRes, loading, isRevalidating, mutate } = useCacheFetch<any>(url);
  const data: {superWinners: any[], winners: any[], testes: Record<string, any[]>, settings?: any} | null = fetchRes?.success ? fetchRes.data : null;

  useEffect(() => {
    if (syncCounter > 0) mutate();
  }, [syncCounter]); // Removing mutate from deps to avoid re-renders if hook signature varies

  const [hoveredPreview, setHoveredPreview] = useState<{url: string, isVideo?: boolean, adName: string, cardId: string} | null>(null);
  const [superWinnersVisible, setSuperWinnersVisible] = useState(PAGE_SIZE);
  const [winnersVisible, setWinnersVisible] = useState(PAGE_SIZE);
  const [testesGroupsVisible, setTestesGroupsVisible] = useState(PAGE_SIZE_GROUPS);
  const [testesAdsVisible, setTestesAdsVisible] = useState<Record<string, number>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isSuperWinnersCollapsed, setIsSuperWinnersCollapsed] = useState(false);
  const [isWinnersCollapsed, setIsWinnersCollapsed] = useState(false);
  const [isTestesCollapsed, setIsTestesCollapsed] = useState(false);

  useEffect(() => {
    setSuperWinnersVisible(PAGE_SIZE);
    setWinnersVisible(PAGE_SIZE);
    setTestesGroupsVisible(PAGE_SIZE_GROUPS);
    setTestesAdsVisible({});
  }, [data, selectedDesigner]);




  const filterByDesigner = React.useCallback((creative: any) => {
    if (!selectedDesigner) return true;
    
    const selectedAcronyms = selectedDesigner.split(",").map(s => s.trim().toUpperCase());
    const activeAcronyms = creators.flatMap(c => c.acronym.split(",").map((s: string) => s.trim().toUpperCase()));
    const cDesigner = (creative.designer || "").trim().toUpperCase();
    
    let isMatch = false;
    if (selectedDesigner === "UNKNOWN") {
      isMatch = !cDesigner || !activeAcronyms.includes(cDesigner);
    } else {
      isMatch = selectedAcronyms.includes(cDesigner);
    }

    if (!isMatch) return false;

    if (!isMatch) return false;

    return true;
  }, [selectedDesigner, creators]);

  const filterByChannel = React.useCallback((creative: any) => {
    if (!channelFilter || channelFilter === "ALL") return true;
    return (creative.platform || "META").toUpperCase() === channelFilter.toUpperCase();
  }, [channelFilter]);

  const baseSuperWinners = React.useMemo(() => data ? data.superWinners.filter(c => filterByDesigner(c) && filterByChannel(c)) : [], [data, filterByDesigner, filterByChannel]);
  const baseWinners = React.useMemo(() => data ? data.winners.filter(c => filterByDesigner(c) && filterByChannel(c)) : [], [data, filterByDesigner, filterByChannel]);

  const baseTestes = React.useMemo(() => {
    const obj: Record<string, any[]> = {};
    if (data) {
      Object.entries(data.testes).forEach(([adsetName, ads]) => {
        const filteredAds = ads.filter(c => filterByDesigner(c) && filterByChannel(c));
        if (filteredAds.length > 0) {
          obj[adsetName] = filteredAds;
        }
      });
    }
    return obj;
  }, [data, filterByDesigner, filterByChannel]);

  const filterByDate = React.useCallback((creative: any) => {
    if (!hideOldAds) return true;
    if (!creative.createdTime) return false;
    
    const createdDate = new Date(creative.createdTime);
    const start = new Date(`${dateFrom}T00:00:00Z`);
    const end = new Date(`${dateTo}T23:59:59.999Z`);
    
    return createdDate >= start && createdDate <= end;
  }, [hideOldAds, dateFrom, dateTo]);

  const filteredSuperWinners = React.useMemo(() => baseSuperWinners.filter(filterByDate), [baseSuperWinners, filterByDate]);
  const filteredWinners = React.useMemo(() => baseWinners.filter(filterByDate), [baseWinners, filterByDate]);
  const filteredTestes = React.useMemo(() => {
    const obj: Record<string, any[]> = {};
    Object.entries(baseTestes).forEach(([adsetName, ads]) => {
      const displayAds = ads.filter(filterByDate);
      if (displayAds.length > 0) {
        obj[adsetName] = displayAds;
      }
    });
    return obj;
  }, [baseTestes, filterByDate]);

  useEffect(() => {
    if (data && onMetricsUpdate) {
      console.log("data size:", data.superWinners.length, data.winners.length); console.log("filtered size:", filteredSuperWinners.length, filteredWinners.length); console.log("selected designer:", selectedDesigner); let totalSpend = 0;
      let totalRiskApprovedValue = 0;
      let totalGrossValue = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalNetOrders = 0;

      const processCreative = (c: any) => {
        totalSpend += parseFloat(c.spend) || 0;
        totalRiskApprovedValue += parseFloat(c.riskApprovedValue) || 0;
        totalGrossValue += parseFloat(c.grossValue) || 0;
        totalImpressions += c.impressions || 0;
        totalClicks += c.clicks || 0;
        totalNetOrders += c.netOrders || 0;
      };

      const filterForMetrics = (creative: any) => {
        // Se NÃO há um designer selecionado (Todos os Criadores), 
        // a métrica global deve refletir a conta inteira (incluindo anúncios velhos).
        // Se HÁ um designer selecionado, a métrica deve refletir apenas a safra do mês
        // para bater perfeitamente com o relatório de performance da aba Equipe.
        if (!selectedDesigner) return true;

        if (!creative.createdTime) return false;
        const createdDate = new Date(creative.createdTime);
        const start = new Date(`${dateFrom}T00:00:00Z`);
        const end = new Date(`${dateTo}T23:59:59.999Z`);
        return createdDate >= start && createdDate <= end;
      };

      baseSuperWinners.filter(filterForMetrics).forEach(processCreative);
      baseWinners.filter(filterForMetrics).forEach(processCreative);
      Object.values(baseTestes).flat().filter(filterForMetrics).forEach(processCreative);

      const globalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const globalCpa = totalNetOrders > 0 ? (totalSpend / totalNetOrders) : totalSpend;

      onMetricsUpdate({
        totalSpend: totalSpend.toFixed(2),
        avgCtr: globalCtr.toFixed(2),
        avgCpa: globalCpa.toFixed(2),
        totalRiskApprovedValue: totalRiskApprovedValue.toFixed(2),
        totalGrossValue: totalGrossValue.toFixed(2),
      });
    }
  }, [baseSuperWinners, baseWinners, baseTestes, data, dateFrom, dateTo, onMetricsUpdate]);

  if (loading && !data) return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div className={styles.grid}>
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} className={`glass-panel ${styles.card}`}>
            <Skeleton width="100%" style={{ aspectRatio: "1 / 1" }} borderRadius="8px" />
            <div className={styles.info}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
                <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <Skeleton width="100%" height="16px" />
                  <Skeleton width="60%" height="16px" />
                </div>
                <div style={{ flex: "2 1 200px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
                  <Skeleton width="100%" height="40px" borderRadius="6px" />
                  <Skeleton width="100%" height="40px" borderRadius="6px" />
                  <Skeleton width="100%" height="40px" borderRadius="6px" />
                  <Skeleton width="100%" height="40px" borderRadius="6px" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!data) return <div>Erro ao carregar dados.</div>;


  const renderCreativeCard = (creative: any, tier?: "super" | "winner") => {
    const isHovered = hoveredPreview?.cardId === creative.id;
    
    // Resolve creator for this card
    const creatorAcronym = (creative.designer || "").trim().toUpperCase();
    const matchingCreator = creators.find(c => {
      const acronyms = c.acronym.split(",").map((s: string) => s.trim().toUpperCase());
      return acronyms.includes(creatorAcronym);
    });
    
    return (
      <motion.div
        key={creative.id}
        variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } }}
        className={`glass-panel ${styles.card}`}
        style={{
          position: "relative",
          zIndex: isHovered ? 1000 : 1,
          transition: "all 0.3s ease",
          boxShadow: isHovered ? "0 0 0 2px var(--primary), 0 20px 40px rgba(0,0,0,0.5)" : "none"
        }}
      >
        {/* Badges removed per user request */}
        <div 
          className={styles.imageWrapper} 
          style={{ position: "relative", cursor: creative.videoUrl ? "default" : "zoom-in", overflow: "hidden" }}
          onClick={(e) => {
            if (creative.videoUrl) return; // Vídeos usam o player nativo para fullscreen
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
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {loading && data && (
        <div style={{ textAlign: "center", opacity: 0.5, fontSize: "0.9rem" }}>
          Recarregando dados do período...
        </div>
      )}

      {/* Glossário / Informações (Dashboard) */}
      {data?.settings && (
        <div className="fixed-grid-4" style={{ marginBottom: "1rem" }}>
          <div className="allu-card allu-card-highlight">
            <div className="allu-card-label">▶ SUPER WINNERS</div>
            <div className="allu-card-subtext">
              Anúncios de alta performance que tiveram um <strong>investimento</strong> acima de <strong>R$ {data.settings.superWinnerSpend.toLocaleString("pt-BR")}</strong>, geraram uma <strong>receita líquida</strong> maior que <strong>R$ {data.settings.superWinnerReturn.toLocaleString("pt-BR")}</strong> e mantiveram o <strong>CPA</strong> abaixo de <strong>R$ {data.settings.superWinnerCpa?.toLocaleString("pt-BR") || "50"}</strong>.
            </div>
          </div>
          <div className="allu-card">
            <div className="allu-card-label">◇ WINNERS</div>
            <div className="allu-card-subtext">
              Anúncios validados que tiveram um <strong>investimento</strong> acima de <strong>R$ {data.settings.winnerSpend.toLocaleString("pt-BR")}</strong>, geraram uma <strong>receita líquida</strong> maior que <strong>R$ {data.settings.winnerReturn.toLocaleString("pt-BR")}</strong> e mantiveram o <strong>CPA</strong> abaixo de <strong>R$ {data.settings.winnerCpa?.toLocaleString("pt-BR") || "60"}</strong>.
            </div>
          </div>
          <div className="allu-card">
            <div className="allu-card-label">◇ ÁREA DE TESTES</div>
            <div className="allu-card-subtext">
              Anúncios em validação agrupados por conjunto. Podem ou não ter atingido as métricas de Winner ainda.
            </div>
          </div>
          <div className="allu-card">
            <div className="allu-card-label">◇ FILTRO DE VEICULAÇÃO</div>
            <div className="allu-card-subtext">
              Exibindo e calculando estritamente métricas de anúncios com status 
              <strong> {statusFilter === 'INACTIVE' ? 'DESATIVADO' : statusFilter === 'ALL' ? 'ATIVO E DESATIVADO' : 'ATIVO'} </strong> 
              atualmente na Meta Ads.
            </div>
          </div>
        </div>
      )}

      {/* Controles Globais */}
      {data && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "-1rem", position: "relative", zIndex: 10 }}>
          <button 
            onClick={() => {
              const allAdSets = Object.keys(filteredTestes);
              const allGroupsCollapsed = allAdSets.every(adset => collapsedGroups[adset]);
              const isEverythingCollapsed = isSuperWinnersCollapsed && isWinnersCollapsed && isTestesCollapsed && (allAdSets.length === 0 || allGroupsCollapsed);
              
              if (isEverythingCollapsed) {
                setIsSuperWinnersCollapsed(false);
                setIsWinnersCollapsed(false);
                setIsTestesCollapsed(false);
                setCollapsedGroups({});
              } else {
                setIsSuperWinnersCollapsed(true);
                setIsWinnersCollapsed(true);
                setIsTestesCollapsed(true);
                const newState: Record<string, boolean> = {};
                allAdSets.forEach(adset => newState[adset] = true);
                setCollapsedGroups(newState);
              }
            }}
            style={{ 
              fontSize: "0.85rem", opacity: 0.8, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem",
              background: "var(--card-bg)", padding: "0.5rem 1rem", borderRadius: "100px", border: "1px solid var(--card-border)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)", fontWeight: 600, transition: "all 0.2s"
            }}
            onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
          >
            {isSuperWinnersCollapsed && isWinnersCollapsed && isTestesCollapsed && (Object.keys(filteredTestes).length === 0 || Object.keys(filteredTestes).every(adset => collapsedGroups[adset])) 
              ? <><ChevronRight size={16} /> Expandir tudo</> 
              : <><ChevronDown size={16} /> Recolher tudo</>}
          </button>
        </div>
      )}

      {/* Seção Super Winners */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
          <div className="section-header" style={{ marginBottom: 0 }}>
            <span className="section-number">02</span>
            <h2 className="section-title">super winners ({filteredSuperWinners.length})</h2>
            <span className="section-subtitle">gastou &gt; {data?.settings ? (data.settings.superWinnerSpend / 1000).toFixed(0) + 'k' : '1k'}, faturou &gt; {data?.settings ? (data.settings.superWinnerReturn / 1000).toFixed(0) + 'k' : '5k'} e cpa &lt; {data?.settings ? data.settings.superWinnerCpa : '50'}</span>
          </div>
          <button 
            onClick={() => setIsSuperWinnersCollapsed(!isSuperWinnersCollapsed)}
            style={{ fontSize: "0.8rem", opacity: 0.7, cursor: "pointer", textDecoration: "underline", display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            {isSuperWinnersCollapsed ? <><ChevronRight size={14} /> Expandir</> : <><ChevronDown size={14} /> Recolher</>}
          </button>
        </div>

        {!isSuperWinnersCollapsed && (
          filteredSuperWinners.length === 0 ? (
            <p style={{ opacity: 0.5 }}>Nenhum criativo super winner no período (gasto ≥ R$ {data?.settings?.superWinnerSpend || 1000}, valor aprovado ≥ R$ {data?.settings?.superWinnerReturn || 5000} e CPA ≤ R$ {data?.settings?.superWinnerCpa || 50}, dentro do período selecionado).</p>
          ) : (
            <>
              <motion.div 
                className={styles.grid}
                initial="hidden" animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
              >
                {filteredSuperWinners.slice(0, superWinnersVisible).map(c => renderCreativeCard(c, "super"))}
              </motion.div>
              {filteredSuperWinners.length > superWinnersVisible && (
                <InfiniteScrollTrigger
                  remaining={filteredSuperWinners.length - superWinnersVisible}
                  onLoadMore={() => setSuperWinnersVisible(v => v + PAGE_SIZE)}
                />
              )}
            </>
          )
        )}
      </section>

      {/* Seção Winners */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
          <div className="section-header" style={{ marginBottom: 0 }}>
            <span className="section-number">03</span>
            <h2 className="section-title">winners ({filteredWinners.length})</h2>
            <span className="section-subtitle">gastou &gt; {data?.settings ? (data.settings.winnerSpend / 1000).toFixed(0) + 'k' : '1k'}, faturou &gt; {data?.settings ? (data.settings.winnerReturn / 1000).toFixed(0) + 'k' : '1k'} e cpa &lt; {data?.settings ? data.settings.winnerCpa : '80'}</span>
          </div>
          <button 
            onClick={() => setIsWinnersCollapsed(!isWinnersCollapsed)}
            style={{ fontSize: "0.8rem", opacity: 0.7, cursor: "pointer", textDecoration: "underline", display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            {isWinnersCollapsed ? <><ChevronRight size={14} /> Expandir</> : <><ChevronDown size={14} /> Recolher</>}
          </button>
        </div>

        {!isWinnersCollapsed && (
          filteredWinners.length === 0 ? (
            <p style={{ opacity: 0.5 }}>Nenhum criativo winner no período (gasto ≥ R$ {data?.settings?.winnerSpend || 1000}, valor aprovado ≥ R$ {data?.settings?.winnerReturn || 1000} e CPA ≤ R$ {data?.settings?.winnerCpa || 80}, dentro do período selecionado).</p>
          ) : (
            <>
              <motion.div 
                className={styles.grid}
                initial="hidden" animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
              >
                {filteredWinners.slice(0, winnersVisible).map(c => renderCreativeCard(c, "winner"))}
              </motion.div>
              {filteredWinners.length > winnersVisible && (
                <InfiniteScrollTrigger
                  remaining={filteredWinners.length - winnersVisible}
                  onLoadMore={() => setWinnersVisible(v => v + PAGE_SIZE)}
                />
              )}
            </>
          )
        )}
      </section>

      {/* Seção Testes (Agrupada por Conjunto) */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
          <div className="section-header" style={{ marginBottom: 0 }}>
            <span className="section-number">04</span>
            <h2 className="section-title">área de testes ({Object.values(filteredTestes).reduce((acc, curr) => acc + curr.length, 0)})</h2>
            <span className="section-subtitle">em validação</span>
          </div>
          <button 
            onClick={() => setIsTestesCollapsed(!isTestesCollapsed)}
            style={{ fontSize: "0.8rem", opacity: 0.7, cursor: "pointer", textDecoration: "underline", display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            {isTestesCollapsed ? <><ChevronRight size={14} /> Expandir</> : <><ChevronDown size={14} /> Recolher</>}
          </button>
        </div>

        {!isTestesCollapsed && (
          Object.keys(filteredTestes).length === 0 ? (
            <p style={{ opacity: 0.5 }}>Nenhum teste ativo no período selecionado.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                {Object.entries(filteredTestes).slice(0, testesGroupsVisible).map(([adsetName, ads]) => {
                  const visibleCount = testesAdsVisible[adsetName] || PAGE_SIZE;
                  const isCollapsed = collapsedGroups[adsetName] || false;
                  return (
                    <div key={adsetName} style={{ background: "rgba(255,255,255,0.02)", padding: "1.5rem", borderRadius: "1rem", border: "1px dashed rgba(255,255,255,0.1)" }}>
                      <div 
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: isCollapsed ? 0 : "1rem", opacity: 0.9 }}
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [adsetName]: !isCollapsed }))}
                      >
                        <h4 style={{ fontSize: "1rem", margin: 0 }}>Conjunto: {adsetName} ({ads.length})</h4>
                        {isCollapsed ? <ChevronRight size={20} opacity={0.5} /> : <ChevronDown size={20} opacity={0.5} />}
                      </div>
                      {!isCollapsed && (
                        <>
                          <motion.div 
                            className={styles.grid}
                            initial="hidden" animate="show"
                            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                          >
                            {ads.slice(0, visibleCount).map(c => renderCreativeCard(c))}
                          </motion.div>
                          {ads.length > visibleCount && (
                            <InfiniteScrollTrigger
                              remaining={ads.length - visibleCount}
                              onLoadMore={() => setTestesAdsVisible(prev => ({ ...prev, [adsetName]: (prev[adsetName] || PAGE_SIZE) + PAGE_SIZE }))}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.keys(filteredTestes).length > testesGroupsVisible && (
                <InfiniteScrollTrigger
                  remaining={Object.keys(filteredTestes).length - testesGroupsVisible}
                  label="Carregando mais conjuntos"
                  onLoadMore={() => setTestesGroupsVisible(v => v + PAGE_SIZE_GROUPS)}
                />
              )}
            </>
          )
        )}
      </section>

      {/* Overlay de Blur e Balão Flutuante via Portal (resolve problemas de stacking context e overflow) */}
      {hoveredPreview && typeof document !== "undefined" && createPortal(
        <>
          {/* Overlay que borra tudo exceto o card (o card ganha z-index 1000) */}
          <div 
            onClick={() => setHoveredPreview(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              zIndex: 900,
              cursor: "zoom-out",
              transition: "opacity 0.2s ease"
            }} 
          />
          
          {/* Modal Centralizado */}
          <div 
            onClick={(e) => {
              // Se clicar exatamente no fundo, fecha. Mas se clicar no conteúdo não fecha.
              if (e.target === e.currentTarget) setHoveredPreview(null);
            }}
            style={{ 
              position: "fixed", 
              inset: 0,
              zIndex: 9999, 
              cursor: "zoom-out", 
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem"
            }}
          >
            <div 
              style={{
                background: "rgba(20,20,20,0.95)",
                padding: "1rem",
                borderRadius: "16px",
                boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
                maxWidth: "90vw",
                maxHeight: "90vh",
                cursor: "default"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {hoveredPreview.isVideo ? (
                <video 
                  src={hoveredPreview.url} 
                  controls
                  autoPlay
                  style={{ 
                    display: "block",
                    width: "100%",
                    maxWidth: "800px",
                    maxHeight: "75vh",
                    objectFit: "contain",
                    borderRadius: "8px"
                  }} 
                />
              ) : (
                <SafeImage 
                  src={hoveredPreview.url} 
                  alt="Preview" 
                  style={{ 
                    display: "block",
                    width: "100%",
                    maxWidth: "800px",
                    maxHeight: "75vh",
                    objectFit: "contain",
                    borderRadius: "8px"
                  }} 
                />
              )}
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(0,0,0,0.5)", padding: "0.5rem 1rem", borderRadius: "8px" }}>
                <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem" }}>{hoveredPreview.adName}</span>
                <CopyButton text={hoveredPreview.adName} />
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

    </div>
  );
}

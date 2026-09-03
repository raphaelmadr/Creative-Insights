"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "./NotificationProvider";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { CreativeCard } from "@/components/CreativeCard";
import styles from "./CreativeView.module.css";

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

const GoogleIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.78 4.15-1.15 1.15-2.9 2.45-6.06 2.45-4.85 0-8.69-3.95-8.69-8.8 0-4.86 3.84-8.81 8.69-8.81 2.62 0 4.54 1.03 5.92 2.33l2.33-2.34C19.08 1.65 16.31 0 12.48 0 5.86 0 .3 5.39.3 12s5.56 12 12.18 12c3.57 0 6.26-1.17 8.37-3.36 2.16-2.16 2.84-5.21 2.84-7.66 0-.76-.05-1.46-.17-2.06h-11.04z" />
  </svg>
);

function formatCurrencyFull(value: number): string {
  if (Number.isNaN(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FunnelsOverview({ dateFrom, dateTo, statusFilter, channelFilter, onMetricsUpdate, selectedDesigner, creators = [], hideOldAds = true }: { dateFrom: string; dateTo: string; statusFilter?: string; channelFilter?: string; onMetricsUpdate?: (metrics: any) => void; selectedDesigner: string | null; creators: any[]; hideOldAds?: boolean }) {
  const { syncCounter } = useNotifications();
  const statusParam = statusFilter || "ACTIVE";
  const url = `/api/db-ads?from=${dateFrom}&to=${dateTo}&status=${statusParam}`;
  const { data: fetchRes, loading, mutate } = useCacheFetch<any>(url);
  const data = fetchRes?.success ? fetchRes.data : null;

  useEffect(() => {
    if (syncCounter > 0) mutate();
  }, [syncCounter, mutate]);

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

    return isMatch;
  }, [selectedDesigner, creators]);

  const filterByChannel = React.useCallback((creative: any) => {
    if (!channelFilter || channelFilter === "ALL") return true;
    return (creative.platform || "META").toUpperCase() === channelFilter.toUpperCase();
  }, [channelFilter]);

  const filterByDate = React.useCallback((creative: any) => {
    if (!hideOldAds) return true;
    if (!creative.createdTime) return false;
    
    const createdDate = new Date(creative.createdTime);
    const start = new Date(`${dateFrom}T00:00:00Z`);
    const end = new Date(`${dateTo}T23:59:59.999Z`);
    
    return createdDate >= start && createdDate <= end;
  }, [hideOldAds, dateFrom, dateTo]);

  const { funnels, globalMetrics } = useMemo(() => {
    if (!data || !data.categorizedAds) return { funnels: [], globalMetrics: null };

    let totalSpendG = 0;
    let totalRiskApprovedValueG = 0;
    let totalGrossValueG = 0;
    let totalImpressionsG = 0;
    let totalClicksG = 0;
    let totalNetOrdersG = 0;

    const processed = data.categorizedAds.map((cat: any) => {
      const validAds = cat.ads.filter((c: any) => filterByDesigner(c) && filterByChannel(c) && filterByDate(c));
      
      let spend = 0, returnVal = 0, netOrders = 0;
      let platforms = { META: 0, TIKTOK: 0, GOOGLE: 0 };
      let designersMap: Record<string, number> = {};

      validAds.forEach((c: any) => {
        const s = parseFloat(c.spend) || 0;
        const r = parseFloat(c.riskApprovedValue) || 0;
        const n = parseFloat(c.netOrders) || 0;

        spend += s;
        returnVal += r;
        netOrders += n;

        const plat = (c.platform || "META").toUpperCase();
        if (plat === "META") platforms.META++;
        if (plat === "TIKTOK") platforms.TIKTOK++;
        if (plat === "GOOGLE") platforms.GOOGLE++;

        const creatorAcronym = (c.designer || "").trim().toUpperCase();
        if (creatorAcronym) {
          designersMap[creatorAcronym] = (designersMap[creatorAcronym] || 0) + 1;
        } else {
          designersMap["UNKNOWN"] = (designersMap["UNKNOWN"] || 0) + 1;
        }

        // Global metrics accumulator (matches CreativeView logic)
        totalSpendG += s;
        totalRiskApprovedValueG += r;
        totalGrossValueG += parseFloat(c.grossValue) || 0;
        totalImpressionsG += c.impressions || 0;
        totalClicksG += c.clicks || 0;
        totalNetOrdersG += n;
      });

      const topDesigners = Object.entries(designersMap)
        .sort((a, b) => b[1] - a[1])
        .map(([acronym, count]) => {
          const matchingCreator = creators.find(c => c.acronym.split(",").map((s: string) => s.trim().toUpperCase()).includes(acronym));
          return {
            acronym,
            name: matchingCreator ? matchingCreator.name : "Desconhecido",
            count
          };
        });

      return {
        ...cat,
        adsCount: validAds.length,
        spend,
        returnVal,
        cpa: netOrders > 0 ? (spend / netOrders) : 0,
        roas: spend > 0 ? (returnVal / spend) : 0,
        platforms,
        topDesigners,
        validAds
      };
    });

    const globalCtr = totalImpressionsG > 0 ? (totalClicksG / totalImpressionsG) * 100 : 0;
    const globalCpa = totalNetOrdersG > 0 ? (totalSpendG / totalNetOrdersG) : totalSpendG;
    
    const calculatedGlobalMetrics = {
      totalSpend: totalSpendG.toFixed(2),
      avgCtr: globalCtr.toFixed(2),
      avgCpa: globalCpa.toFixed(2),
      totalRiskApprovedValue: totalRiskApprovedValueG.toFixed(2),
      totalGrossValue: totalGrossValueG.toFixed(2),
    };

    return { funnels: processed, globalMetrics: calculatedGlobalMetrics };
  }, [data, filterByDesigner, filterByChannel, filterByDate, creators]);

  React.useEffect(() => {
    if (onMetricsUpdate && globalMetrics) {
      onMetricsUpdate(globalMetrics);
    }
  }, [globalMetrics, onMetricsUpdate]);


  if (loading && !data) return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {[1,2,3].map(i => <Skeleton key={i} width="100%" height="150px" borderRadius="12px" />)}
    </div>
  );

  if (!data) return <div>Erro ao carregar os dados.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {funnels.map((funnel: any) => (
        <div key={funnel.id || funnel.name} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ fontSize: "1.5rem", width: "40px", height: "40px", borderRadius: "8px", background: "var(--background-main)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {funnel.emoji || "📁"}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>{funnel.name}</h3>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500 }}>
                  {funnel.adsCount} {funnel.adsCount === 1 ? "anúncio" : "anúncios"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
              {/* Distribuição de Redes */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {funnel.platforms.META > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "rgba(59, 130, 246, 0.1)", padding: "0.2rem 0.5rem", borderRadius: "6px", color: "#3b82f6", fontWeight: 600, fontSize: "0.75rem", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                    <FbIcon size={12} /> {funnel.platforms.META}
                  </div>
                )}
                {funnel.platforms.TIKTOK > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "rgba(0, 242, 234, 0.1)", padding: "0.2rem 0.5rem", borderRadius: "6px", color: "#00f2ea", fontWeight: 600, fontSize: "0.75rem", border: "1px solid rgba(0, 242, 234, 0.2)" }}>
                    <TikTokIcon size={12} /> {funnel.platforms.TIKTOK}
                  </div>
                )}
                {funnel.platforms.GOOGLE > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "rgba(128, 128, 128, 0.1)", padding: "0.2rem 0.5rem", borderRadius: "6px", color: "var(--muted)", fontWeight: 600, fontSize: "0.75rem", border: "1px solid var(--card-border)" }}>
                    <GoogleIcon size={12} /> {funnel.platforms.GOOGLE}
                  </div>
                )}
              </div>

              <div style={{ width: "1px", height: "20px", background: "var(--card-border)", opacity: 0.5 }}></div>

              {/* Métricas em Mini-Cards */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div style={{ background: "var(--background-main)", border: "1px solid var(--card-border)", padding: "0.25rem 0.6rem", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Gasto</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>{formatCurrencyFull(funnel.spend)}</span>
                </div>
                <div style={{ background: "var(--background-main)", border: "1px solid var(--card-border)", padding: "0.25rem 0.6rem", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Retorno</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--success)" }}>{formatCurrencyFull(funnel.returnVal)}</span>
                </div>
                <div style={{ background: "var(--background-main)", border: "1px solid var(--card-border)", padding: "0.25rem 0.6rem", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>CPA</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>{formatCurrencyFull(funnel.cpa)}</span>
                </div>
                <div style={{ background: "var(--background-main)", border: "1px solid var(--card-border)", padding: "0.25rem 0.6rem", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "0.6rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>ROAS</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: funnel.roas >= 1 ? "var(--success)" : "var(--danger)" }}>{funnel.roas.toFixed(2)}x</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          {funnel.validAds && funnel.validAds.length > 0 && (
            <div className={styles.grid} style={{ marginTop: "0.5rem" }}>
              {funnel.validAds.map((c: any) => (
                <CreativeCard 
                  key={c.id} 
                  creative={c} 
                  creators={creators} 
                  hoveredPreview={null} 
                  setHoveredPreview={() => {}} 
                />
              ))}
            </div>
          )}

        </div>
      ))}
    </div>
  );
}

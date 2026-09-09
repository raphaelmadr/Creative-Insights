"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "./NotificationProvider";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { CreativeCard } from "@/components/CreativeCard";
import styles from "./CreativeGrid.module.css";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

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

/** Valor de corte sem centavos: são sempre limiares redondos, e o ",00" só ocupa espaço. */
function thresholdMoney(value: number): string {
  return "R$ " + Math.round(value).toLocaleString("pt-BR");
}

/**
 * Decompõe o critério de uma plataforma em pares rótulo/valor.
 *
 * Um card por condição, em vez de uma frase longa: o tipo do critério vira o
 * rótulo e sobra só o limiar no valor, o que mantém tudo em uma linha. Sem
 * sigla — a tradução é fiel a `lib/creative-metrics.ts`, onde a receita de
 * referência é o valor de pedidos aprovados e o CPA é o custo por pedido
 * aprovado.
 *
 * A regra real é conjuntiva: as condições listadas valem ao mesmo tempo, e um
 * valor `0` significa "não usar este critério".
 */
function platformCriteria(rule: any): { label: string; value: string }[] {
  if (!rule) return [];
  const out: { label: string; value: string }[] = [];
  if ((rule.minSpend || 0) > 0) out.push({ label: "investimento", value: `acima de ${thresholdMoney(rule.minSpend)}` });
  if ((rule.minReturn || 0) > 0) out.push({ label: "vendas aprovadas", value: `acima de ${thresholdMoney(rule.minReturn)}` });
  if ((rule.maxCpa || 0) > 0) out.push({ label: "custo por venda", value: `até ${thresholdMoney(rule.maxCpa)}` });
  return out;
}

/**
 * Canais, com a cor de marca usada nos ícones.
 *
 * O TikTok usa o rosa (#FF0050) e não o ciano: sobre os fundos escuros e claros
 * do painel o ciano ficava com contraste ruim e competia com o azul da Meta.
 */
const PLATFORM_LABELS: { key: string; label: string; color: string }[] = [
  { key: "META", label: "Meta", color: "#1877F2" },
  { key: "TIKTOK", label: "TikTok", color: "#FF0050" },
  { key: "GOOGLE", label: "Google", color: "#DB4437" },
];

const PLATFORM_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  META: FbIcon,
  TIKTOK: TikTokIcon,
  GOOGLE: GoogleIcon,
};

/**
 * Estilo compartilhado pelos dois tipos de card do cabeçalho — o critério da
 * categoria e a contagem por canal. É a mesma constante nos dois para que
 * fiquem exatamente do mesmo tamanho, em vez de casarem por coincidência.
 */
const HEADER_CARD_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  background: "var(--background-main)",
  border: "1px solid var(--card-border)",
  borderRadius: "8px",
  padding: "0.4rem 0.6rem",
  minWidth: "148px",
  minHeight: "2.8rem",
  boxSizing: "border-box",
  justifyContent: "center",
};

const CARD_LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.58rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  color: "var(--muted)",
  whiteSpace: "nowrap",
};

const CARD_VALUE_STYLE: React.CSSProperties = {
  fontSize: "0.74rem",
  fontWeight: 600,
  color: "var(--foreground)",
  lineHeight: 1.3,
  whiteSpace: "nowrap",
};


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

  /**
   * Estado de recolhimento por categoria.
   *
   * Ausente no mapa significa **recolhido**: a home abre como um índice — nome,
   * critério e contagem de cada categoria — e quem quiser ver as peças expande
   * a que interessa. Carregar seis grades de criativos de uma vez enterrava
   * essa leitura.
   */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const funnelKey = (funnel: any) => funnel.id || funnel.name;
  const isCollapsed = (funnel: any) => collapsed[funnelKey(funnel)] ?? true;
  const toggleFunnel = (funnel: any) =>
    setCollapsed(prev => ({ ...prev, [funnelKey(funnel)]: !(prev[funnelKey(funnel)] ?? true) }));

  const { funnels, globalMetrics } = useMemo(() => {
    if (!data || !data.categorizedAds) return { funnels: [], globalMetrics: null };

    let totalSpendG = 0;
    let totalRiskApprovedValueG = 0;
    let totalGrossValueG = 0;
    let totalImpressionsG = 0;
    let totalClicksG = 0;
    let totalNetOrdersG = 0;

    const processed = data.categorizedAds.map((cat: any) => {
      // Base ads for metrics (filtered by designer and channel only)
      const baseFilteredAds = cat.ads.filter((c: any) => filterByDesigner(c) && filterByChannel(c));
      
      // Visible ads for the grid (also filtered by date)
      const visibleAds = baseFilteredAds.filter((c: any) => filterByDate(c));
      
      let spend = 0, returnVal = 0, netOrders = 0;
      let platforms = { META: 0, TIKTOK: 0, GOOGLE: 0 };
      let designersMap: Record<string, number> = {};

      // Calculate metrics based on ALL active ads in the period, NOT just the newly launched ones
      baseFilteredAds.forEach((c: any) => {
        const s = parseFloat(c.spend) || 0;
        const r = parseFloat(c.riskApprovedValue) || 0;
        const n = parseFloat(c.netOrders) || 0;

        spend += s;
        returnVal += r;
        netOrders += n;

        const creatorAcronym = (c.designer || "").trim().toUpperCase();
        if (creatorAcronym) {
          designersMap[creatorAcronym] = (designersMap[creatorAcronym] || 0) + 1;
        } else {
          designersMap["UNKNOWN"] = (designersMap["UNKNOWN"] || 0) + 1;
        }

        // Indicadores globais: recorte do PERÍODO, para bater com a meta do mês.
        // (os cards seguem exibindo o acumulado de veiculação)
        totalSpendG += parseFloat(c.periodSpend) || 0;
        totalRiskApprovedValueG += parseFloat(c.periodRiskApprovedValue) || 0;
        totalGrossValueG += parseFloat(c.periodGrossValue) || 0;
        totalImpressionsG += c.periodImpressions || 0;
        totalClicksG += c.periodClicks || 0;
        totalNetOrdersG += c.periodNetOrders || 0;
      });

      /*
       * A contagem por canal é feita sobre `visibleAds`, os anúncios que a
       * categoria realmente lista — e não sobre `baseFilteredAds`, usado só
       * pelas métricas globais. Contando populações diferentes, a soma dos
       * cards de canal não fechava com o total exibido sob o nome.
       */
      visibleAds.forEach((c: any) => {
        const plat = (c.platform || "META").toUpperCase();
        if (plat === "META") platforms.META++;
        else if (plat === "TIKTOK") platforms.TIKTOK++;
        else if (plat === "GOOGLE") platforms.GOOGLE++;
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
        adsCount: visibleAds.length,
        spend,
        returnVal,
        cpa: netOrders > 0 ? (spend / netOrders) : 0,
        roas: spend > 0 ? (returnVal / spend) : 0,
        platforms,
        topDesigners,
        validAds: visibleAds
      };
    });

    const globalCtr = totalImpressionsG > 0 ? (totalClicksG / totalImpressionsG) * 100 : 0;
    const globalCpa = totalNetOrdersG > 0 ? (totalSpendG / totalNetOrdersG) : totalSpendG;
    
    const calculatedGlobalMetrics = {
      conversions: data.conversions,
      totalSpend: totalSpendG.toFixed(2),
      avgCtr: globalCtr.toFixed(2),
      avgCpa: globalCpa.toFixed(2),
      totalRiskApprovedValue: totalRiskApprovedValueG.toFixed(2),
      totalGrossValue: totalGrossValueG.toFixed(2),
      totalNetOrders: totalNetOrdersG,
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

  const allCollapsed = funnels.length > 0 && funnels.every((f: any) => isCollapsed(f));

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    for (const f of funnels) next[funnelKey(f)] = !allCollapsed;
    setCollapsed(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Contexto para quem chega agora: o que é um funil e como um criativo cai nele. */}
      {funnels.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1rem" }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: "0.15rem", color: "var(--primary)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.85rem", lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>Como ler estes funis</span>
            <span style={{ color: "var(--muted)" }}>
              Cada anúncio é avaliado pelos critérios do <strong>canal em que ele roda</strong>, e fica na{" "}
              <strong>primeira categoria em que se encaixa</strong>, de cima para baixo. Por isso um{" "}
              <strong>{funnels[0]?.name}</strong> vale mais que os de baixo: ele atingiu uma exigência maior.
              Quem não atinge nenhuma aparece em Testes, na página de Anúncios.
              As exigências são definidas em Configurações › Metas — mudá-las reorganiza tudo na hora.
              {hideOldAds
                ? " A contagem abaixo mostra só os anúncios que estrearam dentro do período; desligue \u201cLançados no período\u201d para ver todos os que tiveram veiculação."
                : " A contagem abaixo mostra todos os anúncios com veiculação no período, inclusive os lançados antes dele."}
            </span>
          </div>
          <button
            onClick={toggleAll}
            style={{ marginLeft: "auto", flexShrink: 0, background: "transparent", border: "1px solid var(--card-border)", borderRadius: "6px", padding: "0.35rem 0.7rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", whiteSpace: "nowrap" }}
          >
            {allCollapsed ? <><ChevronRight size={13} /> Expandir tudo</> : <><ChevronDown size={13} /> Recolher tudo</>}
          </button>
        </div>
      )}

      {funnels.map((funnel: any) => (
        <div key={funnel.id || funnel.name} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          {/*
            Uma linha só: identidade da categoria, o que faz um anúncio estar
            nela, a contagem por canal e a seta de recolher. `nowrap` garante a
            linha única; em tela estreita a fileira rola na horizontal em vez de
            quebrar, o que preserva a leitura de esquerda para a direita.
          */}
          <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "stretch", gap: "0.5rem", overflowX: "auto" }}>

            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexShrink: 0 }}>
              <div style={{ fontSize: "1.15rem", width: "34px", height: "34px", borderRadius: "8px", background: "var(--background-main)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {funnel.emoji || "📁"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }}>{funnel.name}</h3>
                {/*
                  O que este número conta depende do filtro "Lançados no
                  período": com ele ligado são só as peças que estrearam dentro
                  do intervalo, o que fazia o total parecer baixo demais sem
                  explicar por quê.
                */}
                <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {funnel.adsCount} {funnel.adsCount === 1 ? "anúncio" : "anúncios"}{" "}
                  {hideOldAds ? "lançado" : "veiculado"}{funnel.adsCount === 1 ? "" : "s"} neste período
                </span>
              </div>
            </div>

            {/*
              Todos os cards informativos num contêiner só, empurrado para a
              direita: o "por que" e a quantidade formam um bloco contíguo, em
              vez de ficarem separados por um vão no meio da linha.
            */}
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "stretch", gap: "0.5rem", marginLeft: "auto", flexShrink: 0 }}>
            {(() => {
              /*
               * Só canais que aparecem nos dados: os critérios de Google ficavam
               * visíveis por causa de valores herdados no cadastro de Metas, para
               * uma rede que não é sincronizada — três cards de ruído por
               * categoria, e o que sobrava não caberia em uma linha.
               */
              const cards = PLATFORM_LABELS.filter(p => (funnel.platforms?.[p.key] || 0) > 0)
                .flatMap(p =>
                  platformCriteria(funnel.rules?.[p.key]).map((c, i) => ({ platform: p, criterion: c, key: `${p.key}-${i}` }))
                );

              if (cards.length === 0) {
                return (
                  <div style={{ ...HEADER_CARD_STYLE, minWidth: "215px" }}>
                    <span style={CARD_LABEL_STYLE}>Como entra aqui</span>
                    <span style={{ ...CARD_VALUE_STYLE, fontWeight: 500, color: "var(--muted)" }}>
                      Sem exigência definida
                    </span>
                  </div>
                );
              }

              return cards.map(({ platform, criterion, key }) => {
                const Icon = PLATFORM_ICONS[platform.key];
                return (
                  <div key={`rule-${key}`} style={HEADER_CARD_STYLE}>
                    <span style={CARD_LABEL_STYLE}>
                      <span style={{ color: platform.color, display: "flex" }}><Icon size={10} /></span>
                      {criterion.label}
                    </span>
                    <span style={CARD_VALUE_STYLE}>{criterion.value}</span>
                  </div>
                );
              });
            })()}

            {/* Contagem por canal, no mesmo card dos critérios. */}
            {PLATFORM_LABELS.filter(p => (funnel.platforms?.[p.key] || 0) > 0).map(p => {
              const Icon = PLATFORM_ICONS[p.key];
              const count = funnel.platforms[p.key];
              return (
                <div key={`count-${p.key}`} style={HEADER_CARD_STYLE}>
                  <span style={CARD_LABEL_STYLE}>
                    <span style={{ color: p.color, display: "flex" }}><Icon size={10} /></span>
                    {p.label}
                  </span>
                  <span style={CARD_VALUE_STYLE}>
                    {count} {count === 1 ? "anúncio" : "anúncios"}
                  </span>
                </div>
              );
            })}
            </div>

            {/* Recolher/expandir: só a seta. */}
            <button
              onClick={() => toggleFunnel(funnel)}
              title={isCollapsed(funnel) ? "Expandir" : "Recolher"}
              aria-label={isCollapsed(funnel) ? "Expandir categoria" : "Recolher categoria"}
              style={{ flexShrink: 0, alignSelf: "center", background: "transparent", border: "none", padding: "0.25rem", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              {isCollapsed(funnel) ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {/* Cards Grid */}
          {!isCollapsed(funnel) && funnel.validAds && funnel.validAds.length > 0 && (
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

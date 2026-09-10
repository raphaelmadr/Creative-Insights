"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "./NotificationProvider";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { CreativeCard } from "@/components/CreativeCard";
import styles from "./CreativeGrid.module.css";
import { ChevronDown, ChevronRight, HelpCircle, Info } from "lucide-react";

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
 * Os critérios de uma plataforma em frases, na ordem em que se lê a categoria.
 *
 * Frase inteira em vez de rótulo e valor: o painel responde a uma pergunta, e
 * "no mínimo R$ 2.000 de vendas aprovadas" se lê de uma vez. O nome do evento
 * acompanha a receita porque a conta tem eventos concorrentes que dão números
 * muito diferentes para o mesmo período — sem ele, o limiar não diz de qual
 * venda se trata. A tradução é fiel a `lib/creative-metrics.ts`: a receita de
 * referência é o valor dos pedidos aprovados e o CPA é o custo por pedido
 * aprovado.
 *
 * A regra é conjuntiva: as condições valem ao mesmo tempo, e um valor `0`
 * significa "não usar este critério" — por isso só entram na lista os que
 * foram realmente definidos.
 */
interface Criterion {
  /** Texto antes do limiar. */
  prefix: string;
  /** O limiar cadastrado — renderizado em destaque. */
  value: string;
  /** Texto depois do limiar. */
  suffix: string;
}

function channelCriteria(rule: any, approvedEventKey: string | null): Criterion[] {
  if (!rule) return [];
  const out: Criterion[] = [];
  if ((rule.minReturn || 0) > 0) {
    out.push({
      prefix: "no mínimo",
      value: thresholdMoney(rule.minReturn),
      suffix: `de vendas aprovadas${approvedEventKey ? ` (${approvedEventKey})` : ""}`,
    });
  }
  if ((rule.minSpend || 0) > 0) {
    out.push({ prefix: "", value: thresholdMoney(rule.minSpend), suffix: "de investimento mínimo alcançado" });
  }
  if ((rule.maxCpa || 0) > 0) {
    out.push({ prefix: "custo por venda aprovada de até", value: thresholdMoney(rule.maxCpa), suffix: "" });
  }
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
 * Canais presentes na categoria, com a contagem e as condições de cada um.
 *
 * Só canais que aparecem nos dados: os critérios de Google ficavam visíveis por
 * causa de valores herdados no cadastro de Metas, para uma rede que não é
 * sincronizada.
 */
function categoryChannels(funnel: any, approvedEventKey: string | null): { platform: { key: string; label: string; color: string }; count: number; criteria: Criterion[] }[] {
  return PLATFORM_LABELS.filter(p => (funnel.platforms?.[p.key] || 0) > 0).map(p => ({
    platform: p,
    count: funnel.platforms[p.key] as number,
    criteria: channelCriteria(funnel.rules?.[p.key], approvedEventKey),
  }));
}

/** Contagem de anúncios do canal: complemento, em badge encostado na direita. */
const COUNT_BADGE_STYLE: React.CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: "100px",
  padding: "0.12rem 0.55rem",
  fontSize: "0.68rem",
  fontWeight: 700,
  color: "var(--muted)",
  whiteSpace: "nowrap",
};

/** O limiar cadastrado é o que se vem consultar aqui — por isso sai do corpo do texto. */
const THRESHOLD_STYLE: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--primary)",
};

/** Botão de ícone da barra do cabeçalho: só o traço, sem moldura. */
const TOOLBAR_BUTTON_STYLE: React.CSSProperties = {
  flexShrink: 0,
  background: "transparent",
  border: "none",
  padding: "0.25rem",
  color: "var(--muted)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
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

  /**
   * Qual categoria está com a explicação aberta.
   *
   * O critério de entrada e a contagem por canal ocupavam uma fileira de cards
   * em cada cabeçalho — a informação é de consulta, não de leitura contínua, e
   * agora mora atrás do "?" da barra.
   */
  const [whyOpen, setWhyOpen] = useState<Record<string, boolean>>({});
  const isWhyOpen = (funnel: any) => whyOpen[funnelKey(funnel)] ?? false;
  const toggleWhy = (funnel: any) =>
    setWhyOpen(prev => ({ ...prev, [funnelKey(funnel)]: !(prev[funnelKey(funnel)] ?? false) }));

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

  /**
   * Análises de IA já salvas dos criativos que estão na tela.
   *
   * Analisar uma peça é uma decisão de quem clica; reler o que já foi analisado
   * não deveria ser — então a análise salva aparece sozinha no cartão. Vem em
   * uma requisição por lote, depois da primeira pintura e só para as categorias
   * expandidas: fora do `/api/db-ads`, que o painel inteiro espera, e fora das
   * centenas de peças que ninguém abriu.
   */
  const [savedAnalyses, setSavedAnalyses] = useState<
    Record<string, { hypothesis: string; analyzedAt: string | null }>
  >({});

  // Quais ids já foram pedidos, para o efeito não repetir o lote a cada render.
  const requestedAnalyses = React.useRef<Set<string>>(new Set());

  const visibleAnalyzedIds = useMemo(() => {
    const ids: string[] = [];
    for (const funnel of funnels) {
      if (isCollapsed(funnel)) continue;
      for (const ad of funnel.validAds ?? []) {
        // `aiAnalyzedAt` vem do db-ads: a data basta para saber quem tem análise.
        if (ad?.id && ad.aiAnalyzedAt) ids.push(ad.id);
      }
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnels, collapsed]);

  useEffect(() => {
    const missing = visibleAnalyzedIds.filter(id => !requestedAnalyses.current.has(id));
    if (missing.length === 0) return;

    missing.forEach(id => requestedAnalyses.current.add(id));

    let alive = true;
    // Fatias de 200 para a requisição não crescer sem limite numa categoria grande.
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));

    Promise.all(
      chunks.map(adIds =>
        fetch("/api/hypothesis/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adIds }),
        })
          .then(res => res.json())
          .then(data => data?.analyses ?? {})
          .catch(() => {
            // Falhar aqui só custa um clique no botão do cartão; libera os ids
            // para uma nova tentativa em vez de derrubar a grade.
            adIds.forEach(id => requestedAnalyses.current.delete(id));
            return {};
          })
      )
    ).then(parts => {
      if (!alive) return;
      const merged = Object.assign({}, ...parts);
      if (Object.keys(merged).length > 0) {
        setSavedAnalyses(prev => ({ ...prev, ...merged }));
      }
    });

    return () => {
      alive = false;
    };
  }, [visibleAnalyzedIds]);


  if (loading && !data) return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {[1,2,3].map(i => <Skeleton key={i} width="100%" height="150px" borderRadius="12px" />)}
    </div>
  );

  if (!data) return <div>Erro ao carregar os dados.</div>;

  const allCollapsed = funnels.length > 0 && funnels.every((f: any) => isCollapsed(f));

  /*
   * O evento que define "venda aprovada" nos critérios — o mesmo que a API usa
   * para categorizar. Vem dos dados, e não fixo no código, porque é trocável.
   */
  const approvedEventKey: string | null = data?.conversions?.cpa?.key ?? null;

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
              {hideOldAds
                ? " A contagem abaixo mostra só os anúncios que estrearam dentro do período; desligue o filtro de lançamento para ver todos os que tiveram veiculação."
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
            Uma linha só: identidade da categoria e a barra de ações. O critério
            de entrada e a contagem por canal saíram da linha — eram uma fileira
            de cards por cabeçalho, e viraram o painel do "?", que abre abaixo
            desta linha.
          */}
          <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "0.5rem" }}>

            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexShrink: 0 }}>
              <div style={{ fontSize: "1.15rem", width: "34px", height: "34px", borderRadius: "8px", background: "var(--background-main)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {funnel.emoji || "📁"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }}>{funnel.name}</h3>
                {/*
                  O que este número conta depende do filtro de lançamento: com
                  ele ligado são só as peças que estrearam dentro do intervalo,
                  o que fazia o total parecer baixo demais sem explicar por quê.
                */}
                <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {funnel.adsCount} {funnel.adsCount === 1 ? "anúncio" : "anúncios"}{" "}
                  {hideOldAds ? "lançado" : "veiculado"}{funnel.adsCount === 1 ? "" : "s"} neste período
                </span>
              </div>
            </div>

            {/*
              Barra de ações da categoria: o "por que" atrás de um "?" e a seta
              de recolher. Antes esta ponta da linha carregava um card por
              condição de cada canal mais um por contagem — até nove blocos numa
              categoria, que só caíam numa linha porque a fileira rolava.
            */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.15rem", marginLeft: "auto", flexShrink: 0 }}>
              <button
                onClick={() => toggleWhy(funnel)}
                title="Por que os anúncios estão aqui?"
                aria-label="Por que os anúncios estão aqui?"
                aria-expanded={isWhyOpen(funnel)}
                style={{ ...TOOLBAR_BUTTON_STYLE, color: isWhyOpen(funnel) ? "var(--primary)" : "var(--muted)" }}
              >
                <HelpCircle size={16} />
              </button>

              <button
                onClick={() => toggleFunnel(funnel)}
                title={isCollapsed(funnel) ? "Expandir" : "Recolher"}
                aria-label={isCollapsed(funnel) ? "Expandir categoria" : "Recolher categoria"}
                style={TOOLBAR_BUTTON_STYLE}
              >
                {isCollapsed(funnel) ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
          </div>

          {/*
            A resposta do "?": por canal, quantos anúncios estão aqui e as
            condições que os trouxeram. Abre no fluxo do cartão, e não num
            balão — a linha do cabeçalho é estreita e um balão ficaria cortado.
          */}
          {isWhyOpen(funnel) && (() => {
            const channels = categoryChannels(funnel, approvedEventKey);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", background: "var(--background-main)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0.85rem 0.95rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Por que os anúncios estão aqui?
                </span>

                <span style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.55 }}>
                  Anúncios estão nesta categoria porque seguem critérios pré-definidos de investimento,
                  receita líquida e CPA, que são definidos mensalmente nas reuniões de planejamento do mês.
                </span>

                {channels.length === 0 ? (
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    Nenhum canal com anúncios nesta categoria no período.
                  </span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.15rem", paddingTop: "0.6rem", borderTop: "1px solid var(--card-border)" }}>
                    {channels.map(({ platform, count, criteria }) => {
                      const Icon = PLATFORM_ICONS[platform.key];
                      return (
                        <div key={platform.key} style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", fontSize: "0.78rem", lineHeight: 1.55 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }}>
                            <span style={{ color: platform.color, display: "flex" }}><Icon size={11} /></span>
                            {platform.label}
                          </span>

                          {/* Os números cadastrados em destaque; o texto ao redor só os situa. */}
                          <span style={{ flex: 1, minWidth: 0, color: "var(--muted)" }}>
                            {criteria.length === 0
                              ? "nenhum critério definido para este canal"
                              : criteria.map((c, i) => (
                                  <span key={`${platform.key}-${i}`}>
                                    {i > 0 && <span style={{ color: "var(--card-border)" }}>{" · "}</span>}
                                    {c.prefix ? `${c.prefix} ` : ""}
                                    <span style={THRESHOLD_STYLE}>{c.value}</span>
                                    {c.suffix ? ` ${c.suffix}` : ""}
                                  </span>
                                ))}
                          </span>

                          {/* Complemento, e não a resposta: fora do caminho da frase dos critérios. */}
                          <span style={COUNT_BADGE_STYLE}>
                            {count} {count === 1 ? "anúncio" : "anúncios"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Cards Grid */}
          {!isCollapsed(funnel) && funnel.validAds && funnel.validAds.length > 0 && (
            <div className={styles.grid} style={{ marginTop: "0.5rem" }}>
              {funnel.validAds.map((c: any) => (
                <CreativeCard
                  key={c.id}
                  creative={c}
                  creators={creators}
                  savedAnalysis={savedAnalyses[c.id]}
                />
              ))}
            </div>
          )}

        </div>
      ))}
    </div>
  );
}

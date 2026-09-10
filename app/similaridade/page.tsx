"use client";

import React, { useEffect, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import CustomDateRangePicker from "@/components/CustomDateRangePicker";
import ReactMarkdown from "react-markdown";
import { 
  Network, 
  AlertTriangle, 
  PlayCircle, 
  EyeOff, 
  LayoutGrid, 
  CheckCircle2, 
  Loader2, 
  Tag, 
  ShieldAlert,
  Sparkles,
  Calendar,
  ChevronDown,
  Info
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { SimilarityCreativeCard } from "@/components/SimilarityCreativeCard";
import { FINDING_LABELS, type Finding } from "@/lib/similarity-findings";
import styles from "./Similaridade.module.css";

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

/**
 * As peças do grupo separadas pela categoria de performance em que estão.
 *
 * Os baldes saem na hierarquia declarada no painel — Prime Winners primeiro,
 * Testando por último —, e não na ordem em que as peças aparecem no grupo: é a
 * escala de resultado que a equipe lê, e ela precisa ser a mesma toda vez.
 * Peça sem categoria vai para o fim, porque é ausência de dado e não um degrau
 * da escala.
 */
function groupByCategory(creatives: SimilarCreative[]) {
  const SEM_CATEGORIA = "Sem categoria";
  const buckets = new Map<
    string,
    { name: string; color: string | null; order: number; creatives: SimilarCreative[] }
  >();

  for (const creative of creatives) {
    const name = creative.categoryName || SEM_CATEGORIA;
    if (!buckets.has(name)) {
      buckets.set(name, {
        name,
        color: creative.categoryColor ?? null,
        order: creative.categoryName ? creative.categoryIndex ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
        creatives: [],
      });
    }
    buckets.get(name)!.creatives.push(creative);
  }

  const ordered = Array.from(buckets.values());
  // Dentro de cada balde, quem recebeu mais verba primeiro.
  ordered.forEach(b => b.creatives.sort((a, c) => c.spend - a.spend));

  return ordered.sort(
    (a, b) =>
      a.order - b.order ||
      Number(a.name === SEM_CATEGORIA) - Number(b.name === SEM_CATEGORIA) ||
      a.name.localeCompare(b.name)
  );
}

/**
 * As categorias das peças que disputaram a verba — não as do grupo inteiro.
 *
 * É a leitura estratégica: "dois Winners parecidos dividindo verba" diz algo;
 * "este grupo contém Winners, Testando, Validando e Recém Lançados" não diz
 * nada, porque a cauda que o algoritmo não entregou não estava na disputa.
 */
function competingCategories(group: Group): string[] {
  if (!group.finding) return [];
  const names = [group.finding.leader, ...group.finding.trailing]
    .map(c => c.categoryName)
    .filter((name): name is string => !!name);
  return Array.from(new Set(names));
}

/** A peça que ficou com a maior fatia da verba do grupo. */
function leaderId(group: Group): string | null {
  let leader: SimilarCreative | null = null;
  for (const creative of group.creatives) {
    if (!leader || creative.spend > leader.spend) leader = creative;
  }
  return leader?.id ?? null;
}

/** O algoritmo por trás da entrega do grupo, escrito como a equipe fala dele. */
function platformLabel(platform: string): string {
  const key = (platform || "META").toUpperCase();
  if (key === "TIKTOK") return "TikTok · algoritmo de entrega";
  if (key === "GOOGLE") return "Google · algoritmo de entrega";
  return "Meta · Andromeda";
}

/** Versão curta, para os selos sobre a imagem. */
function platformShort(platform: string): string {
  const key = (platform || "META").toUpperCase();
  return key === "TIKTOK" ? "TIKTOK" : key === "GOOGLE" ? "GOOGLE" : "META";
}

const PRESET_LABELS: Record<string, string> = {
  today: "de hoje",
  yesterday: "de ontem",
  "7_days": "dos últimos 7 dias",
  "15_days": "dos últimos 15 dias",
  this_month: "do mês atual",
  custom: "do período selecionado"
};

type SimilarCreative = {
  id: string;
  adName: string;
  campaignName: string;
  imageUrl: string;
  videoUrl?: string | null;
  mediaType?: string | null;
  designer?: string | null;
  platform?: string | null;
  /** Categoria de performance da peça, decidida pelos mesmos critérios da home. */
  categoryName?: string | null;
  categoryColor?: string | null;
  /** Posição da categoria na hierarquia do painel: 0 é a de melhor resultado. */
  categoryIndex?: number | null;
  spend: number;
  roas: number;
  ctr: number;
  cpm: number;
  purchases: number;
  reach?: number;
  frequency?: number;
};

type Group = {
  reason: string;
  sharedTags: string[];
  /** Um grupo é sempre de um canal só: verba do Meta não disputa com a do TikTok. */
  platform: string;
  totalSpend: number;
  cannibalizationRate: number;
  isCannibalized: boolean;
  /** O diagnóstico do grupo, calculado na API a partir da distribuição. */
  finding: Finding | null;
  aiInsight?: string;
  /** Quantas peças do grupo entraram na análise, para o critério ficar auditável. */
  aiAnalyzedCount?: number;
  creatives: SimilarCreative[];
};

export default function SimilaridadePage() {
  const [analyzingGroupId, setAnalyzingGroupId] = useState<number | null>(null);

  const [dateFrom, setDateFrom] = useState<string>(() => {
    const today = todayUTC();
    const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return toDateInputValue(firstDay);
  });
  const [dateTo, setDateTo] = useState<string>(() => toDateInputValue(todayUTC()));
  const [datePreset, setDatePreset] = useState("this_month");

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = todayUTC();
    if (preset === "today") {
      setDateFrom(toDateInputValue(today));
      setDateTo(toDateInputValue(today));
    } else if (preset === "yesterday") {
      setDateFrom(toDateInputValue(daysAgoUTC(1)));
      setDateTo(toDateInputValue(daysAgoUTC(1)));
    } else if (preset === "7_days") {
      setDateFrom(toDateInputValue(daysAgoUTC(7)));
      setDateTo(toDateInputValue(today));
    } else if (preset === "15_days") {
      setDateFrom(toDateInputValue(daysAgoUTC(15)));
      setDateTo(toDateInputValue(today));
    } else if (preset === "this_month") {
      const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      setDateFrom(toDateInputValue(firstDay));
      setDateTo(toDateInputValue(today));
    }
  };

  const url = `/api/similaridade?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const { data: fetchRes, setData: setFetchRes, loading } = useCacheFetch<any>(url);
  const allGroups: Group[] = fetchRes?.success ? fetchRes.groups : [];

  /*
   * Filtro de canal.
   *
   * Os grupos são ordenados por canibalização, e os de "Imagens Idênticas" —
   * concentração de 80% a 89% — são hoje todos do TikTok. Eles tomavam a
   * primeira tela inteira e os grupos do Meta ficavam abaixo, dando a impressão
   * de que a página só puxava um canal.
   */
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");

  // Fechado por padrão: a página abre como uma lista de achados, e as peças de
  // cada um entram sob demanda. Ver 30 grades de cartões de uma vez era o "bolo".
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const countByPlatform = allGroups.reduce<Record<string, number>>((acc, group) => {
    const key = (group.platform || "META").toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const groups =
    platformFilter === "ALL"
      ? allGroups
      : allGroups.filter(g => (g.platform || "META").toUpperCase() === platformFilter);

  const handleAnalyzeWithAI = async (groupIndex: number, group: Group) => {
    setAnalyzingGroupId(groupIndex);
    try {
      const res = await fetch("/api/similaridade/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group })
      });
      const data = await res.json();
      
      if (data.success) {
        setFetchRes((prev: any) => {
          if (!prev) return prev;
          const newGroups = [...prev.groups];
          newGroups[groupIndex].aiInsight = data.aiInsight;
          newGroups[groupIndex].aiAnalyzedCount = data.analyzedCount;
          return { ...prev, groups: newGroups };
        });
      } else {
        alert("Erro ao analisar com IA: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar com a IA.");
    } finally {
      setAnalyzingGroupId(null);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      {/* Mesma medida das outras telas: a largura do container é da classe
          `dashboard-container`, não de um número solto por página. */}
      <div className="dashboard-container" style={{ flexDirection: "column" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }} className="lowercase-title">
              <Network size={32} color="var(--primary)" />
              análise de similaridade de criativos<span className="dot-green">.</span>
            </h1>
            <p style={{ opacity: 0.7, marginTop: "0.5rem", maxWidth: 800, lineHeight: 1.6 }}>
              Entenda como o algoritmo de cada canal escolheu entre seus anúncios parecidos. Meta (Andromeda) e TikTok concentram a entrega em uma peça e preterem as demais quando as considera variações da mesma coisa — aqui você vê onde isso aconteceu e por quê.
              {groups.length > 0 && <span> Encontramos <strong>{groups.length} grupos</strong> com verba disputada entre peças concorrentes.</span>}
            </p>

            {allGroups.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
                {[
                  { key: "ALL", label: "Todos os canais", count: allGroups.length },
                  { key: "META", label: "Meta · Andromeda", count: countByPlatform.META || 0 },
                  { key: "TIKTOK", label: "TikTok", count: countByPlatform.TIKTOK || 0 },
                ]
                  .filter(tab => tab.key === "ALL" || tab.count > 0)
                  .map(tab => {
                    const active = platformFilter === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setPlatformFilter(tab.key)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "0.4rem",
                          background: active ? "var(--primary)" : "var(--card-bg)",
                          color: active ? "#fff" : "var(--foreground)",
                          border: `1px solid ${active ? "var(--primary)" : "var(--card-border)"}`,
                          borderRadius: "100px", padding: "0.3rem 0.75rem",
                          fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s"
                        }}
                      >
                        {tab.label}
                        <span style={{ opacity: 0.7, fontWeight: 700 }}>{tab.count}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", background: "var(--card-bg)", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--foreground)", opacity: 0.8 }}>
              <Calendar size={16} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <select
                value={datePreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{
                  border: "none", background: "transparent", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", 
                  color: "var(--foreground)", outline: "none", appearance: "none", paddingRight: "1rem"
                }}
              >
                <option value="today">Dia atual</option>
                <option value="yesterday">Dia anterior</option>
                <option value="7_days">Últimos 7 dias</option>
                <option value="15_days">Últimos 15 dias</option>
                <option value="this_month">Mês atual</option>
                {/* <option value="custom">Outro período...</option> */}
              </select>
              
              <ChevronDown size={14} style={{ marginLeft: "-1.5rem", pointerEvents: "none", opacity: 0.6 }} />

              {datePreset === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ width: "1px", height: "16px", background: "var(--card-border)", margin: "0 0.5rem" }} />
                  <CustomDateRangePicker
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    maxDate={toDateInputValue(todayUTC())}
                    onChange={(from, to) => {
                      setDateFrom(from);
                      setDateTo(to);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div className="glass-panel" style={{ padding: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "flex-start", borderLeft: "4px solid var(--danger)" }}>
            <EyeOff color="var(--danger)" style={{ flexShrink: 0, marginTop: "0.2rem" }} />
            <div>
              <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--foreground)" }}>1. Mudar apenas a cor não funciona</strong>
              <p style={{ fontSize: "0.85rem", opacity: 0.7, margin: 0, lineHeight: 1.4 }}>Se você alterar apenas a cor de fundo ou um pequeno texto, o Meta vai perceber que é o mesmo anúncio e vai parar de entregar um deles.</p>
            </div>
          </div>
          <div className="glass-panel" style={{ padding: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "flex-start", borderLeft: "4px solid var(--primary)" }}>
            <LayoutGrid color="var(--primary)" style={{ flexShrink: 0, marginTop: "0.2rem" }} />
            <div>
              <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--foreground)" }}>2. Crie variações de verdade</strong>
              <p style={{ fontSize: "0.85rem", opacity: 0.7, margin: 0, lineHeight: 1.4 }}>Para testar de verdade, varie o "Coração" do criativo: o ambiente, a pessoa em cena, ou a emoção principal do vídeo.</p>
            </div>
          </div>
          <div className="glass-panel" style={{ padding: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "flex-start", borderLeft: "4px solid var(--warning)" }}>
            <PlayCircle color="var(--warning)" style={{ flexShrink: 0, marginTop: "0.2rem" }} />
            <div>
              <strong style={{ display: "block", marginBottom: "0.25rem", color: "var(--foreground)" }}>3. Qualidade vale mais que Quantidade</strong>
              <p style={{ fontSize: "0.85rem", opacity: 0.7, margin: 0, lineHeight: 1.4 }}>É melhor fazer 5 anúncios completamente diferentes do que fazer 30 anúncios onde apenas a cor ou a fonte mudam.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-panel" style={{ overflow: "hidden", border: "1px solid var(--card-border)" }}>
                <div style={{ background: "rgba(255,255,255,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--card-border)" }}>
                  <Skeleton width="300px" height="24px" />
                  <Skeleton width="150px" height="24px" borderRadius="100px" />
                </div>
                <div style={{ padding: "1.5rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
                    {[1, 2, 3].map(j => (
                       <div key={j} style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--card-border)" }}>
                          <div style={{ display: "flex", gap: "1rem" }}>
                            <Skeleton width="80px" height="80px" borderRadius="8px" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                              <Skeleton width="100%" height="16px" />
                              <Skeleton width="60%" height="16px" />
                              <Skeleton width="100%" height="30px" borderRadius="6px" style={{ marginTop: "0.5rem" }} />
                            </div>
                          </div>
                       </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="glass-panel" style={{ padding: "4rem 2rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <CheckCircle2 color="var(--success)" size={48} style={{ marginBottom: "1rem" }} />
            <h3 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Tudo limpo!</h3>
            <p style={{ opacity: 0.7 }}>Sua operação está produzindo diversidade criativa real (nenhum clone visual travando sua entrega).</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            {groups.map((group, idx) => (
              <div key={idx} className="glass-panel" style={{ overflow: "hidden", border: group.isCannibalized ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--card-border)" }}>
                
{/*
                  O cabeçalho é o achado: o que está acontecendo, por que o
                  algoritmo fez isso e o que a criação faz a respeito. Antes ele
                  nomeava o sintoma — "Concorrência Alta" — e deixava as três
                  perguntas para quem lia.
                */}
                <div
                  style={{
                    background: group.finding?.urgent ? "rgba(239, 68, 68, 0.05)" : "rgba(0,0,0,0.03)",
                    padding: "1.25rem 1.5rem",
                    borderBottom: "1px solid var(--card-border)",
                    display: "flex", flexDirection: "column", gap: "0.85rem"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    {group.finding?.urgent
                      ? <ShieldAlert size={17} color="var(--danger)" style={{ flexShrink: 0 }} />
                      : <AlertTriangle size={17} color="var(--warning)" style={{ flexShrink: 0 }} />}

                    <strong style={{ fontSize: "0.9rem", color: group.finding?.urgent ? "var(--danger)" : "var(--warning)" }}>
                      {group.finding ? FINDING_LABELS[group.finding.kind] : "Anúncios parecidos"}
                    </strong>

                    <span style={{ opacity: 0.35 }}>·</span>
                    <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>{platformLabel(group.platform)}</span>

                    {/* As categorias das peças que de fato disputaram a verba. */}
                    {competingCategories(group).map(name => (
                      <span
                        key={name}
                        style={{
                          background: "var(--primary-glow)", color: "var(--primary)",
                          padding: "0.12rem 0.5rem", borderRadius: "100px",
                          fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px"
                        }}
                      >
                        {name}
                      </span>
                    ))}

                    {group.finding && (
                      <span style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 700, opacity: 0.8, whiteSpace: "nowrap" }}>
                        {formatCurrency(group.finding.fragmentedSpend)} fragmentados
                      </span>
                    )}
                  </div>

                  {group.finding && (
                    <>
                      <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, fontWeight: 600 }}>
                        {group.finding.headline}
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.82rem", lineHeight: 1.55 }}>
                        <p style={{ margin: 0, opacity: 0.8 }}>
                          <strong style={{ opacity: 0.9 }}>Por que:</strong> {group.finding.why}
                        </p>
                        <p style={{ margin: 0, padding: "0.6rem 0.75rem", borderLeft: "3px solid var(--primary)", background: "var(--primary-glow)", borderRadius: "0 6px 6px 0" }}>
                          <strong style={{ color: "var(--primary)" }}>Ação:</strong> {group.finding.action}
                        </p>
                      </div>
                    </>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.35rem",
                        background: "var(--card-bg)", color: "var(--foreground)",
                        border: "1px solid var(--card-border)", borderRadius: "8px",
                        padding: "0.45rem 0.85rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer"
                      }}
                    >
                      {expanded[idx] ? "Ocultar peças" : `Ver as ${group.creatives.length} peças`}
                      <ChevronDown size={13} style={{ transform: expanded[idx] ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                    </button>

                    {group.sharedTags && group.sharedTags.length > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.7rem", opacity: 0.55 }}>
                        <Tag size={12} />
                        {group.sharedTags.slice(0, 4).join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ padding: "0 1.5rem 1.25rem" }}>

                  {group.aiInsight ? (
                    <div style={{ marginBottom: "1.5rem", background: "rgba(239,68,68,0.05)", border: "1px dashed rgba(239,68,68,0.3)", borderRadius: "8px", padding: "1rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                      <Sparkles color="var(--primary)" size={24} style={{ flexShrink: 0 }} />
                      <div>
                        <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <strong className="gradient-text">Leitura do algoritmo (IA):</strong>{" "}
                          {group.aiAnalyzedCount
                            ? `${group.aiAnalyzedCount} de ${group.creatives.length} peças analisadas — as que concentraram a verba.`
                            : "Análise concluída."}{" "}
                        </p>
                        <div className="prose prose-invert max-w-none" style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8, lineHeight: 1.5 }}>
                          <ReactMarkdown>{group.aiInsight}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                      <button 
                        onClick={() => handleAnalyzeWithAI(idx, group)}
                        disabled={analyzingGroupId === idx}
                        style={{
                          background: "var(--card-bg)",
                          color: "var(--foreground)",
                          border: "1px solid var(--card-border)",
                          borderRadius: "8px",
                          padding: "0.5rem 1rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          cursor: analyzingGroupId === idx ? "not-allowed" : "pointer",
                          opacity: analyzingGroupId === idx ? 0.7 : 1,
                          transition: "all 0.2s"
                        }}
                        onMouseOver={(e) => {
                          if (analyzingGroupId !== idx) {
                            e.currentTarget.style.borderColor = "var(--primary)";
                            e.currentTarget.style.color = "var(--primary)";
                          }
                        }}
                        onMouseOut={(e) => {
                          if (analyzingGroupId !== idx) {
                            e.currentTarget.style.borderColor = "var(--card-border)";
                            e.currentTarget.style.color = "var(--foreground)";
                          }
                        }}
                      >
                        {analyzingGroupId === idx ? (
                          <>
                            <Loader2 size={16} className="spin" style={{ animation: "spin 2s linear infinite" }} />
                            Analisando imagens...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            Analisar Imagens com IA
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/*
                    Dentro do grupo, as peças saem separadas pela categoria de
                    performance em que estão. É a leitura que a página devia
                    entregar: ver que quem sugou a verba é um Prime Winner, e
                    que a peça preterida está em Testando, diz muito mais do que
                    ver as duas lado a lado sem contexto de resultado.
                  */}
                  {expanded[idx] && groupByCategory(group.creatives).map(bucket => {
                    // O líder é do grupo, não do balde: calculado uma vez aqui.
                    const groupLeaderId = leaderId(group);

                    return (
                    <div key={bucket.name} style={{ marginBottom: "1.75rem" }}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: "0.6rem",
                          marginBottom: "0.75rem", paddingBottom: "0.4rem",
                          borderBottom: "1px solid var(--card-border)"
                        }}
                      >
                        <span
                          style={{
                            width: "8px", height: "8px", borderRadius: "100px", flexShrink: 0,
                            background: bucket.color || "var(--muted)"
                          }}
                        />
                        <strong style={{ fontSize: "0.85rem", color: bucket.color || "var(--foreground)" }}>
                          {bucket.name}
                        </strong>
                        <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>
                          {bucket.creatives.length} {bucket.creatives.length === 1 ? "peça" : "peças"} ·{" "}
                          {formatCurrency(bucket.creatives.reduce((acc, c) => acc + c.spend, 0))}
                        </span>
                      </div>

                      <div className={styles.grid}>
                        {bucket.creatives.map(creative => {
                          const shareOfSpend = group.totalSpend > 0 ? creative.spend / group.totalSpend : 0;
                          const isLeader = creative.id === groupLeaderId;

                          /*
                           * Os dois selos só fazem sentido onde houve
                           * canibalização: num grupo de verba bem repartida, a
                           * peça de maior fatia não "sugou" nada, e a de menor
                           * não foi ignorada.
                           */
                          const sucked = isLeader && group.isCannibalized;
                          const isIgnored = !isLeader && group.isCannibalized && shareOfSpend < 0.05;

                          return (
                            <SimilarityCreativeCard
                              key={creative.id}
                              creative={creative}
                              shareOfSpend={shareOfSpend}
                              isLeader={sucked}
                              isIgnored={isIgnored}
                              platformShort={platformShort(group.platform)}
                            />
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

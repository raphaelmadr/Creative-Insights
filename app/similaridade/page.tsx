"use client";

import React, { useEffect, useState, useCallback } from "react";
import TopBar from "@/components/TopBar";
import CustomDatePicker from "@/components/CustomDatePicker";
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
  Ghost,
  Sparkles,
  Calendar,
  ChevronDown
} from "lucide-react";
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
  spend: number;
  roas: number;
  ctr: number;
  cpm: number;
  purchases: number;
};

type Group = {
  reason: string;
  sharedTags: string[];
  totalSpend: number;
  cannibalizationRate: number;
  isCannibalized: boolean;
  aiInsight?: string;
  creatives: SimilarCreative[];
};

export default function SimilaridadePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchGroups = useCallback(() => {
    setLoading(true);
    fetch(`/api/similaridade?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setGroups(data.groups);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

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
        setGroups(prev => {
          const newGroups = [...prev];
          newGroups[groupIndex].aiInsight = data.aiInsight;
          return newGroups;
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
      <div style={{ padding: "2rem", display: "flex", flexDirection: "column", flex: 1, maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "2rem" }} className="gradient-text">
              <Network size={28} color="var(--primary)" />
              Análise de Similaridade de Criativos
            </h1>
            <p style={{ opacity: 0.7, marginTop: "0.5rem", maxWidth: 800, lineHeight: 1.6 }}>
              Descubra se seus anúncios estão muito parecidos visualmente. O Meta bloqueia a entrega de anúncios muito semelhantes. Veja quais grupos estão concorrendo entre si.
              {groups.length > 0 && <span> Encontramos <strong>{groups.length} grupos</strong> concorrendo entre si.</span>}
            </p>
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
                <option value="custom">Outro período...</option>
              </select>
              
              <ChevronDown size={14} style={{ marginLeft: "-1.5rem", pointerEvents: "none", opacity: 0.6 }} />

              {datePreset === "custom" && (
                <>
                  <div style={{ width: "1px", height: "16px", background: "var(--card-border)", margin: "0 0.5rem" }} />
                  <CustomDatePicker
                    value={dateFrom}
                    max={dateTo}
                    onChange={(newDate) => setDateFrom(newDate)}
                  />
                  <span style={{ opacity: 0.5, fontSize: "0.75rem", fontWeight: 500 }}>até</span>
                  <CustomDatePicker
                    value={dateTo}
                    min={dateFrom}
                    max={toDateInputValue(todayUTC())}
                    onChange={(newDate) => setDateTo(newDate)}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6rem 2rem", opacity: 0.8, gap: "1.5rem" }}>
            <Loader2 size={48} color="var(--primary)" className="spin" style={{ animation: "spin 2s linear infinite" }} />
            <h2 style={{ fontSize: "1.5rem", fontWeight: 500, margin: 0 }}>Buscando anúncios concorrentes...</h2>
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
                
                <div style={{ background: group.isCannibalized ? "rgba(239, 68, 68, 0.05)" : "rgba(0,0,0,0.03)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--card-border)", flexWrap: "wrap", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.1rem", color: group.isCannibalized ? "var(--danger)" : "var(--warning)" }}>
                      {group.isCannibalized ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
                      {group.isCannibalized ? "Concorrência Alta (Sugando a verba)" : "Anúncios Muito Parecidos"}
                    </h3>
                    
                    <span style={{ background: "rgba(255,255,255,0.1)", padding: "0.3rem 0.8rem", borderRadius: "100px", fontSize: "0.75rem", fontWeight: 600, border: "1px solid rgba(255,255,255,0.1)" }}>
                      Criativos Concorrendo Entre Si
                    </span>
                  </div>

                  {group.sharedTags && group.sharedTags.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Tag size={14} style={{ opacity: 0.5 }} />
                      <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Tags Semelhantes no Nome:</span>
                      {group.sharedTags.map((tag, i) => (
                        <span key={`${tag}-${i}`} style={{ background: "var(--primary-glow)", color: "var(--primary)", padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ padding: "1.5rem" }}>
                  
                  {group.aiInsight ? (
                    <div style={{ marginBottom: "1.5rem", background: "rgba(239,68,68,0.05)", border: "1px dashed rgba(239,68,68,0.3)", borderRadius: "8px", padding: "1rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                      <Sparkles color="var(--primary)" size={24} style={{ flexShrink: 0 }} />
                      <div>
                        <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <strong className="gradient-text">Insight do Diretor de Arte (IA):</strong> Análise de similaridade visual concluída. 
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

                  <div className={styles.grid}>
                    {group.creatives.map((creative, index) => {
                      const isWinner = index === 0 && group.isCannibalized;
                      const shareOfSpend = group.totalSpend > 0 ? (creative.spend / group.totalSpend) : 0;
                      const isKilledAtSource = !isWinner && shareOfSpend < 0.05 && group.isCannibalized;
                      
                      return (
                        <div key={creative.id} className={styles.creativeCard} style={{ borderColor: isWinner ? "rgba(39, 174, 96, 0.4)" : (isKilledAtSource ? "rgba(239, 68, 68, 0.4)" : "var(--card-border)"), position: "relative" }}>
                          
                          {isWinner && (
                            <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "var(--primary)", color: "#fff", padding: "0.25rem 0.75rem", borderRadius: "100px", fontSize: "0.7rem", fontWeight: "bold", zIndex: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}>
                              SUGOU A VERBA
                            </div>
                          )}

                          {isKilledAtSource && (
                            <div style={{ position: "absolute", top: "0.5rem", left: "0.5rem", background: "var(--danger)", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "100px", fontSize: "0.65rem", fontWeight: "bold", zIndex: 10, boxShadow: "0 2px 10px rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                              <Ghost size={12} /> IGNORADO PELO META
                            </div>
                          )}

                          <div className={styles.imageContainer}>
                            {creative.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img 
                                src={creative.imageUrl} 
                                alt={creative.adName} 
                                style={{ 
                                  width: "100%", 
                                  height: "180px", 
                                  objectFit: "cover", 
                                  display: "block", 
                                  opacity: isKilledAtSource ? 0.4 : (isWinner ? 1 : 0.7),
                                  filter: isKilledAtSource ? "grayscale(100%)" : "none"
                                }}
                              />
                            ) : (
                              <div style={{ width: "100%", height: "180px", background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                                Sem imagem
                              </div>
                            )}
                            
                            {/* Share of Spend Progress Bar */}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "4px", background: "rgba(0,0,0,0.5)" }}>
                              <div style={{ height: "100%", background: isWinner ? "var(--primary)" : (isKilledAtSource ? "var(--danger)" : "var(--warning)"), width: `${shareOfSpend * 100}%` }} />
                            </div>
                          </div>
                          
                          <div style={{ padding: "1.25rem", opacity: isKilledAtSource ? 0.6 : 1 }}>
                            <p style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600, margin: "0 0 0.5rem 0", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", textTransform: "uppercase", letterSpacing: "0.05em" }} title={creative.campaignName}>
                              {creative.campaignName}
                            </p>
                            <h4 style={{ margin: "0 0 1.25rem 0", fontSize: "0.95rem", lineHeight: 1.4, color: "var(--foreground)" }} title={creative.adName}>
                              {creative.adName}
                            </h4>
                            
                            <div className={styles.metricsGrid}>
                              <div>
                                <span className={styles.metricLabel}>Fatia de Gasto</span>
                                <span className={styles.metricValue} style={{ color: isWinner ? "var(--primary)" : (isKilledAtSource ? "var(--danger)" : "inherit") }}>
                                  {(shareOfSpend * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div>
                                <span className={styles.metricLabel}>Gasto Real</span>
                                <span className={styles.metricValue}>{formatCurrency(creative.spend)}</span>
                              </div>
                              <div>
                                <span className={styles.metricLabel}>ROAS</span>
                                <span className={styles.metricValue}>{creative.roas.toFixed(2)}x</span>
                              </div>
                              <div>
                                <span className={styles.metricLabel}>Compras</span>
                                <span className={styles.metricValue}>{creative.purchases}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

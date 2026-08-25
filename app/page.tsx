"use client";

import TopBar from "@/components/TopBar";
import CreativeView from "@/components/CreativeView";
import CustomDatePicker from "@/components/CustomDatePicker";
import { useEffect, useState } from "react";
import { useNotifications } from "@/components/NotificationProvider";
import { Sparkles, Loader2, Calendar, ChevronDown, Users } from "lucide-react";

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

function formatCurrencyBR(value: string): string {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentBR(value: string): string {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return "0,00%";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default function Home() {
  const [metrics, setMetrics] = useState<{ totalSpend: string; totalRiskApprovedValue: string; totalGrossValue: string; avgCtr: string; avgCpa: string }>({ totalSpend: "0.00", totalRiskApprovedValue: "0.00", totalGrossValue: "0.00", avgCtr: "0.00", avgCpa: "0.00" });
  const { analyzeCampaigns, isSearching, loadingText } = useNotifications();

  const [dateFrom, setDateFrom] = useState<string>(() => {
    const today = todayUTC();
    const firstDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return toDateInputValue(firstDay);
  });
  const [dateTo, setDateTo] = useState<string>(() => toDateInputValue(todayUTC()));
  const [datePreset, setDatePreset] = useState("this_month");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedDesigner, setSelectedDesigner] = useState<string | null>(null);
  const [creators, setCreators] = useState<any[]>([]);
  const [hideOldAds, setHideOldAds] = useState(true);

  useEffect(() => {
    fetch("/api/creators")
      .then(res => res.json())
      .then(json => {
        if (json.data) setCreators(json.data.filter((c: any) => c.active));
      })
      .catch(err => console.error("Erro ao carregar criadores:", err));
  }, []);

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

  // Data will be fetched and emitted by CreativeView

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <div className="dashboard-container">
        <section style={{ flex: 3, display: "flex", flexDirection: "column", gap: "2rem", width: "100%", overflowX: "hidden" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <h1 style={{ fontSize: "2.5rem", fontWeight: 800, margin: 0, wordBreak: "break-word" }} className="lowercase-title">
                dashboard criativo<span className="dot-green">.</span>
              </h1>
              <div className="dashboard-filters" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              
              {/* Filtro de Criador */}
              {creators.length > 0 && (
                <div style={{ width: "160px", display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--card-bg)", padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", color: "var(--foreground)", opacity: 0.8 }}>
                    <Users size={16} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
                    <select
                      value={selectedDesigner || ""}
                      onChange={(e) => setSelectedDesigner(e.target.value || null)}
                      style={{
                        width: "100%", border: "none", background: "transparent", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", 
                        color: "var(--foreground)", outline: "none", appearance: "none", paddingRight: "1rem",
                        textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap"
                      }}
                    >
                      <option value="">Todos os Criadores</option>
                      {creators.map(c => (
                        <option key={c.acronym} value={c.acronym}>{c.name}</option>
                      ))}
                      <option value="UNKNOWN">Outros / Não Identificado</option>
                    </select>
                    <ChevronDown size={14} style={{ marginLeft: "-1rem", pointerEvents: "none", opacity: 0.6, flexShrink: 0 }} />
                  </div>
                </div>
              )}

              {/* Filtro de Status */}
              <div style={{ width: "160px", display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--card-bg)", padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)", whiteSpace: "nowrap", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", color: "var(--foreground)", opacity: 0.8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      width: "100%", border: "none", background: "transparent", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", 
                      color: "var(--foreground)", outline: "none", appearance: "none", paddingRight: "1rem",
                      textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap"
                    }}
                  >
                    <option value="ACTIVE">Apenas Ativos</option>
                    <option value="INACTIVE">Apenas Desativados</option>
                    <option value="ALL">Todos (Ativos + Desativados)</option>
                  </select>
                  <ChevronDown size={14} style={{ marginLeft: "-1rem", pointerEvents: "none", opacity: 0.6, flexShrink: 0 }} />
                </div>
              </div>

              {/* Filtro de Datas Refinado */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--card-bg)", padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)", whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", color: "var(--foreground)", opacity: 0.8, flexShrink: 0 }}>
                  <Calendar size={16} />
                </div>
                <div style={{ width: "130px", display: "flex", alignItems: "center", flexWrap: "nowrap", flexShrink: 0, overflow: "hidden" }}>
                  <select
                    value={datePreset}
                    onChange={(e) => handlePresetChange(e.target.value)}
                    style={{
                      width: "100%", border: "none", background: "transparent", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", 
                      color: "var(--foreground)", outline: "none", appearance: "none", paddingRight: "1rem",
                      textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap"
                    }}
                  >
                    <option value="today">Dia atual</option>
                    <option value="yesterday">Dia anterior</option>
                    <option value="7_days">Últimos 7 dias</option>
                    <option value="15_days">Últimos 15 dias</option>
                    <option value="this_month">Mês atual</option>
                    <option value="custom">Outro período...</option>
                  </select>
                  
                  <ChevronDown size={14} style={{ marginLeft: "-1rem", pointerEvents: "none", opacity: 0.6, flexShrink: 0 }} />
                </div>

                {datePreset === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: "1px", height: "16px", background: "var(--card-border)" }} />
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
                  </div>
                )}
              </div>

              {/* Filtro de Safra (Hide Old Ads) */}
              <div 
                onClick={() => setHideOldAds(!hideOldAds)}
                style={{ 
                  display: "flex", alignItems: "center", gap: "0.6rem", background: "var(--card-bg)", padding: "0.4rem 0.75rem", 
                  borderRadius: "8px", border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
                  fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)", flexShrink: 0, height: "36px"
                }}
              >
                <div style={{
                  width: "36px", height: "20px", borderRadius: "100px", background: hideOldAds ? "var(--primary)" : "var(--muted)", 
                  position: "relative", transition: "background 0.2s ease-in-out", opacity: hideOldAds ? 1 : 0.4
                }}>
                  <div style={{
                    position: "absolute", top: "2px", left: hideOldAds ? "18px" : "2px",
                    width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                  }} />
                </div>
                <span style={{ opacity: 0.8 }}>Apenas criativos lançados no mês</span>
              </div>


              <button 
                onClick={() => analyzeCampaigns(dateFrom, dateTo)} 
                disabled={isSearching}
                title="Analisar todas as campanhas com IA"
                style={{
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: isSearching ? "not-allowed" : "pointer",
                  opacity: isSearching ? 0.7 : 1,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "var(--primary-hover)"}
                onMouseOut={(e) => e.currentTarget.style.background = "var(--primary)"}
              >
                {isSearching ? <Loader2 className="spin" size={18} style={{ animation: "spin 2s linear infinite" }} /> : <Sparkles size={18} />}
              </button>
            </div>
            </div>

            <p style={{ color: "#6B7280", maxWidth: "600px", lineHeight: 1.6, marginTop: "0", marginBottom: "1.5rem" }} className="lowercase-title">
              acompanhe a performance real dos seus criativos a partir de seu histórico.
            </p>
          </div>

          <div>
            <div className="section-header" style={{ marginBottom: "0.5rem" }}>
              <span className="section-number">01</span>
              <h2 className="section-title">métricas globais</h2>
              <span className="section-subtitle">período selecionado</span>
            </div>
            
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.15)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
              <div style={{ color: "#3b82f6", flexShrink: 0, marginTop: "2px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--foreground)", opacity: 0.8, lineHeight: 1.5 }}>
                <strong>Aviso sobre Atribuição da Meta:</strong> O Meta Ads leva de 1 a 24 horas para atualizar e exibir os dados de uma compra no Gerenciador de Anúncios. Em muitos casos o evento aparece em poucas horas, mas o painel pode demorar até 48 horas para consolidar a atribuição correta e refletir todas as conversões.{" "}
                <a href="https://www.reddit.com/r/FacebookAds/comments/1t4kh4m/ads_manager_data_update_time/?tl=pt-br" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>[1]</a>{" "}
                <a href="https://www.reddit.com/r/PPC/comments/1ku6n7h/how_long_does_it_take_for_meta_ads_to_start/?tl=pt-br" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>[2]</a>{" "}
                <a href="https://www.reddit.com/r/PPC/comments/122p8ge/how_long_does_it_take_for_conversions_to_show_up/?tl=pt-br" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>[3]</a>
              </p>
            </div>

            <div className="fixed-grid-4">
              <div className="allu-card">
                <div className="allu-card-label">◇ INVESTIMENTO TOTAL</div>
                <div className="allu-card-value">{formatCurrencyBR(metrics.totalSpend)}</div>
                <div className="allu-card-subtext">gasto nas campanhas</div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">◇ VALOR BRUTO</div>
                <div className="allu-card-value">{formatCurrencyBR(metrics.totalGrossValue)}</div>
                <div className="allu-card-subtext">gerado no período</div>
              </div>
              <div className="allu-card allu-card-highlight">
                <div className="allu-card-label">▶ VALOR APROVADO</div>
                <div className="allu-card-value">{formatCurrencyBR(metrics.totalRiskApprovedValue)}</div>
                <div className="allu-card-subtext">real aprovado</div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">◇ CPA MÉDIO</div>
                <div className="allu-card-value">{formatCurrencyBR(metrics.avgCpa)}</div>
                <div className="allu-card-subtext">custo por aprovado</div>
              </div>
            </div>
          </div>
          
          <div style={{ flex: 1, marginTop: "-1rem" }}>
            <CreativeView 
              dateFrom={dateFrom} 
              dateTo={dateTo} 
              statusFilter={statusFilter} 
              selectedDesigner={selectedDesigner}
              creators={creators}
              hideOldAds={hideOldAds}
              onMetricsUpdate={setMetrics} 
            />
          </div>
        </section>
      </div>
    </main>
  );
}

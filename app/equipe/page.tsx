"use client";

import TopBar from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Skeleton, SkeletonCircle } from "@/components/Skeleton";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { Loader2, Users, Target, ArrowUpRight, ArrowDownRight, Send, RefreshCw, Info, Layers, TrendingUp, Coins, Activity } from "lucide-react";

function formatCurrencyBR(value: number): string {
  if (Number.isNaN(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function EquipePage() {
  const [stats, setStats] = useState<any[]>([]);
  const [teamCreativeGoal, setTeamCreativeGoal] = useState(625);
  const [syncing, setSyncing] = useState(false);
  
  const now = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const { data: jsonReports, loading: loadingReports, mutate: mutateReports } = useCacheFetch<any>(`/api/reports/creators?month=${selectedMonth}&year=${selectedYear}`);
  const { data: jsonDeliveries, loading: loadingDeliveries, mutate: mutateDeliveries } = useCacheFetch<any>(`/api/deliveries?month=${selectedMonth}&year=${selectedYear}`);

  const loading = loadingReports || loadingDeliveries;

  useEffect(() => {
    if (!jsonReports || !jsonDeliveries) return;
    
    let globalTeamGoal = 625;
    let deliveriesRanking: any[] = [];
    if (jsonDeliveries.success) {
       globalTeamGoal = jsonDeliveries.teamCreativeGoal || 625;
       deliveriesRanking = jsonDeliveries.ranking || [];
    }
    setTeamCreativeGoal(globalTeamGoal);
    
    let unifiedStats: any[] = [];
    if (jsonReports.data) {
      unifiedStats = jsonReports.data.map((stat: any) => {
        const deliveryData = deliveriesRanking.find((d: any) => d.creatorId === stat.creatorId);
        return {
           ...stat,
           totalPieces: deliveryData ? deliveryData.totalPieces : 0
        };
      });
    }
    
    // Empurrar "UNKNOWN" / Parcerias para o final
    unifiedStats.sort((a: any, b: any) => {
      if (a.acronym.includes("UNKNOWN") && !b.acronym.includes("UNKNOWN")) return 1;
      if (b.acronym.includes("UNKNOWN") && !a.acronym.includes("UNKNOWN")) return -1;
      return b.riskApprovedValue - a.riskApprovedValue; // Default by revenue
    });

    setStats(unifiedStats);
    setTeamCreativeGoal(globalTeamGoal);
  }, [jsonReports, jsonDeliveries]);

  const handleSyncSlack = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-slack", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear })
      });
      const data = await res.json();
      if (data.success) {
        alert("Sincronização concluída com sucesso!");
        mutateReports();
        mutateDeliveries();
      } else {
        alert("Erro na sincronização: " + (data.error || "Desconhecido"));
      }
    } catch (e) {
      alert("Erro ao chamar API de sincronização.");
    } finally {
      setSyncing(false);
    }
  };

  const currentMonthValue = today.getMonth() + 1;
  const currentYearValue = today.getFullYear();
  const isCurrentMonth = selectedMonth === currentMonthValue && selectedYear === currentYearValue;

  const allMonths = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" }
  ];

  const LAUNCH_YEAR = 2026;
  const LAUNCH_MONTH = 8; // Agosto

  const availableYears = [];
  for (let y = LAUNCH_YEAR; y <= currentYearValue; y++) {
    availableYears.push(y);
  }

  let availableMonths = allMonths;
  if (selectedYear === LAUNCH_YEAR) {
    availableMonths = availableMonths.filter(m => m.value >= LAUNCH_MONTH);
  }
  if (selectedYear === currentYearValue) {
    availableMonths = availableMonths.filter(m => m.value <= currentMonthValue);
  }

  const totalPieces = stats.reduce((acc, curr) => acc + (curr.totalPieces || 0), 0);
  const globalProgressPercent = Math.min(100, Math.round((totalPieces / teamCreativeGoal) * 100)) || 0;

  let paceText = "";
  if (isCurrentMonth && totalPieces > 0) {
    const currentDay = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const projectedPace = Math.round((totalPieces / currentDay) * daysInMonth);
    paceText = `Projeção (Pace): ${projectedPace} peças no mês`;
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <div className="dashboard-container">
        <section style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1.5rem" }}>
            <div>
              <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }} className="lowercase-title">
                <Users size={32} color="var(--primary)" />
                dashboard da equipe<span className="dot-green">.</span>
              </h1>
              <p style={{ color: "#6B7280", maxWidth: "600px", lineHeight: 1.6 }} className="lowercase-title">
                visão unificada de produção (peças entregues) e performance (receita gerada) de cada membro.
              </p>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                style={{
                  padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--card-border)",
                  background: "var(--card-bg)", color: "var(--foreground)", fontSize: "0.85rem", fontWeight: 600, outline: "none", cursor: "pointer", flex: "1 1 auto"
                }}
              >
                {availableMonths.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const newYear = parseInt(e.target.value);
                  setSelectedYear(newYear);
                  if (newYear === currentYearValue && selectedMonth > currentMonthValue) {
                    setSelectedMonth(currentMonthValue);
                  }
                  if (newYear === 2026 && selectedMonth < 8) {
                    setSelectedMonth(8);
                  }
                }}
                style={{
                  padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--card-border)",
                  background: "var(--card-bg)", color: "var(--foreground)", fontSize: "0.85rem", fontWeight: 600, outline: "none", cursor: "pointer", flex: "1 1 auto"
                }}
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button 
                onClick={handleSyncSlack}
                disabled={syncing}
                title={`Sincroniza as entregas do mês de ${allMonths.find(m => m.value === selectedMonth)?.label}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.5rem 1rem', borderRadius: '8px',
                  border: 'none', background: 'var(--primary)',
                  color: 'white', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                  opacity: syncing ? 0.7 : 1, transition: 'all 0.2s', fontSize: '0.85rem', flex: "1 1 100%"
                }}
              >
                <RefreshCw size={14} className={syncing ? "spin" : ""} />
                {syncing ? "Sincronizando..." : "Sincronizar Entregas"}
              </button>
            </div>
          </div>

          {!loading && (
            <div className="allu-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", borderTop: "4px solid var(--primary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
                <h2 style={{ fontSize: "1.2rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Target size={24} color="var(--primary)" />
                  Meta Global de Peças (Mês)
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--primary)", lineHeight: 1 }}>
                    <AnimatedNumber value={totalPieces} decimals={0} />
                  </span>
                  <span style={{ fontSize: "1.2rem", opacity: 0.6 }}>/ {teamCreativeGoal} peças</span>
                </div>
              </div>
              
              <div style={{ width: "100%", height: "24px", background: "rgba(255,255,255,0.05)", borderRadius: "100px", overflow: "hidden", position: "relative" }}>
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: `${globalProgressPercent}%` }}
                  transition={{ type: "spring", stiffness: 50, damping: 20 }}
                  style={{ 
                    height: "100%", 
                    background: "linear-gradient(90deg, var(--primary), #34D399)",
                    borderRadius: "100px"
                  }} 
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", opacity: 0.7, fontWeight: 600, flexWrap: "wrap", gap: "0.5rem" }}>
                <span>{paceText && <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}><Activity size={14} /> {paceText}</span>}</span>
                <span>{globalProgressPercent}% da meta atingida</span>
              </div>
            </div>
          )}

          {/* Glossário / Informações */}
          {!loading && (
            <div className="fixed-grid-4">
              <div className="allu-card allu-card-highlight">
                <div className="allu-card-label">
                  ▶ RECEITA LÍQUIDA
                </div>
                <div className="allu-card-subtext">
                  Vendas <strong>liquidadas (Risk Approved)</strong> geradas apenas por anúncios <strong>lançados no próprio mês</strong> (inclui ativos e pausados).
                </div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">
                  ◇ ENTREGAS REALIZADAS
                </div>
                <div className="allu-card-subtext">
                  Peças matemáticas extraídas <strong>automaticamente pelo Slack</strong> no mês vigente.
                </div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">
                  ◇ RECEITA BRUTA
                </div>
                <div className="allu-card-subtext">
                  Faturamento <strong>total</strong> apenas dos anúncios lançados no mês (engloba compras pendentes como boletos).
                </div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">
                  ◇ ROAS
                </div>
                <div className="allu-card-subtext">
                  <strong>Retorno sobre Investimento</strong> (Receita Bruta / Investimento).
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="team-grid-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} style={{ 
                  background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--card-border)", 
                  padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem",
                  position: "relative", boxShadow: "var(--card-shadow)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <SkeletonCircle size="48px" />
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <Skeleton width="120px" height="20px" />
                      <Skeleton width="80px" height="14px" />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "0.4rem" }}>
                    <Skeleton width="100%" height="110px" borderRadius="8px" />
                    <Skeleton width="100%" height="80px" borderRadius="8px" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                      <Skeleton width="100%" height="70px" borderRadius="8px" />
                      <Skeleton width="100%" height="70px" borderRadius="8px" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <motion.div 
              className="team-grid-3"
              initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
            >
              {stats.map((stat, index) => {
                const isUnknown = stat.acronym.includes("UNKNOWN");
                const realProgressPercent = stat.monthlyGoal > 0 ? (stat.riskApprovedValue / stat.monthlyGoal) * 100 : 0;
                const progress = Math.min(realProgressPercent, 100);
                const isSaved = stat.isSaved;
                
                let pacePercent = 0;
                let projectedRevenue = 0;
                let projectedPieces = 0;
                let volumePacePercent = 0;

                if (isCurrentMonth) {
                  const daysPassed = today.getDate();
                  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                  
                  if (stat.riskApprovedValue > 0) {
                    projectedRevenue = (stat.riskApprovedValue / daysPassed) * daysInMonth;
                    if (stat.monthlyGoal > 0) {
                      pacePercent = (projectedRevenue / stat.monthlyGoal) * 100;
                    }
                  }
                  
                  if (stat.totalPieces > 0) {
                    projectedPieces = Math.round((stat.totalPieces / daysPassed) * daysInMonth);
                    const vGoal = stat.monthlyVolumeGoal || 30;
                    if (vGoal > 0) {
                      volumePacePercent = (projectedPieces / vGoal) * 100;
                    }
                  }
                }
                
                // Cores de Parcerias
                const cardBg = isUnknown ? "rgba(253, 224, 71, 0.05)" : "var(--card-bg)";
                const cardBorder = isUnknown ? "rgba(253, 224, 71, 0.4)" : "var(--card-border)";
                const primaryColor = isUnknown ? "#EAB308" : "var(--primary)";
                
                return (
                  <motion.div 
                    key={stat.acronym} 
                    variants={{ hidden: { opacity: 0, scale: 0.95, y: 20 }, show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } }}
                    style={{ 
                      background: cardBg, borderRadius: "12px", border: `1px solid ${cardBorder}`, 
                      padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem",
                      position: "relative", boxShadow: "var(--card-shadow)"
                    }}
                  >
                    {/* Rank Badge */}
                    {!isUnknown && (
                      <div style={{ position: "absolute", top: "-10px", right: "-10px", width: "32px", height: "32px", borderRadius: "50%", background: primaryColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "0.9rem", boxShadow: "0 4px 10px rgba(0,0,0,0.2)" }}>
                        #{index + 1}
                      </div>
                    )}
                    
                    {isSaved && (
                      <div style={{ position: "absolute", top: "-10px", left: "15px", padding: "0.2rem 0.6rem", borderRadius: "100px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--foreground)", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                        Salvo
                      </div>
                    )}

                    {/* Header: Avatar & Name */}
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ position: "relative" }}>
                        <Avatar 
                          src={stat.avatarUrl} 
                          name={isUnknown ? "?" : stat.name} 
                          size="lg" 
                          isActive={!isUnknown} 
                        />
                      </div>
                      <div>
                        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                          {stat.name}
                        </h2>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
                          {!isUnknown && (
                            <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px" }}>
                              {stat.acronym}
                            </span>
                          )}
                          <span style={{ opacity: 0.6, fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem", cursor: "help" }} title="Quantidade total de anúncios lançados neste mês que continuam ativos no momento.">
                            {stat.activeAdsCount} anúncios
                            <Info size={12} />
                          </span>
                        </div>
                        {isUnknown && (
                          <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.6rem", lineHeight: 1.4 }}>
                            Reúne todos os anúncios ativos e entregas que não possuam as siglas obrigatórias dos designers cadastrados.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metrics Boxes */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "0.4rem" }}>
                      
                      {/* Receita Líquida (Destacada) */}
                      <div style={{ display: "flex", flexDirection: "column", background: isUnknown ? "rgba(253, 224, 71, 0.05)" : "rgba(16, 185, 129, 0.05)", padding: "1.2rem", borderRadius: "8px", border: `1px solid ${isUnknown ? 'rgba(253, 224, 71, 0.2)' : 'rgba(16, 185, 129, 0.3)'}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                          <span style={{ fontSize: "0.75rem", color: isUnknown ? "#EAB308" : "var(--success)", textTransform: "uppercase", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <TrendingUp size={14} /> Receita Líquida 
                            <span title="Faturamento gerado estritamente por anúncios ativos criados no mês selecionado." style={{ cursor: "help", opacity: 0.6 }}>
                              <Info size={12} />
                            </span>
                          </span>
                          {!isUnknown && (
                            <span style={{ fontSize: "0.7rem", opacity: 0.6, fontWeight: 600, color: "var(--success)", textTransform: "uppercase" }}>
                              Meta: {formatCurrencyBR(stat.monthlyGoal)}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "1.8rem", fontWeight: 800, color: isUnknown ? "#FDE047" : "var(--success)" }}>
                          <AnimatedNumber value={stat.riskApprovedValue} prefix="R$ " decimals={2} />
                        </span>

                        {!isUnknown && (
                          <div style={{ marginTop: "1rem" }}>
                            <div style={{ width: "100%", height: "6px", background: "rgba(75, 209, 132, 0.2)", borderRadius: "100px", overflow: "hidden" }}>
                              <motion.div 
                                initial={{ width: "0%" }}
                                animate={{ width: `${Math.min(progress, 100)}%` }}
                                transition={{ type: "spring", stiffness: 50, damping: 20 }}
                                style={{ height: "100%", background: "var(--success)" }} 
                              />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--success)" }}>
                              <span style={{ fontWeight: 600 }}>
                                {realProgressPercent.toFixed(1)}% atingido
                              </span>
                              {isCurrentMonth && pacePercent > 0 && (
                                <span style={{ opacity: 0.8, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }} title={`Projeção: ${formatCurrencyBR(projectedRevenue)}`}>
                                  <Activity size={12} /> Pace: {pacePercent.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Volumetria (Full Width) */}
                      <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.03)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)" }}>
                        <span style={{ fontSize: "0.7rem", opacity: 0.6, textTransform: "uppercase", fontWeight: 600, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <Layers size={14} /> Peças Entregues
                        </span>
                        
                        <div style={{ display: "flex", alignItems: "baseline", gap: "0.1rem" }}>
                          <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                            <AnimatedNumber value={stat.totalPieces} decimals={0} />
                          </span>
                          {!isUnknown && (
                            <span style={{ fontSize: "1.2rem", fontWeight: 700, opacity: 0.5 }}>
                              /{stat.monthlyVolumeGoal || 30}
                            </span>
                          )}
                        </div>
                        {!isUnknown && (
                          <>
                            <div style={{ marginTop: "0.8rem", width: "100%", height: "6px", background: "var(--card-border)", borderRadius: "100px", overflow: "hidden" }}>
                              <motion.div 
                                initial={{ width: "0%" }}
                                animate={{ width: `${Math.min(((stat.totalPieces || 0) / (stat.monthlyVolumeGoal || 30)) * 100, 100)}%` }}
                                transition={{ type: "spring", stiffness: 50, damping: 20 }}
                                style={{ height: "100%", background: ((stat.totalPieces || 0) >= (stat.monthlyVolumeGoal || 30)) ? "var(--success)" : primaryColor }} 
                              />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", fontSize: "0.75rem" }}>
                              <span style={{ fontWeight: 600, color: ((stat.totalPieces || 0) >= (stat.monthlyVolumeGoal || 30)) ? "var(--success)" : primaryColor }}>
                                {(((stat.totalPieces || 0) / (stat.monthlyVolumeGoal || 30)) * 100).toFixed(1)}% atingido
                              </span>
                              {isCurrentMonth && volumePacePercent > 0 && (
                                <span style={{ opacity: 0.7, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }} title={`Projeção para o fim do mês: ${projectedPieces} peças`}>
                                  <Activity size={12} /> Pace: {volumePacePercent.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* 2-Column Grid for Bruta and ROAS */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                        {/* Receita Bruta */}
                        <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.03)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)" }}>
                          <span style={{ fontSize: "0.7rem", opacity: 0.6, textTransform: "uppercase", fontWeight: 600, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <Coins size={14} /> Receita Bruta
                          </span>
                          <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                            <AnimatedNumber value={stat.grossValue} prefix="R$ " decimals={2} />
                          </span>
                        </div>

                        {/* ROAS */}
                        <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.03)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)" }}>
                          <span style={{ fontSize: "0.7rem", opacity: 0.6, textTransform: "uppercase", fontWeight: 600, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "help" }} title="Retorno Sobre o Investimento">
                            <Target size={14} /> ROAS
                          </span>
                          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: stat.roas >= 2 ? "var(--success)" : stat.roas >= 1 ? "#EAB308" : "inherit" }}>
                            {stat.roas.toFixed(2)}x
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {stats.length === 0 && (
                <div style={{ padding: "3rem", textAlign: "center", opacity: 0.5, border: "1px dashed var(--card-border)", borderRadius: "12px", gridColumn: "1 / -1" }}>
                  <Users size={32} style={{ margin: "0 auto 1rem auto", opacity: 0.5 }} />
                  <p>Nenhum dado encontrado para o período selecionado.</p>
                </div>
              )}
            </motion.div>
          )}
        </section>
      </div>
    </main>
  );
}

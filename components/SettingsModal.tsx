"use client";

import React, { useState, useEffect } from "react";
import { X, Save, Loader2, Plus, Trash2 } from "lucide-react";

export default function SettingsModal({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: () => void }) {
  const [activeTab, setActiveTab] = useState<"sistema" | "metas" | "ia" | "api" | "equipe" | "logs">("sistema");
  const [sysLogs, setSysLogs] = useState<any[]>([]);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [creators, setCreators] = useState<any[]>([]);
  const [newCreator, setNewCreator] = useState({ name: "", acronym: "", monthlyGoal: "50000", monthlyVolumeGoal: "30" });
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState({
    teamCreativeGoal: 300,
    superWinnerSpend: 1000,
    superWinnerReturn: 5000,
    superWinnerCpa: 50,
    winnerSpend: 1000,
    winnerReturn: 1000,
    winnerCpa: 60,
    hypothesisPrompt: "",
    insightsPrompt: "",
    andromedaPrompt: "",
    marketInsightsPrompt: "",
    tavilySearchQuery: "",
    metaAdAccountId: "",
    metaAccessToken: "",
    geminiApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    tavilyApiKey: "",
    groqApiKey: "",
    openRouterApiKey: "",
    cohereApiKey: "",
    huggingFaceApiKey: "",
    slackBotToken: "",
    slackChannelId: "",
    cronSyncEnabled: true,
    cronSyncMode: "metrics",
    cronSyncInterval: 120
  });

  useEffect(() => {
    if (isOpen) {
      setFetching(true);
      fetch("/api/settings")
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data) {
            setSettings({
              teamCreativeGoal: res.data.teamCreativeGoal || 300,
              superWinnerSpend: res.data.superWinnerSpend,
              superWinnerReturn: res.data.superWinnerReturn,
              superWinnerCpa: res.data.superWinnerCpa || 50,
              winnerSpend: res.data.winnerSpend,
              winnerReturn: res.data.winnerReturn,
              winnerCpa: res.data.winnerCpa || 60,
              hypothesisPrompt: res.data.hypothesisPrompt || "",
              insightsPrompt: res.data.insightsPrompt || "",
              andromedaPrompt: res.data.andromedaPrompt || "",
              tavilySearchQuery: res.data.tavilySearchQuery || "",
              marketInsightsPrompt: res.data.marketInsightsPrompt || "",
              metaAdAccountId: res.data.metaAdAccountId || "",
              metaAccessToken: res.data.metaAccessToken || "",
              geminiApiKey: res.data.geminiApiKey || "",
              openaiApiKey: res.data.openaiApiKey || "",
              anthropicApiKey: res.data.anthropicApiKey || "",
              tavilyApiKey: res.data.tavilyApiKey || "",
              groqApiKey: res.data.groqApiKey || "",
              openRouterApiKey: res.data.openRouterApiKey || "",
              cohereApiKey: res.data.cohereApiKey || "",
              huggingFaceApiKey: res.data.huggingFaceApiKey || "",
              slackBotToken: res.data.slackBotToken || "",
              slackChannelId: res.data.slackChannelId || "",
              cronSyncEnabled: res.data.cronSyncEnabled !== undefined ? res.data.cronSyncEnabled : true,
              cronSyncMode: res.data.cronSyncMode || "metrics",
              cronSyncInterval: res.data.cronSyncInterval || 120
            });
          }
          setFetching(false);
          fetchCreators();
        })
        .catch(() => setFetching(false));
    }
  }, [isOpen]);

  const fetchCreators = async () => {
    try {
      const res = await fetch("/api/creators");
      const json = await res.json();
      if (json.data) setCreators(json.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    setFetchingLogs(true);
    try {
      const res = await fetch("/api/logs");
      const json = await res.json();
      if (Array.isArray(json)) setSysLogs(json);
    } catch (err) {
      console.error(err);
    }
    setFetchingLogs(false);
  };

  const clearLogs = async () => {
    if (!confirm("Tem certeza que deseja apagar todos os logs?")) return;
    try {
      await fetch("/api/logs", { method: "DELETE" });
      setSysLogs([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCreator = async () => {
    if (!newCreator.name || !newCreator.acronym) {
      alert("Por favor, preencha o nome e a sigla do criador.");
      return;
    }
    try {
      const method = editingCreatorId ? "PUT" : "POST";
      const payload = {
        ...newCreator,
        id: editingCreatorId,
        active: true
      };
      
      const res = await fetch("/api/creators", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", monthlyGoal: "50000", monthlyVolumeGoal: "30" });
        setEditingCreatorId(null);
        fetchCreators();
      } else {
        alert(json.error || "Ocorreu um erro ao salvar o criador.");
      }
    } catch (err: any) {
      alert("Erro de conexão ao salvar o criador.");
      console.error(err);
    }
  };

  const handleEditCreator = (creator: any) => {
    setEditingCreatorId(creator.id);
    setNewCreator({
      name: creator.name,
      acronym: creator.acronym,
      monthlyGoal: creator.monthlyGoal ? creator.monthlyGoal.toString() : "50000",
      monthlyVolumeGoal: creator.monthlyVolumeGoal ? creator.monthlyVolumeGoal.toString() : "30"
    });
  };

  const cancelEditCreator = () => {
    setEditingCreatorId(null);
    setNewCreator({ name: "", acronym: "", monthlyGoal: "50000", monthlyVolumeGoal: "30" });
  };

  const handleDeleteCreator = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este criador?")) return;
    try {
      const res = await fetch("/api/creators", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        onSave(); // Refresh data
        onClose();
      } else {
        alert("Erro ao salvar configurações.");
      }
    } catch (err) {
      alert("Erro ao salvar configurações.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      padding: "1rem"
    }}>
      <div className="glass-panel settings-modal">
        <button 
          onClick={onClose}
          style={{ position: "absolute", top: "1.5rem", right: "1.5rem", background: "none", border: "none", cursor: "pointer", color: "var(--foreground)", opacity: 0.5 }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          configurações<span className="dot-green">.</span>
        </h2>

        {fetching ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem", opacity: 0.5, flex: 1 }}>
            <Loader2 className="spin" size={24} style={{ animation: "spin 2s linear infinite" }} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ 
            display: "flex", flexDirection: "column", gap: "1.5rem", 
            overflowY: "auto", paddingRight: "0.5rem",
            scrollbarWidth: "thin", scrollbarColor: "var(--card-border) transparent"
          }}>
            
            <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--card-border)", paddingBottom: "0.5rem" }}>
              <button 
                type="button" 
                onClick={() => setActiveTab("sistema")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "sistema" ? 600 : 400,
                  color: activeTab === "sistema" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "sistema" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Geral & Sistema
              </button>
              <button 
                type="button" 
                onClick={() => setActiveTab("metas")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "metas" ? 600 : 400,
                  color: activeTab === "metas" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "metas" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Metas & Equipe
              </button>
              <button 
                type="button" 
                onClick={() => setActiveTab("ia")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "ia" ? 600 : 400,
                  color: activeTab === "ia" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "ia" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Inteligência Artificial
              </button>
              <button 
                type="button" 
                onClick={() => setActiveTab("api")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "api" ? 600 : 400,
                  color: activeTab === "api" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "api" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Integrações (API)
              </button>
              <button 
                type="button" 
                onClick={() => { setActiveTab("logs"); fetchLogs(); }}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "logs" ? 600 : 400,
                  color: activeTab === "logs" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "logs" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Logs do Sistema
              </button>

            </div>

            {activeTab === "sistema" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Automação e Background Tasks
                  </h3>
                  
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "1rem", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={settings.cronSyncEnabled}
                      onChange={e => setSettings({...settings, cronSyncEnabled: e.target.checked})}
                      style={{ width: "1.2rem", height: "1.2rem", marginTop: "0.2rem", cursor: "pointer", accentColor: "var(--primary)" }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Sincronização Automática Ativa (Cron)</span>
                      <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8 }}>
                        Quando ativado, o sistema irá se sincronizar com a Meta de tempos em tempos automaticamente nos bastidores, garantindo dados sempre atualizados mesmo com o app fechado.
                      </span>
                    </div>
                  </label>

                  {settings.cronSyncEnabled && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem", marginLeft: "2.2rem" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                        <span style={{ fontWeight: 600 }}>Intervalo de Execução</span>
                        <select 
                          value={settings.cronSyncInterval}
                          onChange={e => setSettings({...settings, cronSyncInterval: Number(e.target.value)})}
                          style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none", fontSize: "0.85rem" }}
                        >
                          <option value={30}>A cada 30 minutos</option>
                          <option value={60}>A cada 1 hora</option>
                          <option value={120}>A cada 2 horas</option>
                          <option value={360}>A cada 6 horas</option>
                          <option value={720}>A cada 12 horas</option>
                          <option value={1440}>Uma vez por dia (24h)</option>
                        </select>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)", opacity: 0.7, marginTop: "0.25rem" }}>
                          Com que frequência o sistema verificará por novas atualizações automaticamente.
                        </span>
                      </label>

                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                        <span style={{ fontWeight: 600 }}>Modo da Sincronização Automática</span>
                        <select 
                          value={settings.cronSyncMode}
                          onChange={e => setSettings({...settings, cronSyncMode: e.target.value})}
                          style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none", fontSize: "0.85rem" }}
                        >
                          <option value="metrics">Rápida (Apenas Metricas, Instantâneo)</option>
                          <option value="full">Profunda (Métricas + Mídias do Mês Atual)</option>
                        </select>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)", opacity: 0.7, marginTop: "0.25rem" }}>
                          Ambos os modos focam 100% apenas nos dados do mês atual. O modo profundo baixa vídeos e imagens em alta qualidade para montar o portfólio visual, consumindo mais cota da API.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "metas" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "rgba(39, 174, 96, 0.05)", borderRadius: "8px", border: "1px solid rgba(39, 174, 96, 0.2)" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Super Winners</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                      Gasto Mínimo (R$)
                      <input type="number" required value={settings.superWinnerSpend} onChange={e => setSettings({...settings, superWinnerSpend: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                      Retorno Mínimo (R$)
                      <input type="number" required value={settings.superWinnerReturn} onChange={e => setSettings({...settings, superWinnerReturn: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                      CPA Máximo (R$)
                      <input type="number" required value={settings.superWinnerCpa} onChange={e => setSettings({...settings, superWinnerCpa: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "rgba(59, 130, 246, 0.05)", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Winners</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                      Gasto Mínimo (R$)
                      <input type="number" required value={settings.winnerSpend} onChange={e => setSettings({...settings, winnerSpend: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                      Retorno Mínimo (R$)
                      <input type="number" required value={settings.winnerReturn} onChange={e => setSettings({...settings, winnerReturn: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>
                      CPA Máximo (R$)
                      <input type="number" required value={settings.winnerCpa} onChange={e => setSettings({...settings, winnerCpa: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                  </div>
                </div>

                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: "0 0 1rem 0" }}>Metas de Produção Criativa</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta Global do Time (peças/mês)</span>
                      <input type="number" required value={settings.teamCreativeGoal} onChange={e => setSettings({...settings, teamCreativeGoal: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                  </div>
                </div>

                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                    Criadores (Designers / Videomakers)
                  </h3>
                  <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "-1rem" }}>
                    Cadastre os membros da equipe e suas respectivas siglas usadas nos nomes dos arquivos (ex: RM, PP) para acompanhar a receita e performance individual.
                  </p>

                  <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1.5rem", marginBottom: "2rem" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
                      {editingCreatorId ? "Editar Membro da Equipe" : "Adicionar Novo Membro"}
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Nome do Criador</span>
                        <input type="text" value={newCreator.name} onChange={e => setNewCreator({...newCreator, name: e.target.value})} placeholder="Ex: Raphael Madureira" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none", transition: "border 0.2s" }} onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--card-border)"} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Siglas (Até 3, separadas por vírgula)</span>
                        <input type="text" value={newCreator.acronym} onChange={e => setNewCreator({...newCreator, acronym: e.target.value.toUpperCase()})} placeholder="Ex: RM, RAPHAELMADUREIRA, raphael" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", textTransform: "uppercase", outline: "none", transition: "border 0.2s" }} onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--card-border)"} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta Mensal (R$)</span>
                        <input type="number" value={newCreator.monthlyGoal} onChange={e => setNewCreator({...newCreator, monthlyGoal: e.target.value})} placeholder="50000" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none", transition: "border 0.2s" }} onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--card-border)"} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta de Volumetria (peças)</span>
                        <input type="number" value={newCreator.monthlyVolumeGoal} onChange={e => setNewCreator({...newCreator, monthlyVolumeGoal: e.target.value})} placeholder="30" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none", transition: "border 0.2s" }} onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--card-border)"} />
                      </label>
                    </div>
                    
                    <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                      <button type="button" onClick={handleSaveCreator} style={{ flex: 1, padding: "0.9rem", borderRadius: "8px", background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "var(--primary-hover)"} onMouseOut={e => e.currentTarget.style.background = "var(--primary)"}>
                        {editingCreatorId ? "Salvar Alterações" : "Adicionar Membro à Equipe"}
                      </button>
                      
                      {editingCreatorId && (
                        <button type="button" onClick={cancelEditCreator} style={{ padding: "0.9rem 1.5rem", borderRadius: "8px", background: "rgba(0,0,0,0.05)", color: "var(--foreground)", border: "1px solid var(--card-border)", cursor: "pointer", fontWeight: 700, transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(0,0,0,0.1)"} onMouseOut={e => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {creators.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0" }}>Membros da Equipe ({creators.length})</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {creators.map(creator => (
                          <div key={creator.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.2rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "var(--card-bg)", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
                              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "1.1rem" }}>
                                {creator.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                                <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{creator.name}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", opacity: 0.7 }}>
                                  <span style={{ background: "rgba(0,0,0,0.06)", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600 }}>{creator.acronym}</span>
                                  <span>•</span>
                                  <span>R$ {parseFloat(creator.monthlyGoal || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  <span>•</span>
                                  <span>{creator.monthlyVolumeGoal || 30} peças</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                title="Editar Membro"
                                onClick={() => handleEditCreator(creator)}
                                style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "rgba(0, 0, 0, 0.05)", color: "var(--foreground)", border: "1px solid var(--card-border)", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, transition: "all 0.2s" }}
                                onMouseOver={e => { e.currentTarget.style.background = "rgba(0, 0, 0, 0.1)"; }}
                                onMouseOut={e => { e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)"; }}
                              >
                                Editar
                              </button>
                              {!creator.acronym.includes("UNKNOWN") && (
                                <button
                                  type="button"
                                  title="Remover Membro"
                                  onClick={() => handleDeleteCreator(creator.id)}
                                  style={{ padding: "0.5rem 1rem", borderRadius: "6px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, transition: "all 0.2s" }}
                                  onMouseOver={e => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; }}
                                  onMouseOut={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.color = "#ef4444"; }}
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </>
            )}

            {activeTab === "ia" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                
                {/* Agrupamento: Análise de Plataforma */}
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Análises de Plataforma
                  </h3>
                  
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Prompt: Analisar Criativo (Botão)</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>Instruções que a IA usará para analisar um anúncio individual.</span>
                    <textarea 
                      value={settings.hypothesisPrompt} 
                      onChange={e => setSettings({...settings, hypothesisPrompt: e.target.value})} 
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "100px", fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Prompt: Insights de Campanha (Dashboard)</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>Instruções que a IA usará para analisar o histórico geral de múltiplos anúncios simultaneamente.</span>
                    <textarea 
                      value={settings.insightsPrompt} 
                      onChange={e => setSettings({...settings, insightsPrompt: e.target.value})} 
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "100px", fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Prompt: Auditoria de Entity IDs (Andromeda)</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>Instruções que a IA usará para analisar grupos de anúncios canibalizados.</span>
                    <textarea 
                      value={settings.andromedaPrompt} 
                      onChange={e => setSettings({...settings, andromedaPrompt: e.target.value})} 
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "100px", fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }} 
                    />
                  </label>
                </div>
                
                {/* Agrupamento: Insights de Mercado */}
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Insights de Mercado (Busca Web Automática)
                  </h3>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Tavily: Termos de Pesquisa (Query)</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>A consulta enviada ao motor de busca para procurar estudos de caso pela internet.</span>
                    <textarea 
                      value={settings.tavilySearchQuery} 
                      onChange={e => setSettings({...settings, tavilySearchQuery: e.target.value})} 
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "60px", fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Prompt: Curador de Insights de Mercado</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>Instruções para a IA filtrar os resultados da busca e extrair dicas práticas.</span>
                    <textarea 
                      value={settings.marketInsightsPrompt} 
                      onChange={e => setSettings({...settings, marketInsightsPrompt: e.target.value})} 
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "100px", fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }} 
                    />
                  </label>
                </div>

              </div>
            )}

            {activeTab === "api" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                
                {/* Agrupamento: Meta Ads */}
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Meta Ads (Facebook)
                  </h3>
                  
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Ad Account ID</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>ID da conta de anúncios (ex: act_123456789)</span>
                    <input type="text"
                      value={settings.metaAdAccountId} 
                      onChange={e => setSettings({...settings, metaAdAccountId: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Access Token</span>
                    <span style={{ opacity: 0.7, fontSize: "0.75rem", marginBottom: "0.5rem" }}>Token de Acesso Permanente</span>
                    <input type="password"
                      value={settings.metaAccessToken} 
                      onChange={e => setSettings({...settings, metaAccessToken: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>
                </div>
                
                {/* Agrupamento: APIs de Inteligência Artificial */}
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Modelos de Inteligência Artificial
                  </h3>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Google Gemini API Key</span>
                    <input type="password"
                      value={settings.geminiApiKey} 
                      onChange={e => setSettings({...settings, geminiApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>OpenAI API Key</span>
                    <input type="password"
                      value={settings.openaiApiKey} 
                      onChange={e => setSettings({...settings, openaiApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Anthropic API Key</span>
                    <input type="password"
                      value={settings.anthropicApiKey} 
                      onChange={e => setSettings({...settings, anthropicApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Groq API Key</span>
                    <input type="password"
                      value={settings.groqApiKey} 
                      onChange={e => setSettings({...settings, groqApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>OpenRouter API Key</span>
                    <input type="password"
                      value={settings.openRouterApiKey} 
                      onChange={e => setSettings({...settings, openRouterApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Cohere API Key</span>
                    <input type="password"
                      value={settings.cohereApiKey} 
                      onChange={e => setSettings({...settings, cohereApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Hugging Face Access Token</span>
                    <input type="password"
                      value={settings.huggingFaceApiKey} 
                      onChange={e => setSettings({...settings, huggingFaceApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>
                  
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600 }}>Tavily API Key (Motor de Busca)</span>
                    <input type="password"
                      value={settings.tavilyApiKey} 
                      onChange={e => setSettings({...settings, tavilyApiKey: e.target.value})} 
                      placeholder="Deixe em branco para usar o .env"
                      style={{ padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.8rem" }} 
                    />
                  </label>
                </div>

              </div>
            )}


            <button type="submit" disabled={loading} style={{
              marginTop: "1rem", padding: "0.8rem", borderRadius: "8px", border: "none",
              background: "var(--foreground)", color: "var(--background-main)",
              fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem"
            }}>
              {loading ? <Loader2 size={16} className="spin" style={{ animation: "spin 2s linear infinite" }} /> : <Save size={16} />}
              Salvar Configurações
            </button>

          </form>
        )}

            {activeTab === "logs" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                      Logs do Servidor e Interface
                    </h3>
                    <button type="button" onClick={clearLogs} style={{ background: "none", border: "none", color: "var(--danger, #ef4444)", cursor: "pointer", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Trash2 size={16} /> Limpar Logs
                    </button>
                  </div>
                  
                  {fetchingLogs ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--foreground-muted)" }}>
                      <Loader2 size={24} className="animate-spin mx-auto" />
                    </div>
                  ) : sysLogs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--foreground-muted)", background: "var(--background)", borderRadius: "8px" }}>
                      Nenhum log registrado.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "60vh", overflowY: "auto", paddingRight: "0.5rem" }}>
                      {sysLogs.map((log: any) => (
                        <div key={log.id} style={{ 
                          padding: "1rem", 
                          borderRadius: "8px", 
                          background: "var(--background)",
                          borderLeft: `4px solid ${log.level === 'ERROR' ? '#ef4444' : log.level === 'WARNING' ? '#f59e0b' : '#3b82f6'}`,
                          display: "flex", flexDirection: "column", gap: "0.5rem"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--foreground-muted)" }}>
                            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>[{log.source}] {log.level}</span>
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 500 }}>{log.message}</div>
                          {log.url && <div style={{ fontSize: "0.8rem", color: "var(--foreground-muted)" }}>URL: {log.url}</div>}
                          {log.stack && (
                            <pre style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.2)", padding: "0.75rem", borderRadius: "6px", overflowX: "auto", color: "#a1a1aa", marginTop: "0.5rem" }}>
                              {log.stack}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

      </div>
    </div>
  );
}

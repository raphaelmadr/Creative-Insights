"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Trash2, Plus } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";

const formatCurrencyInput = (value: number | string) => {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? Number(value.replace(/\D/g, "")) / 100 : value;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string) => {
  const numericValue = value.replace(/\D/g, "");
  return Number(numericValue) / 100;
};

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<"metas" | "equipe" | "sistema" | "ia" | "api" | "logs">("metas");
  const [sysLogs, setSysLogs] = useState<any[]>([]);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [selectedGoalMonth, setSelectedGoalMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedGoalYear, setSelectedGoalYear] = useState(() => new Date().getFullYear());
  const [monthlyGoal, setMonthlyGoal] = useState({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });

  const [creators, setCreators] = useState<any[]>([]);
  const [newCreator, setNewCreator] = useState({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    teamCreativeGoal: 300,
    superWinnerSpend: 1000,
    superWinnerReturn: 10000,
    superWinnerCpa: 50,
    winnerSpend: 500,
    winnerReturn: 2000,
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
    cronSyncInterval: 120,
    cpanelUploadUrl: "",
    cpanelUploadSecret: "",
    googleClientId: "",
    googleClientSecret: "",
    nextAuthSecret: "",
    nextAuthUrl: "",
    metaAppId: "",
    metaAppSecret: "",
    tiktokAdvertiserId: "",
    tiktokAppId: "",
    tiktokAppSecret: "",
    tiktokAccessToken: ""
  });

  const fetchCreators = async () => {
    try {
      const res = await fetch("/api/creators").then(r => r.json());
      if (res.data) {
        setCreators(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setFetching(true);
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch(`/api/goals?month=${selectedGoalMonth}&year=${selectedGoalYear}`).then(r => r.json()),
      fetchCreators()
    ]).then(([settingsRes, goalsRes]) => {
      if (settingsRes.success && settingsRes.data) {
        setSettings({
          teamCreativeGoal: settingsRes.data.teamCreativeGoal ?? 300,
          superWinnerSpend: settingsRes.data.superWinnerSpend ?? 1000,
          superWinnerReturn: settingsRes.data.superWinnerReturn ?? 10000,
          superWinnerCpa: settingsRes.data.superWinnerCpa ?? 50,
          winnerSpend: settingsRes.data.winnerSpend ?? 500,
          winnerReturn: settingsRes.data.winnerReturn ?? 2000,
          winnerCpa: settingsRes.data.winnerCpa ?? 60,
          hypothesisPrompt: settingsRes.data.hypothesisPrompt || "",
          insightsPrompt: settingsRes.data.insightsPrompt || "",
          andromedaPrompt: settingsRes.data.andromedaPrompt || "",
          tavilySearchQuery: settingsRes.data.tavilySearchQuery || "",
          marketInsightsPrompt: settingsRes.data.marketInsightsPrompt || "",
          metaAdAccountId: settingsRes.data.metaAdAccountId || "",
          metaAccessToken: settingsRes.data.metaAccessToken || "",
          geminiApiKey: settingsRes.data.geminiApiKey || "",
          openaiApiKey: settingsRes.data.openaiApiKey || "",
          anthropicApiKey: settingsRes.data.anthropicApiKey || "",
          tavilyApiKey: settingsRes.data.tavilyApiKey || "",
          groqApiKey: settingsRes.data.groqApiKey || "",
          openRouterApiKey: settingsRes.data.openRouterApiKey || "",
          cohereApiKey: settingsRes.data.cohereApiKey || "",
          huggingFaceApiKey: settingsRes.data.huggingFaceApiKey || "",
          slackBotToken: settingsRes.data.slackBotToken || "",
          slackChannelId: settingsRes.data.slackChannelId || "",
          cronSyncEnabled: settingsRes.data.cronSyncEnabled !== undefined ? settingsRes.data.cronSyncEnabled : true,
          cronSyncMode: settingsRes.data.cronSyncMode || "metrics",
          cronSyncInterval: settingsRes.data.cronSyncInterval || 120,
          cpanelUploadUrl: settingsRes.data.cpanelUploadUrl || "",
          cpanelUploadSecret: settingsRes.data.cpanelUploadSecret || "",
          googleClientId: settingsRes.data.googleClientId || "",
          googleClientSecret: settingsRes.data.googleClientSecret || "",
          nextAuthSecret: settingsRes.data.nextAuthSecret || "",
          nextAuthUrl: settingsRes.data.nextAuthUrl || "",
          metaAppId: settingsRes.data.metaAppId || "",
          metaAppSecret: settingsRes.data.metaAppSecret || "",
          tiktokAdvertiserId: settingsRes.data.tiktokAdvertiserId || "",
          tiktokAppId: settingsRes.data.tiktokAppId || "",
          tiktokAppSecret: settingsRes.data.tiktokAppSecret || "",
          tiktokAccessToken: settingsRes.data.tiktokAccessToken || ""
        });
      }
      if (goalsRes.success && goalsRes.data) {
        setMonthlyGoal({
          spendGoal: goalsRes.data.spendGoal || 0,
          revenueGoal: goalsRes.data.revenueGoal || 0,
          cpaGoal: goalsRes.data.cpaGoal || 0
        });
      } else {
        setMonthlyGoal({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });
      }
      setFetching(false);
    }).catch(() => setFetching(false));
  }, [selectedGoalMonth, selectedGoalYear]);

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

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setSavingSettings(true);
    try {
      const currentSettings = await fetch("/api/settings").then(r => r.json());
      const payload = { ...currentSettings.data, ...settings };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("Configurações salvas com sucesso!");
      } else {
        alert("Erro ao salvar configurações.");
      }
    } catch (err) {
      alert("Erro ao salvar configurações.");
    }
    setLoading(false);
    setSavingSettings(false);
  };

  const handleSaveMonthlyGoal = async () => {
    setSavingGoal(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedGoalMonth,
          year: selectedGoalYear,
          ...monthlyGoal
        })
      });
      if (!res.ok) throw new Error();
      alert("Metas mensais salvas!");
    } catch (e) {
      alert("Erro ao salvar metas mensais");
    }
    setSavingGoal(false);
  };

  const handleAddCreator = async () => {
    if (!newCreator.name || !newCreator.acronym) return;
    try {
      const mGoal = Number(newCreator.monthlyGoal) || 50000;
      const mVolGoal = Number(newCreator.monthlyVolumeGoal) || 30;
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newCreator, monthlyGoal: mGoal, monthlyVolumeGoal: mVolGoal })
      });
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCreator = async () => {
    if (!editingCreatorId || !newCreator.name || !newCreator.acronym) return;
    try {
      const mGoal = Number(newCreator.monthlyGoal) || 50000;
      const mVolGoal = Number(newCreator.monthlyVolumeGoal) || 30;
      const res = await fetch(`/api/creators`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCreatorId, ...newCreator, monthlyGoal: mGoal, monthlyVolumeGoal: mVolGoal })
      });
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
        setEditingCreatorId(null);
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditCreator = (c: any) => {
    setEditingCreatorId(c.id);
    setNewCreator({
      name: c.name,
      acronym: c.acronym,
      avatarUrl: c.avatarUrl || "",
      monthlyGoal: c.monthlyGoal || 50000,
      monthlyVolumeGoal: c.monthlyVolumeGoal || 30
    });
  };

  const handleCancelEdit = () => {
    setEditingCreatorId(null);
    setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
  };

  const handleDeleteCreator = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este criador?")) return;
    try {
      const res = await fetch(`/api/creators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const tabs = [
    { id: "metas", label: "Metas & KPIs" },
    { id: "equipe", label: "Equipe" },
    { id: "sistema", label: "Sistema" },
    { id: "ia", label: "Inteligência Artificial" },
    { id: "api", label: "Integrações (API)" },
    { id: "logs", label: "Logs" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopBar />
      <div className="dashboard-container" style={{ flexDirection: "column", maxWidth: "900px", paddingBottom: "4rem" }}>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>Configurações Globais<span className="dot-green">.</span></h1>
          <p style={{ color: "var(--muted)" }}>Central de controle de metas, regras de negócio e infraestrutura do sistema.</p>
        </div>

        <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px" }}>
          {fetching ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "4rem", opacity: 0.5 }}>
              <Loader2 className="spin" size={32} style={{ animation: "spin 2s linear infinite", color: "var(--primary)" }} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              
              {/* Navegação Interna */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", borderBottom: "1px solid var(--card-border)", paddingBottom: "0.5rem" }}>
                {tabs.map(tab => (
                  <button 
                    key={tab.id}
                    type="button" 
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      if (tab.id === "logs") fetchLogs();
                    }}
                    style={{ 
                      background: "none", border: "none", cursor: "pointer", 
                      fontWeight: activeTab === tab.id ? 600 : 400,
                      color: activeTab === tab.id ? "var(--foreground)" : "var(--foreground-muted)",
                      borderBottom: activeTab === tab.id ? "2px solid var(--foreground)" : "2px solid transparent",
                      paddingBottom: "0.5rem", marginBottom: "-0.5rem", fontSize: "0.95rem"
                    }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

                {/* METAS & KPIS */}
                {activeTab === "metas" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    
                    {/* Metas Mensais */}
                    <div style={{ padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "rgba(0,0,0,0.02)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Metas de KPIs Mensais</h3>
                        <div style={{ display: "flex", gap: "1rem" }}>
                          <select value={selectedGoalMonth} onChange={e => setSelectedGoalMonth(Number(e.target.value))} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)", fontWeight: 600 }}>
                            <option value={1}>Janeiro</option><option value={2}>Fevereiro</option><option value={3}>Março</option>
                            <option value={4}>Abril</option><option value={5}>Maio</option><option value={6}>Junho</option>
                            <option value={7}>Julho</option><option value={8}>Agosto</option><option value={9}>Setembro</option>
                            <option value={10}>Outubro</option><option value={11}>Novembro</option><option value={12}>Dezembro</option>
                          </select>
                          <input type="number" value={selectedGoalYear} onChange={e => setSelectedGoalYear(Number(e.target.value))} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)", fontWeight: 600, width: "80px" }} />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                          <span style={{ fontWeight: 600 }}>Investimento (R$)</span>
                          <input type="text" value={formatCurrencyInput(monthlyGoal.spendGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, spendGoal: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                          <span style={{ fontWeight: 600 }}>Receita Líquida (R$)</span>
                          <input type="text" value={formatCurrencyInput(monthlyGoal.revenueGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, revenueGoal: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                          <span style={{ fontWeight: 600 }}>CPA Máximo (R$)</span>
                          <input type="text" value={formatCurrencyInput(monthlyGoal.cpaGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, cpaGoal: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                        </label>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                        <button type="button" onClick={handleSaveMonthlyGoal} disabled={savingGoal} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {savingGoal ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                          Salvar Metas do Mês
                        </button>
                      </div>
                    </div>

                    {/* Critérios de IA */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Critérios de Performance (Classificação IA)</h3>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.5rem", background: "rgba(39, 174, 96, 0.05)", borderRadius: "12px", border: "1px solid rgba(39, 174, 96, 0.2)" }}>
                        <h4 style={{ fontSize: "1rem", margin: 0, fontWeight: 600, color: "var(--success)" }}>Super Winners</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>Gasto Mínimo (R$)
                            <input type="text" required value={formatCurrencyInput(settings.superWinnerSpend)} onChange={e => setSettings({...settings, superWinnerSpend: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>Retorno Mínimo (R$)
                            <input type="text" required value={formatCurrencyInput(settings.superWinnerReturn)} onChange={e => setSettings({...settings, superWinnerReturn: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>CPA Máximo (R$)
                            <input type="text" required value={formatCurrencyInput(settings.superWinnerCpa)} onChange={e => setSettings({...settings, superWinnerCpa: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                          </label>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1.5rem", background: "rgba(59, 130, 246, 0.05)", borderRadius: "12px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                        <h4 style={{ fontSize: "1rem", margin: 0, fontWeight: 600, color: "#3b82f6" }}>Winners</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>Gasto Mínimo (R$)
                            <input type="text" required value={formatCurrencyInput(settings.winnerSpend)} onChange={e => setSettings({...settings, winnerSpend: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>Retorno Mínimo (R$)
                            <input type="text" required value={formatCurrencyInput(settings.winnerReturn)} onChange={e => setSettings({...settings, winnerReturn: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>CPA Máximo (R$)
                            <input type="text" required value={formatCurrencyInput(settings.winnerCpa)} onChange={e => setSettings({...settings, winnerCpa: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* EQUIPE */}
                {activeTab === "equipe" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Meta Global do Time (peças/mês)</span>
                        <input type="number" required value={settings.teamCreativeGoal} onChange={e => setSettings({...settings, teamCreativeGoal: Number(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", maxWidth: "200px" }} />
                      </label>
                    </div>

                    <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1.5rem" }}>
                      <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
                        {editingCreatorId ? "Editar Membro da Equipe" : "Adicionar Novo Membro"}
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Nome do Criador</span>
                          <input type="text" value={newCreator.name} onChange={e => setNewCreator({...newCreator, name: e.target.value})} placeholder="Ex: Raphael Madureira" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Siglas (Até 3, separadas por vírgula)</span>
                          <input type="text" value={newCreator.acronym} onChange={e => setNewCreator({...newCreator, acronym: e.target.value.toUpperCase()})} placeholder="Ex: RM, RAPHAELMADUREIRA" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", textTransform: "uppercase" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>URL da Foto (Avatar) - Opcional</span>
                          <input type="url" value={newCreator.avatarUrl} onChange={e => setNewCreator({...newCreator, avatarUrl: e.target.value})} placeholder="https://..." style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta Mensal (R$)</span>
                          <input type="text" value={formatCurrencyInput(newCreator.monthlyGoal)} onChange={e => setNewCreator({...newCreator, monthlyGoal: parseCurrencyInput(e.target.value)})} placeholder="50.000,00" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta Volume (Peças/mês)</span>
                          <input type="number" value={newCreator.monthlyVolumeGoal} onChange={e => setNewCreator({...newCreator, monthlyVolumeGoal: Number(e.target.value)})} placeholder="30" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                        <button type="button" onClick={editingCreatorId ? handleUpdateCreator : handleAddCreator} style={{ flex: 1, background: "var(--foreground)", color: "var(--background-main)", border: "none", padding: "0.8rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                          {editingCreatorId ? <Save size={18} /> : <Plus size={18} />}
                          {editingCreatorId ? "Salvar Alterações" : "Adicionar Membro"}
                        </button>
                        {editingCreatorId && (
                          <button type="button" onClick={handleCancelEdit} style={{ flex: 1, background: "transparent", border: "1px solid var(--card-border)", color: "var(--foreground)", padding: "0.8rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: "0 0 0.5rem 0" }}>Equipe Atual</h3>
                      {creators.map(c => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid var(--card-border)", borderRadius: "8px", background: "var(--card-bg)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <Avatar name={c.name} url={c.avatarUrl} size="md" />
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 600 }}>{c.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({c.acronym})</span></span>
                              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Meta: R$ {parseFloat(c.monthlyGoal).toLocaleString('pt-BR')} | {c.monthlyVolumeGoal} peças</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button type="button" onClick={() => handleEditCreator(c)} style={{ background: "transparent", border: "1px solid var(--card-border)", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer", color: "var(--foreground)", fontWeight: 600 }}>Editar</button>
                            <button type="button" onClick={() => handleDeleteCreator(c.id)} style={{ background: "rgba(239, 68, 68, 0.1)", border: "none", padding: "0.5rem", borderRadius: "6px", cursor: "pointer", color: "#ef4444" }} title="Remover"><Trash2 size={18} /></button>
                          </div>
                        </div>
                      ))}
                      {creators.length === 0 && (
                        <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--card-border)", borderRadius: "8px" }}>
                          Nenhum criador cadastrado.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* GERAL & SISTEMA */}
                {activeTab === "sistema" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Automação e Background Tasks</h3>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: "1rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={settings.cronSyncEnabled} onChange={e => setSettings({...settings, cronSyncEnabled: e.target.checked})} style={{ width: "1.2rem", height: "1.2rem", marginTop: "0.2rem", cursor: "pointer", accentColor: "var(--primary)" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Sincronização Automática Ativa (Cron)</span>
                          <span style={{ fontSize: "0.85rem", color: "var(--muted)", opacity: 0.8 }}>Quando ativado, o sistema irá se sincronizar com as plataformas de anúncios automaticamente nos bastidores.</span>
                        </div>
                      </label>
                      {settings.cronSyncEnabled && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)", marginLeft: "2.2rem" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                            <span style={{ fontWeight: 600 }}>Intervalo de Execução</span>
                            <select value={settings.cronSyncInterval} onChange={e => setSettings({...settings, cronSyncInterval: Number(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none" }}>
                              <option value={30}>A cada 30 minutos</option>
                              <option value={60}>A cada 1 hora</option>
                              <option value={120}>A cada 2 horas</option>
                              <option value={360}>A cada 6 horas</option>
                              <option value={720}>A cada 12 horas</option>
                              <option value={1440}>Uma vez por dia (24h)</option>
                            </select>
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                            <span style={{ fontWeight: 600 }}>Modo da Sincronização Automática</span>
                            <select value={settings.cronSyncMode} onChange={e => setSettings({...settings, cronSyncMode: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", outline: "none" }}>
                              <option value="metrics">Rápida (Apenas Métricas, Instantâneo)</option>
                              <option value="full">Profunda (Métricas + Download de Mídias)</option>
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Hospedagem de Imagens (cPanel)</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                          <span style={{ fontWeight: 600 }}>URL de Upload (Webhook)</span>
                          <input type="url" value={settings.cpanelUploadUrl} onChange={e => setSettings({...settings, cpanelUploadUrl: e.target.value})} placeholder="https://..." style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                          <span style={{ fontWeight: 600 }}>Senha (Secret Token)</span>
                          <input type="password" value={settings.cpanelUploadSecret} onChange={e => setSettings({...settings, cpanelUploadSecret: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* INTELIGÊNCIA ARTIFICIAL */}
                {activeTab === "ia" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Análises de Plataforma (Prompts)</h3>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <span style={{ fontWeight: 600 }}>Analisar Criativo Individual (Botão)</span>
                        <textarea value={settings.hypothesisPrompt} onChange={e => setSettings({...settings, hypothesisPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <span style={{ fontWeight: 600 }}>Insights de Campanha (Dashboard Geral)</span>
                        <textarea value={settings.insightsPrompt} onChange={e => setSettings({...settings, insightsPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <span style={{ fontWeight: 600 }}>Auditoria de Entity IDs (Projeto Andromeda)</span>
                        <textarea value={settings.andromedaPrompt} onChange={e => setSettings({...settings, andromedaPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
                      </label>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Pesquisa Web Automática (Tavily)</h3>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <span style={{ fontWeight: 600 }}>Termos de Pesquisa Base (Query)</span>
                        <textarea value={settings.tavilySearchQuery} onChange={e => setSettings({...settings, tavilySearchQuery: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "80px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <span style={{ fontWeight: 600 }}>Curador de Insights de Mercado (Prompt)</span>
                        <textarea value={settings.marketInsightsPrompt} onChange={e => setSettings({...settings, marketInsightsPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
                      </label>
                    </div>
                  </div>
                )}

                {/* INTEGRAÇÕES (API) */}
                {activeTab === "api" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #1877F2" }}>Meta Ads</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Ad Account ID</span><input type="text" value={settings.metaAdAccountId} onChange={e => setSettings({...settings, metaAdAccountId: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Access Token</span><input type="password" value={settings.metaAccessToken} onChange={e => setSettings({...settings, metaAccessToken: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                      </div>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #00f2ea" }}>TikTok Ads</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Advertiser ID</span><input type="text" value={settings.tiktokAdvertiserId} onChange={e => setSettings({...settings, tiktokAdvertiserId: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Access Token</span><input type="password" value={settings.tiktokAccessToken} onChange={e => setSettings({...settings, tiktokAccessToken: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                      </div>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #DB4437" }}>Google OAuth (Login)</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Client ID</span><input type="text" value={settings.googleClientId} onChange={e => setSettings({...settings, googleClientId: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Client Secret</span><input type="password" value={settings.googleClientSecret} onChange={e => setSettings({...settings, googleClientSecret: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                      </div>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #10b981" }}>Provedores de IA</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Google Gemini API Key</span><input type="password" value={settings.geminiApiKey} onChange={e => setSettings({...settings, geminiApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>OpenAI API Key</span><input type="password" value={settings.openaiApiKey} onChange={e => setSettings({...settings, openaiApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Anthropic API Key</span><input type="password" value={settings.anthropicApiKey} onChange={e => setSettings({...settings, anthropicApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}><span style={{ fontWeight: 600 }}>Groq API Key</span><input type="password" value={settings.groqApiKey} onChange={e => setSettings({...settings, groqApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} /></label>
                      </div>
                    </div>
                  </div>
                )}

                {/* LOGS DO SISTEMA */}
                {activeTab === "logs" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Logs do Sistema</h3>
                      <button type="button" onClick={clearLogs} style={{ background: "none", border: "none", color: "var(--danger, #ef4444)", cursor: "pointer", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                        <Trash2 size={16} /> Limpar Logs
                      </button>
                    </div>
                    {fetchingLogs ? (
                      <div style={{ textAlign: "center", padding: "4rem" }}><Loader2 size={32} className="spin mx-auto" /></div>
                    ) : sysLogs.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "4rem 1rem", border: "1px dashed var(--card-border)", borderRadius: "12px" }}>Nenhum log registrado.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "60vh", overflowY: "auto" }}>
                        {sysLogs.map((log: any) => (
                          <div key={log.id} style={{ padding: "1.2rem", borderRadius: "12px", background: "var(--background)", borderLeft: `4px solid ${log.level === 'ERROR' ? '#ef4444' : log.level === 'WARNING' ? '#f59e0b' : '#3b82f6'}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--foreground-muted)", marginBottom: "0.5rem" }}>
                              <span style={{ fontWeight: 700, color: "var(--foreground)" }}>[{log.source}] {log.level}</span>
                              <span>{new Date(log.createdAt).toLocaleString()}</span>
                            </div>
                            <div style={{ fontSize: "1rem", fontWeight: 500 }}>{log.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ACTION BUTTON (Hide on logs) */}
                {activeTab !== "logs" && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid var(--card-border)" }}>
                    <button type="submit" disabled={loading} style={{
                      padding: "1rem 2rem", borderRadius: "8px", border: "none",
                      background: "var(--foreground)", color: "var(--background-main)",
                      fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", fontSize: "1rem"
                    }}>
                      {loading ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                      Salvar Configurações
                    </button>
                  </div>
                )}

              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

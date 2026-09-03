"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";

export default function IAPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [settings, setSettings] = useState({
    hypothesisPrompt: "",
    insightsPrompt: "",
    andromedaPrompt: "",
    tavilySearchQuery: "",
    marketInsightsPrompt: "",
  });

  useEffect(() => {
    setFetching(true);
    fetch("/api/settings")
      .then(r => r.json())
      .then((settingsRes) => {
        if (settingsRes.success && settingsRes.data) {
          setSettings({
            hypothesisPrompt: settingsRes.data.hypothesisPrompt ?? "",
            insightsPrompt: settingsRes.data.insightsPrompt ?? "",
            andromedaPrompt: settingsRes.data.andromedaPrompt ?? "",
            tavilySearchQuery: settingsRes.data.tavilySearchQuery ?? "",
            marketInsightsPrompt: settingsRes.data.marketInsightsPrompt ?? "",
          });
        }
      })
      .finally(() => setFetching(false));
  }, []);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert("Configurações de IA salvas com sucesso!");
      } else {
        alert("Erro ao salvar configurações de IA.");
      }
    } catch (err) {
      alert("Erro ao salvar configurações de IA.");
    }
    setSavingSettings(false);
  };

  if (fetching) {
    return (
      <div className="glass-panel" style={{ padding: "4rem", display: "flex", justifyContent: "center", opacity: 0.5 }}>
        <Loader2 className="spin" size={32} color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px" }}>
      <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Análises de Plataforma (Prompts)</h3>
          <button type="submit" disabled={savingSettings} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Salvar Prompts
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
      </form>
    </div>
  );
}

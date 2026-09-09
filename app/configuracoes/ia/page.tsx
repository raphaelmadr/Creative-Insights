"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Sparkles } from "lucide-react";

export default function IAPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  /**
   * Transcrição em lote das peças ativas.
   *
   * Vive aqui, e não na navegação principal, porque é manutenção: custa uma
   * chamada de visão por criativo e roda de vez em quando, não a cada acesso.
   * Fica ao lado do prompt que a governa — edita-se o prompt e roda-se o lote.
   */
  const [transcribing, setTranscribing] = useState(false);

  const handleTranscribeBatch = async () => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const res = await fetch("/api/creatives/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "active" }),
      });
      const data = await res.json();
      alert(data.message || data.error || "Transcrição concluída.");
    } catch (e) {
      alert("Erro ao transcrever os criativos.");
    }
    setTranscribing(false);
  };

  const [settings, setSettings] = useState({
    hypothesisPrompt: "",
    visionPrompt: "",
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
            visionPrompt: settingsRes.data.visionPrompt ?? "",
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
            <span style={{ fontWeight: 600 }}>Transcrição Visual do Criativo</span>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              Primeira etapa de toda análise: a IA recebe a imagem e devolve o que está nela — headline, subheadline, CTA, textos, cores e elementos.
              Deve retornar JSON. É o que substitui a antiga leitura pelo nome do arquivo, e o resultado fica em cache por criativo.
            </span>
            <textarea value={settings.visionPrompt} onChange={e => setSettings({...settings, visionPrompt: e.target.value})} placeholder="Em branco usa o prompt padrão de transcrição." style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleTranscribeBatch}
                disabled={transcribing}
                style={{ background: "transparent", color: "var(--primary)", border: "1px solid var(--primary)", padding: "0.5rem 1rem", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem", cursor: transcribing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {transcribing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                {transcribing ? "Transcrevendo..." : "Transcrever peças ativas agora"}
              </button>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", opacity: 0.8 }}>
                Processa em lote as peças ativas que ainda não têm transcrição, deixando as análises prontas de antemão.
                Sob demanda isso já acontece sozinho na primeira análise de cada peça.
              </span>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 600 }}>Analisar Criativo Individual (Botão)</span>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              Recebe a transcrição acima somada aos números do período. A transcrição é anexada automaticamente, não precisa de variável no prompt.
            </span>
            <textarea value={settings.hypothesisPrompt} onChange={e => setSettings({...settings, hypothesisPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
          </label>
          
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 600 }}>Análise de Similaridade (Projeto Andromeda)</span>
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

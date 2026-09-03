"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";

export default function ApiPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [settings, setSettings] = useState({
    metaAdAccountId: "",
    metaAccessToken: "",
    tiktokAdvertiserId: "",
    tiktokAccessToken: "",
    googleClientId: "",
    googleClientSecret: "",
    slackBotToken: "",
    slackChannelId: "",
    geminiApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    groqApiKey: "",
  });

  useEffect(() => {
    setFetching(true);
    fetch("/api/settings")
      .then(r => r.json())
      .then((settingsRes) => {
        if (settingsRes.success && settingsRes.data) {
          setSettings({
            metaAdAccountId: settingsRes.data.metaAdAccountId ?? "",
            metaAccessToken: settingsRes.data.metaAccessToken ?? "",
            tiktokAdvertiserId: settingsRes.data.tiktokAdvertiserId ?? "",
            tiktokAccessToken: settingsRes.data.tiktokAccessToken ?? "",
            googleClientId: settingsRes.data.googleClientId ?? "",
            googleClientSecret: settingsRes.data.googleClientSecret ?? "",
            slackBotToken: settingsRes.data.slackBotToken ?? "",
            slackChannelId: settingsRes.data.slackChannelId ?? "",
            geminiApiKey: settingsRes.data.geminiApiKey ?? "",
            openaiApiKey: settingsRes.data.openaiApiKey ?? "",
            anthropicApiKey: settingsRes.data.anthropicApiKey ?? "",
            groqApiKey: settingsRes.data.groqApiKey ?? "",
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
        alert("Configurações de API salvas com sucesso!");
      } else {
        alert("Erro ao salvar integrações de API.");
      }
    } catch (err) {
      alert("Erro ao salvar integrações de API.");
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
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Integrações & APIs</h3>
          <button type="submit" disabled={savingSettings} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Salvar Integrações
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #1877F2" }}>Meta Ads</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Ad Account ID</span>
              <input type="text" value={settings.metaAdAccountId} onChange={e => setSettings({...settings, metaAdAccountId: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Access Token</span>
              <input type="password" value={settings.metaAccessToken} onChange={e => setSettings({...settings, metaAccessToken: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #00f2ea" }}>TikTok Ads</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Advertiser ID</span>
              <input type="text" value={settings.tiktokAdvertiserId} onChange={e => setSettings({...settings, tiktokAdvertiserId: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Access Token</span>
              <input type="password" value={settings.tiktokAccessToken} onChange={e => setSettings({...settings, tiktokAccessToken: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #DB4437" }}>Google OAuth (Login)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Client ID</span>
              <input type="text" value={settings.googleClientId} onChange={e => setSettings({...settings, googleClientId: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Client Secret</span>
              <input type="password" value={settings.googleClientSecret} onChange={e => setSettings({...settings, googleClientSecret: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #4a154b" }}>Slack API</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Bot User OAuth Token</span>
              <input type="password" value={settings.slackBotToken} onChange={e => setSettings({...settings, slackBotToken: e.target.value})} placeholder="xoxb-..." style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Channel ID</span>
              <input type="text" value={settings.slackChannelId} onChange={e => setSettings({...settings, slackChannelId: e.target.value})} placeholder="C0123456789" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />
        
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0, paddingLeft: "0.5rem", borderLeft: "4px solid #10b981" }}>Provedores de IA</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Google Gemini API Key</span>
              <input type="password" value={settings.geminiApiKey} onChange={e => setSettings({...settings, geminiApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>OpenAI API Key</span>
              <input type="password" value={settings.openaiApiKey} onChange={e => setSettings({...settings, openaiApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Anthropic API Key</span>
              <input type="password" value={settings.anthropicApiKey} onChange={e => setSettings({...settings, anthropicApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Groq API Key</span>
              <input type="password" value={settings.groqApiKey} onChange={e => setSettings({...settings, groqApiKey: e.target.value})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", fontFamily: "monospace" }} />
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";

export default function SistemaPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [settings, setSettings] = useState({
    cronSyncEnabled: true,
    cronSyncMode: "metrics",
    cronSyncInterval: 120,
    cpanelUploadUrl: "",
    cpanelUploadSecret: "",
  });

  useEffect(() => {
    setFetching(true);
    fetch("/api/settings")
      .then(r => r.json())
      .then((settingsRes) => {
        if (settingsRes.success && settingsRes.data) {
          setSettings({
            cronSyncEnabled: settingsRes.data.cronSyncEnabled ?? true,
            cronSyncMode: settingsRes.data.cronSyncMode ?? "metrics",
            cronSyncInterval: settingsRes.data.cronSyncInterval ?? 120,
            cpanelUploadUrl: settingsRes.data.cpanelUploadUrl ?? "",
            cpanelUploadSecret: settingsRes.data.cpanelUploadSecret ?? "",
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
        alert("Configurações do sistema salvas com sucesso!");
      } else {
        alert("Erro ao salvar configurações do sistema.");
      }
    } catch (err) {
      alert("Erro ao salvar configurações do sistema.");
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
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Automação e Background Tasks</h3>
          <button type="submit" disabled={savingSettings} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Salvar Alterações
          </button>
        </div>

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
      </form>
    </div>
  );
}

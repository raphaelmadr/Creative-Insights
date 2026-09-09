"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Copy, Check, PlayCircle, AlertTriangle } from "lucide-react";

/** Cadência recomendada para o disparador externo: bate sempre, o painel filtra. */
const RECOMMENDED_CRON_EXPRESSION = "*/15 * * * *";

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function SistemaPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    cronSyncEnabled: true,
    cronSyncMode: "metrics",
    cronSyncInterval: 120,
    cpanelUploadUrl: "",
    cpanelUploadSecret: "",
  });

  // Informação só de leitura: estado da automação e fontes com credenciais.
  const [status, setStatus] = useState<{
    lastCronSyncAt?: string | null;
    lastSyncAt?: string | null;
    sources: { label: string; configured: boolean }[];
  }>({ sources: [] });

  const [endpointUrl, setEndpointUrl] = useState("");

  const loadSettings = React.useCallback(() => {
    return fetch("/api/settings")
      .then(r => r.json())
      .then((settingsRes) => {
        if (settingsRes.success && settingsRes.data) {
          const data = settingsRes.data;
          setSettings({
            cronSyncEnabled: data.cronSyncEnabled ?? true,
            cronSyncMode: data.cronSyncMode ?? "metrics",
            cronSyncInterval: data.cronSyncInterval ?? 120,
            cpanelUploadUrl: data.cpanelUploadUrl ?? "",
            cpanelUploadSecret: data.cpanelUploadSecret ?? "",
          });
          setStatus({
            lastCronSyncAt: data.lastCronSyncAt,
            lastSyncAt: data.lastSyncAt,
            sources: [
              { label: "Meta", configured: !!(data.metaAdAccountId && data.metaAccessToken) },
              { label: "TikTok", configured: !!(data.tiktokAdvertiserId && data.tiktokAccessToken) },
              { label: "Entregas (Slack)", configured: !!(data.slackBotToken && data.slackChannelId) },
            ],
          });
        }
      });
  }, []);

  useEffect(() => {
    setEndpointUrl(`${window.location.origin}/api/cron/sync-all`);
    setFetching(true);
    loadSettings().finally(() => setFetching(false));
  }, [loadSettings]);

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

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard bloqueado (contexto não seguro) — o campo é selecionável.
    }
  };

  const handleTestNow = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await fetch("/api/sync-scheduled", { method: "POST" });
      const data = await res.json();
      alert(
        data.success
          ? `Execução concluída.\n\n${data.message || ""}`
          : `A execução reportou falha.\n\n${data.message || data.error || "Erro desconhecido"}`
      );
      await loadSettings();
    } catch (e) {
      alert("Erro ao disparar a sincronização de teste.");
    }
    setTesting(false);
  };

  if (fetching) {
    return (
      <div className="glass-panel" style={{ padding: "4rem", display: "flex", justifyContent: "center", opacity: 0.5 }}>
        <Loader2 className="spin" size={32} color="var(--primary)" />
      </div>
    );
  }

  const nextEligible = status.lastCronSyncAt
    ? new Date(new Date(status.lastCronSyncAt).getTime() + settings.cronSyncInterval * 60 * 1000).toISOString()
    : null;

  const noSourceConfigured = status.sources.every(s => !s.configured);

  const inputStyle: React.CSSProperties = {
    padding: "0.8rem",
    borderRadius: "8px",
    border: "1px solid var(--card-border)",
    background: "var(--card-bg)",
    color: "var(--foreground)",
    outline: "none",
  };

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
            <span style={{ fontSize: "0.85rem", color: "var(--muted)", opacity: 0.8 }}>Quando ativado, o sistema se sincroniza com as plataformas de anúncios e com as entregas do Slack automaticamente nos bastidores.</span>
          </div>
        </label>

        {settings.cronSyncEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)", marginLeft: "2.2rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
                <span style={{ fontWeight: 600 }}>Intervalo de Execução</span>
                <select value={settings.cronSyncInterval} onChange={e => setSettings({...settings, cronSyncInterval: Number(e.target.value)})} style={inputStyle}>
                  <option value={15}>A cada 15 minutos</option>
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
                <select value={settings.cronSyncMode} onChange={e => setSettings({...settings, cronSyncMode: e.target.value})} style={inputStyle}>
                  <option value="metrics">Rápida (Apenas Métricas, Instantâneo)</option>
                  <option value="full">Profunda (Métricas + Download de Mídias)</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
              <span><strong style={{ color: "var(--foreground)" }}>Última execução automática:</strong> {formatDateTime(status.lastCronSyncAt)}</span>
              <span><strong style={{ color: "var(--foreground)" }}>Próxima janela elegível:</strong> {formatDateTime(nextEligible)}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--muted)" }}>Fontes incluídas:</span>
              {status.sources.map(source => (
                <span key={source.label} style={{ padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--card-border)", background: source.configured ? "rgba(34,197,94,0.12)" : "transparent", color: source.configured ? "#16a34a" : "var(--muted)", opacity: source.configured ? 1 : 0.6 }}>
                  {source.label}{source.configured ? "" : " (sem credenciais)"}
                </span>
              ))}
            </div>

            {noSourceConfigured && (
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.85rem", color: "#b45309", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "0.8rem" }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <span>Nenhuma fonte tem credenciais cadastradas — a automação não tem o que sincronizar. Preencha as chaves em Configurações › API.</span>
              </div>
            )}
          </div>
        )}

        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Disparador Externo (Cron Job do cPanel)</h3>
            <button type="button" onClick={handleTestNow} disabled={testing} style={{ background: "transparent", color: "var(--primary)", border: "1px solid var(--primary)", padding: "0.6rem 1.2rem", borderRadius: "6px", fontWeight: 600, cursor: testing ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {testing ? <Loader2 size={16} className="spin" /> : <PlayCircle size={16} />}
              {testing ? "Sincronizando..." : "Testar agora"}
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            O disparador só acorda a aplicação — quem decide se sincroniza, com que frequência e em que
            profundidade são as configurações acima. Por isso configure o cron do cPanel para bater
            sempre no intervalo mais curto (<code>{RECOMMENDED_CRON_EXPRESSION}</code>, a cada 15 min):
            mudar o intervalo aqui no painel passa a valer na hora, sem mexer no servidor.
          </p>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 600 }}>URL para o disparador</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input readOnly value={endpointUrl} onFocus={e => e.currentTarget.select()} style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: "0.82rem" }} />
              <button type="button" onClick={() => handleCopy(endpointUrl, "url")} title="Copiar URL" style={{ background: "transparent", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0 0.9rem", cursor: "pointer", color: "var(--foreground)", display: "flex", alignItems: "center" }}>
                {copied === "url" ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
              </button>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 600 }}>Comando sugerido no cPanel</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input readOnly value={`curl -fsS -H "Authorization: Bearer $CRON_SECRET" "${endpointUrl}"`} onFocus={e => e.currentTarget.select()} style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: "0.82rem" }} />
              <button type="button" onClick={() => handleCopy(`curl -fsS -H "Authorization: Bearer $CRON_SECRET" "${endpointUrl}"`, "cmd")} title="Copiar comando" style={{ background: "transparent", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0 0.9rem", cursor: "pointer", color: "var(--foreground)", display: "flex", alignItems: "center" }}>
                {copied === "cmd" ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
              </button>
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8 }}>
              Se o disparador só aceitar uma URL crua, use <code>{endpointUrl}?secret=SEU_CRON_SECRET</code>.
            </span>
          </label>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Hospedagem de Imagens (cPanel)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>URL de Upload (Webhook)</span>
              <input type="url" value={settings.cpanelUploadUrl} onChange={e => setSettings({...settings, cpanelUploadUrl: e.target.value})} placeholder="https://..." style={{ ...inputStyle, fontFamily: "monospace" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Senha (Secret Token)</span>
              <input type="password" value={settings.cpanelUploadSecret} onChange={e => setSettings({...settings, cpanelUploadSecret: e.target.value})} style={{ ...inputStyle, fontFamily: "monospace" }} />
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}

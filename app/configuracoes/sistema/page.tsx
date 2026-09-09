"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Copy, Check, AlertTriangle, RefreshCw, Eye, EyeOff, ShieldCheck, ShieldAlert } from "lucide-react";

/** Cadência do disparador externo: bate sempre, o painel filtra. */
const RECOMMENDED_CRON_EXPRESSION = "*/15 * * * *";

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

interface CronTriggerState {
  hasSecret: boolean;
  hasDbSecret: boolean;
  hasEnvSecret: boolean;
  baseUrl: string | null;
  reachableExternally: boolean;
  triggerUrl: string | null;
  triggerCommand: string | null;
}

/** O Cron Jobs padrão do cPanel executa um comando; alguns disparadores só aceitam um link. */
type TriggerFormat = "command" | "url";

export default function SistemaPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealUrl, setRevealUrl] = useState(false);
  const [format, setFormat] = useState<TriggerFormat>("command");

  const [settings, setSettings] = useState({
    cronSyncEnabled: true,
    cronSyncInterval: 120,
    cpanelUploadUrl: "",
    cpanelUploadSecret: "",
  });

  // Informação só de leitura: estado da automação e fontes com credenciais.
  const [status, setStatus] = useState<{
    lastSyncAt?: string | null;
    lastCronSyncAt?: string | null;
    sources: { label: string; configured: boolean }[];
  }>({ sources: [] });

  const [trigger, setTrigger] = useState<CronTriggerState | null>(null);

  const loadAll = React.useCallback(() => {
    return Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/settings/cron-secret").then(r => r.json()),
    ]).then(([settingsRes, cronRes]) => {
      if (settingsRes.success && settingsRes.data) {
        const data = settingsRes.data;
        setSettings({
          cronSyncEnabled: data.cronSyncEnabled ?? true,
          cronSyncInterval: data.cronSyncInterval ?? 120,
          cpanelUploadUrl: data.cpanelUploadUrl ?? "",
          cpanelUploadSecret: data.cpanelUploadSecret ?? "",
        });
        setStatus({
          lastSyncAt: data.lastSyncAt,
          lastCronSyncAt: data.lastCronSyncAt,
          // Espelha o registro de fontes do backend (`lib/channels.ts`).
          sources: [
            { label: "Meta", configured: !!(data.metaAdAccountId && data.metaAccessToken) },
            { label: "TikTok", configured: !!(data.tiktokAdvertiserId && data.tiktokAccessToken) },
            { label: "Entregas", configured: !!(data.slackBotToken && data.slackChannelId) },
          ],
        });
      }
      if (cronRes.success) setTrigger(cronRes);
    });
  }, []);

  useEffect(() => {
    setFetching(true);
    loadAll().finally(() => setFetching(false));
  }, [loadAll]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      alert(res.ok ? "Configurações do sistema salvas com sucesso!" : "Erro ao salvar configurações do sistema.");
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

  const handleRotateSecret = async () => {
    if (rotating) return;
    if (trigger?.hasDbSecret && !window.confirm(
      "Gerar um segredo novo invalida o atual. O disparador do cPanel vai receber 401 até você colar o valor novo lá. Continuar?"
    )) return;

    setRotating(true);
    try {
      const res = await fetch("/api/settings/cron-secret", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTrigger(data);
        setRevealUrl(true);
      } else {
        alert("Erro ao gerar o segredo: " + (data.error || "desconhecido"));
      }
    } catch (e) {
      alert("Erro ao gerar o segredo do cron.");
    }
    setRotating(false);
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
  const nextEligibleLabel = nextEligible && new Date(nextEligible).getTime() <= Date.now()
    ? "a qualquer momento"
    : formatDateTime(nextEligible);

  const noSourceConfigured = status.sources.every(s => !s.configured);
  const triggerValue = (format === "command" ? trigger?.triggerCommand : trigger?.triggerUrl) ?? "";
  const urlUsable = !!triggerValue && !!trigger?.reachableExternally && !!trigger?.hasSecret;

  const inputStyle: React.CSSProperties = {
    padding: "0.8rem",
    borderRadius: "8px",
    border: "1px solid var(--card-border)",
    background: "var(--card-bg)",
    color: "var(--foreground)",
    outline: "none",
  };

  const iconButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--card-border)",
    borderRadius: "8px",
    padding: "0 0.9rem",
    cursor: "pointer",
    color: "var(--foreground)",
    display: "flex",
    alignItems: "center",
  };

  const noticeStyle = (tone: "warn" | "info"): React.CSSProperties => ({
    display: "flex",
    gap: "0.6rem",
    alignItems: "flex-start",
    fontSize: "0.82rem",
    lineHeight: 1.5,
    color: tone === "warn" ? "#b45309" : "var(--muted)",
    background: tone === "warn" ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.02)",
    border: `1px solid ${tone === "warn" ? "rgba(245,158,11,0.3)" : "var(--card-border)"}`,
    borderRadius: "8px",
    padding: "0.8rem",
  });

  return (
    <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px" }}>
      <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Sincronização Automática</h3>
          <button type="submit" disabled={savingSettings} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Salvar Alterações
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
          Existem duas sincronizações no sistema, e as duas fazem exatamente a mesma coisa: percorrem
          todas as fontes configuradas, no mês corrente. A <strong>manual</strong> é o botão
          &quot;Sincronizar Redes&quot; no topo, a qualquer momento. A <strong>automática</strong> é esta,
          no intervalo definido abaixo.
        </p>

        <label style={{ display: "flex", alignItems: "flex-start", gap: "1rem", cursor: "pointer" }}>
          <input type="checkbox" checked={settings.cronSyncEnabled} onChange={e => setSettings({...settings, cronSyncEnabled: e.target.checked})} style={{ width: "1.2rem", height: "1.2rem", marginTop: "0.2rem", cursor: "pointer", accentColor: "var(--primary)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Sincronização automática ativa</span>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)", opacity: 0.8 }}>Quando desligada, o disparador externo continua batendo mas nada é sincronizado.</span>
          </div>
        </label>

        {settings.cronSyncEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)", marginLeft: "2.2rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem", maxWidth: "22rem" }}>
              <span style={{ fontWeight: 600 }}>Intervalo de execução</span>
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
              <span><strong style={{ color: "var(--foreground)" }}>Última sincronização:</strong> {formatDateTime(status.lastSyncAt)}</span>
              <span><strong style={{ color: "var(--foreground)" }}>Próxima automática:</strong> {nextEligibleLabel}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--muted)" }}>Fontes sincronizadas:</span>
              {status.sources.map(source => (
                <span key={source.label} style={{ padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--card-border)", background: source.configured ? "rgba(34,197,94,0.12)" : "transparent", color: source.configured ? "#16a34a" : "var(--muted)", opacity: source.configured ? 1 : 0.6 }}>
                  {source.label}{source.configured ? "" : " (sem credenciais)"}
                </span>
              ))}
            </div>

            {noSourceConfigured && (
              <div style={noticeStyle("warn")}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <span>Nenhuma fonte tem credenciais cadastradas — não há o que sincronizar. Preencha as chaves em Configurações › API.</span>
              </div>
            )}
          </div>
        )}

        <hr style={{ border: "none", borderTop: "1px solid var(--card-border)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
            Disparador Externo (Cron Job do cPanel)
            {urlUsable ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", fontWeight: 600, color: "#16a34a", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "999px", padding: "0.15rem 0.55rem" }}>
                <ShieldCheck size={12} /> Autenticada
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", fontWeight: 600, color: "#b45309", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "999px", padding: "0.15rem 0.55rem" }}>
                <ShieldAlert size={12} /> Pendente
              </span>
            )}
          </h3>

          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            Cole o valor abaixo no Cron Job do cPanel com a frequência <code>{RECOMMENDED_CRON_EXPRESSION}</code> (a cada 15 min).
            O disparador só acorda a aplicação; é o intervalo acima que decide se há sincronização — então
            mudá-lo passa a valer na hora, sem mexer no servidor.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>{format === "command" ? "Comando para o cPanel" : "URL para o disparador"}</span>
              <div style={{ display: "inline-flex", border: "1px solid var(--card-border)", borderRadius: "8px", overflow: "hidden" }}>
                {([
                  ["command", "Comando (cPanel)"],
                  ["url", "URL simples"],
                ] as [TriggerFormat, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormat(value)}
                    style={{
                      background: format === value ? "var(--primary)" : "transparent",
                      color: format === value ? "#fff" : "var(--muted)",
                      border: "none",
                      padding: "0.45rem 0.9rem",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                readOnly
                type={revealUrl ? "text" : "password"}
                value={triggerValue}
                placeholder="Clique em Gerar para começar"
                onFocus={e => e.currentTarget.select()}
                style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: "0.82rem" }}
              />
              <button type="button" onClick={() => setRevealUrl(v => !v)} title={revealUrl ? "Ocultar" : "Revelar"} style={iconButtonStyle}>
                {revealUrl ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button type="button" onClick={() => handleCopy(triggerValue, "trigger")} disabled={!triggerValue} title="Copiar" style={{ ...iconButtonStyle, opacity: triggerValue ? 1 : 0.4 }}>
                {copied === "trigger" ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
              </button>
              <button type="button" onClick={handleRotateSecret} disabled={rotating} style={{ background: "transparent", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "8px", padding: "0 1rem", fontWeight: 600, cursor: rotating ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}>
                {rotating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {trigger?.hasDbSecret ? "Gerar novo" : "Gerar"}
              </button>
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              {format === "command"
                ? "O Cron Jobs padrão do cPanel executa um comando de shell — é este o formato para o campo \"Command\". O segredo vai no cabeçalho, fora da URL, e o comando descarta a resposta em caso de sucesso para o cPanel não te enviar um e-mail a cada batida."
                : "Use apenas se o seu disparador aceitar somente um link, sem comando. O segredo viaja na própria URL e por isso aparece nos logs de acesso do servidor."}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8 }}>
              O segredo é gravado no mesmo instante em que você gera, então o valor exibido já é aceito pelo servidor — pode colar direto.
            </span>
          </div>

          {!trigger?.hasSecret && (
            <div style={noticeStyle("warn")}>
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <span>Sem segredo, qualquer um que descobrir o endereço consegue disparar a sincronização. Clique em <strong>Gerar</strong>.</span>
            </div>
          )}

          {trigger && !trigger.reachableExternally && (
            <div style={noticeStyle("warn")}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <span>
                Não foi possível determinar o domínio público desta instalação
                {trigger.baseUrl ? <> — só existe o endereço local <code>{trigger.baseUrl}</code>, que o servidor do cPanel não alcança</> : null}.
                Abra esta página <strong>no domínio de produção</strong> para copiar o valor correto, ou defina
                a variável de ambiente <code>CRON_PUBLIC_URL</code>.
              </span>
            </div>
          )}

          {trigger?.hasSecret && !trigger.hasDbSecret && (
            <div style={noticeStyle("info")}>
              <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <span>
                O valor acima usa o <code>CRON_SECRET</code> do ambiente do servidor. Clique em <strong>Gerar</strong> para
                administrar o segredo por aqui — o de ambiente continua aceito, então a troca não derruba o disparador.
              </span>
            </div>
          )}
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

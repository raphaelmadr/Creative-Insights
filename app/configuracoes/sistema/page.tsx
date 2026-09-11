"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Copy, Check, AlertTriangle, RefreshCw, Eye, EyeOff, ShieldCheck, ShieldAlert } from "lucide-react";
import { FieldGrid, SettingsField, SettingsModal, SettingsSaveProvider, SettingsSection } from "@/components/SettingsUI";

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

interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  enables: string;
  where: string;
  fromEnv: boolean;
}

interface MediaStorageState {
  uploadUrl: string;
  uploadSecret: string;
  uploadUrlSource: "db" | "env" | null;
  uploadSecretSource: "db" | "env" | null;
  configured: boolean;
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

  /*
   * Um estado só para tudo o que esta tela salva.
   *
   * As credenciais viviam numa segunda página, "Integrações (API)", com o
   * próprio fetch, o próprio estado e o próprio botão de salvar — enquanto o
   * "Status das Integrações", que só lê esses mesmos campos, ficava aqui. Quem
   * descobria uma credencial faltando num lugar tinha que navegar para outro
   * para preenchê-la, e o sistema carregava duas vezes as mesmas configurações.
   */
  const [settings, setSettings] = useState({
    cronSyncEnabled: true,
    cronSyncInterval: 120,
    cpanelUploadUrl: "",
    cpanelUploadSecret: "",
    metaAdAccountId: "",
    metaAccessToken: "",
    metaRiskApprovedConversionId: "",
    metaPaymentApprovedConversionId: "",
    tiktokAdvertiserId: "",
    tiktokAccessToken: "",
    googleClientId: "",
    googleClientSecret: "",
    slackBotToken: "",
    slackChannelId: "",
  });

  // Informação só de leitura: estado da automação e fontes com credenciais.
  const [status, setStatus] = useState<{
    lastSyncAt?: string | null;
    lastCronSyncAt?: string | null;
    sources: { label: string; configured: boolean }[];
  }>({ sources: [] });

  const [trigger, setTrigger] = useState<CronTriggerState | null>(null);
  const [storage, setStorage] = useState<MediaStorageState | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [revealUploadSecret, setRevealUploadSecret] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // O resumo do status: o número que fica à vista no lugar das sete caixas.
  const configuredIntegrations = integrations.filter(item => item.configured).length;
  const pendingIntegrations = integrations.length - configuredIntegrations;

  const loadAll = React.useCallback(() => {
    return Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/settings/cron-secret").then(r => r.json()),
    ]).then(([settingsRes, cronRes]) => {
      if (settingsRes.success && settingsRes.data) {
        const data = settingsRes.data;
        const media = settingsRes.mediaStorage;
        setStorage(media ?? null);
        setIntegrations(settingsRes.integrations ?? []);
        setSettings({
          cronSyncEnabled: data.cronSyncEnabled ?? true,
          cronSyncInterval: data.cronSyncInterval ?? 120,
          // Valor efetivo, não só o do banco: se estiver na variável de
          // ambiente, o campo mostra o que está de fato em vigor.
          cpanelUploadUrl: media?.uploadUrl ?? data.cpanelUploadUrl ?? "",
          cpanelUploadSecret: media?.uploadSecret ?? data.cpanelUploadSecret ?? "",
          metaAdAccountId: data.metaAdAccountId ?? "",
          metaAccessToken: data.metaAccessToken ?? "",
          metaRiskApprovedConversionId: data.metaRiskApprovedConversionId ?? "",
          metaPaymentApprovedConversionId: data.metaPaymentApprovedConversionId ?? "",
          tiktokAdvertiserId: data.tiktokAdvertiserId ?? "",
          tiktokAccessToken: data.tiktokAccessToken ?? "",
          googleClientId: data.googleClientId ?? "",
          googleClientSecret: data.googleClientSecret ?? "",
          slackBotToken: data.slackBotToken ?? "",
          slackChannelId: data.slackChannelId ?? "",
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
      alert(res.ok ? "Configurações salvas com sucesso!" : "Erro ao salvar as configurações.");
      // Recarrega para o "Status das Integrações" refletir a credencial que
      // acabou de ser salva — antes era preciso trocar de página para isso.
      if (res.ok) await loadAll();
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

  const sourceLabel = (source: "db" | "env" | null | undefined) => {
    if (source === "db") return "Salvo neste painel.";
    if (source === "env") return "Vindo da variável de ambiente do servidor. Salvar grava no banco, que passa a ter precedência.";
    return "Não configurado.";
  };

  const insecureUploadUrl = /^http:\/\//i.test(settings.cpanelUploadUrl.trim());
  const triggerValue = (format === "command" ? trigger?.triggerCommand : trigger?.triggerUrl) ?? "";
  const urlUsable = !!triggerValue && !!trigger?.reachableExternally && !!trigger?.hasSecret;


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
    fontSize: "var(--text-control)",
    lineHeight: 1.5,
    color: tone === "warn" ? "#b45309" : "var(--muted)",
    background: tone === "warn" ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.02)",
    border: `1px solid ${tone === "warn" ? "rgba(245,158,11,0.3)" : "var(--card-border)"}`,
    borderRadius: "8px",
    padding: "0.8rem",
  });

  /*
   * Uma coluna de cartões, e não um painel único com `<hr>` entre tudo.
   * A tela tem oito assuntos independentes; separá-los em cartões deixa cada um
   * com o seu cabeçalho, o seu estado e o seu link — e permite achar o assunto
   * pela varredura, sem ler o que vem antes.
   */
  return (
    <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {/* Os campos vivem em diálogos, que o React renderiza fora do <form>;
          o provedor leva o "gravar" até eles. */}
      <SettingsSaveProvider save={() => handleSaveSettings()} saving={savingSettings}>

        {/*
          O status como resumo de uma linha, e não como sete caixas abertas.
          É informação de consulta — lida de vez em quando —, e ocupava a
          primeira dobra inteira empurrando para baixo os campos que a pessoa
          veio editar. O número fica à vista; o detalhe, a um clique.
        */}
        {integrations.length > 0 && (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "1rem", flexWrap: "wrap",
              padding: "0.85rem 1.1rem", borderRadius: "12px",
              border: "1px solid var(--card-border)",
              background: pendingIntegrations === 0 ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.08)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "0.55rem", fontSize: "var(--text-control)" }}>
              {pendingIntegrations === 0
                ? <ShieldCheck size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                : <ShieldAlert size={16} color="#b45309" style={{ flexShrink: 0 }} />}
              <span>
                <strong>{configuredIntegrations} de {integrations.length}</strong> integrações ativas
                {pendingIntegrations > 0 && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}— {pendingIntegrations} {pendingIntegrations === 1 ? "recurso indisponível" : "recursos indisponíveis"}
                  </span>
                )}
              </span>
            </span>

            <button type="button" onClick={() => setStatusOpen(true)} className="btn btn-secondary" style={{ color: "var(--foreground)" }} >
              Ver status detalhado
            </button>
          </div>
        )}

        {statusOpen && (
          <SettingsModal
            title="Status das integrações"
            description="Uma credencial ausente desabilita apenas o recurso dela — o resto do sistema segue funcionando."
            onClose={() => setStatusOpen(false)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {integrations.map(item => (
                <div key={item.id} style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", padding: "0.7rem 0.9rem", borderRadius: "10px", border: "1px solid var(--card-border)", background: item.configured ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.08)" }}>
                  {item.configured
                    ? <ShieldCheck size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: "0.15rem" }} />
                    : <ShieldAlert size={16} color="#b45309" style={{ flexShrink: 0, marginTop: "0.15rem" }} />}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "var(--text-control)" }}>
                    <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                      {item.label}
                      {item.fromEnv && (
                        <span style={{ marginLeft: "0.5rem", fontSize: "var(--text-eyebrow)", fontWeight: 600, color: "#b45309", background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "999px", padding: "0.1rem 0.45rem" }}>
                          via .env — mover para o painel
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--muted)", lineHeight: 1.5 }}>
                      {item.configured
                        ? `Habilita ${item.enables}.`
                        : `Indisponível: ${item.enables}. Configure em ${item.where}.`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SettingsModal>
        )}

        {/*
          As credenciais de cada canal, com a marca, o estado e o link do passo
          a passo do próprio fornecedor. Quem abre esta tela uma vez por mês não
          lembra onde se gera um token do TikTok — e ir procurar fora do produto
          era parte do trabalho.
        */}
        <SettingsSection
          brand="meta"
          description="Conta de anúncios e token da Marketing API. É a fonte dos criativos, das métricas e das conversões que definem CPA e receita."
          status={!!(settings.metaAdAccountId && settings.metaAccessToken)}
        >
          <FieldGrid>
            <SettingsField
              label="Ad Account ID"
              placeholder="act_1234567890"
              value={settings.metaAdAccountId}
              onChange={v => setSettings({ ...settings, metaAdAccountId: v })}
              hint="O prefixo act_ é opcional: o sistema o adiciona se faltar."
            />
            <SettingsField
              label="Access Token"
              secret
              value={settings.metaAccessToken}
              onChange={v => setSettings({ ...settings, metaAccessToken: v })}
              hint="Token de sistema, de longa duração. Tokens de usuário expiram e derrubam a sincronização."
            />
            <SettingsField
              label={'Conversão "aprovado no risco" (ID)'}
              value={settings.metaRiskApprovedConversionId}
              onChange={v => setSettings({ ...settings, metaRiskApprovedConversionId: v })}
              placeholder="padrão: 2105075753380751"
              hint="Define CPA, Receita Líquida e as categorias de winner. Trocar aqui muda o número em todo o produto — recalibre a meta de CPA em Metas & KPIs."
            />
            <SettingsField
              label={'Conversão "pagamento aprovado" (ID)'}
              value={settings.metaPaymentApprovedConversionId}
              onChange={v => setSettings({ ...settings, metaPaymentApprovedConversionId: v })}
              placeholder="padrão: 27308373288832722"
              hint="Define a Receita Bruta exibida ao lado da líquida. Em branco usa o padrão da conta."
            />
          </FieldGrid>
        </SettingsSection>

        <SettingsSection
          brand="tiktok"
          description="Advertiser ID e token do TikTok Business. Alimenta a mesma base de criativos e métricas do Meta, com o algoritmo de entrega próprio do canal."
          status={!!(settings.tiktokAdvertiserId && settings.tiktokAccessToken)}
        >
          <FieldGrid>
            <SettingsField
              label="Advertiser ID"
              value={settings.tiktokAdvertiserId}
              onChange={v => setSettings({ ...settings, tiktokAdvertiserId: v })}
            />
            <SettingsField
              label="Access Token"
              secret
              value={settings.tiktokAccessToken}
              onChange={v => setSettings({ ...settings, tiktokAccessToken: v })}
            />
          </FieldGrid>
        </SettingsSection>

        <SettingsSection
          brand="slack"
          title="Slack — entregas do time"
          description="Lê o canal de entregas para contar as peças produzidas por cada criador. Sem isso, o dashboard da equipe fica sem o volume entregue."
          status={!!(settings.slackBotToken && settings.slackChannelId)}
        >
          <FieldGrid>
            <SettingsField
              label="Bot User OAuth Token"
              secret
              placeholder="xoxb-..."
              value={settings.slackBotToken}
              onChange={v => setSettings({ ...settings, slackBotToken: v })}
              hint="O app precisa do escopo channels:history e estar convidado no canal."
            />
            <SettingsField
              label="Channel ID"
              placeholder="C0123456789"
              value={settings.slackChannelId}
              onChange={v => setSettings({ ...settings, slackChannelId: v })}
              hint="No Slack: clique no nome do canal › no rodapé do painel aparece o ID."
            />
          </FieldGrid>
        </SettingsSection>

        <SettingsSection
          brand="google"
          title="Google OAuth — login no painel"
          description="Define quem entra no sistema. A URL de callback autorizada deve ser o endereço do painel seguido de /api/auth/callback/google."
          status={!!(settings.googleClientId && settings.googleClientSecret)}
        >
          <FieldGrid>
            <SettingsField
              label="Client ID"
              value={settings.googleClientId}
              onChange={v => setSettings({ ...settings, googleClientId: v })}
            />
            <SettingsField
              label="Client Secret"
              secret
              value={settings.googleClientSecret}
              onChange={v => setSettings({ ...settings, googleClientSecret: v })}
            />
          </FieldGrid>
        </SettingsSection>

        <SettingsSection
          title="Sincronização automática"
          description='Existem duas sincronizações, e as duas fazem a mesma coisa: percorrem todas as fontes configuradas no mês corrente. A manual é o botão "Sincronizar Redes" no topo; a automática é esta, no intervalo abaixo.'
          status={settings.cronSyncEnabled}
          
        >
        <label style={{ display: "flex", alignItems: "flex-start", gap: "1rem", cursor: "pointer" }}>
          <input type="checkbox" checked={settings.cronSyncEnabled} onChange={e => setSettings({...settings, cronSyncEnabled: e.target.checked})} style={{ width: "1.2rem", height: "1.2rem", marginTop: "0.2rem", cursor: "pointer", accentColor: "var(--primary)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span className="field-label">Sincronização automática ativa</span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8 }}>Quando desligada, o disparador externo continua batendo mas nada é sincronizado.</span>
          </div>
        </label>

        {settings.cronSyncEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "12px", border: "1px solid var(--card-border)", marginLeft: "2.2rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)", maxWidth: "22rem" }}>
              <span style={{ fontWeight: 600 }}>Intervalo de execução</span>
              <select value={settings.cronSyncInterval} onChange={e => setSettings({...settings, cronSyncInterval: Number(e.target.value)})} className="field-input">
                <option value={15}>A cada 15 minutos</option>
                <option value={30}>A cada 30 minutos</option>
                <option value={60}>A cada 1 hora</option>
                <option value={120}>A cada 2 horas</option>
                <option value={360}>A cada 6 horas</option>
                <option value={720}>A cada 12 horas</option>
                <option value={1440}>Uma vez por dia (24h)</option>
              </select>
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontSize: "var(--text-control)", color: "var(--muted)" }}>
              <span><strong style={{ color: "var(--foreground)" }}>Última sincronização:</strong> {formatDateTime(status.lastSyncAt)}</span>
              <span><strong style={{ color: "var(--foreground)" }}>Próxima automática:</strong> {nextEligibleLabel}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", fontSize: "var(--text-control)" }}>
              <span style={{ color: "var(--muted)" }}>Fontes sincronizadas:</span>
              {status.sources.map(source => (
                <span key={source.label} style={{ padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "var(--text-caption)", fontWeight: 600, border: "1px solid var(--card-border)", background: source.configured ? "rgba(34,197,94,0.12)" : "transparent", color: source.configured ? "#16a34a" : "var(--muted)", opacity: source.configured ? 1 : 0.6 }}>
                  {source.label}{source.configured ? "" : " (sem credenciais)"}
                </span>
              ))}
            </div>

            {noSourceConfigured && (
              <div style={noticeStyle("warn")}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <span>Nenhuma fonte tem credenciais cadastradas — não há o que sincronizar. Preencha as chaves nos cartões acima.</span>
              </div>
            )}
          </div>
        )}
        </SettingsSection>

        <SettingsSection
          brand="cpanel"
          title="Disparador externo (Cron Job do cPanel)"
          description="O cPanel bate nesta URL; a cadência de verdade é a definida acima. Configure o cron para cada 15 minutos e deixe o painel decidir."
          status={urlUsable}
        >

          <p style={{ fontSize: "var(--text-control)", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            Cole o valor abaixo no Cron Job do cPanel com a frequência <code>{RECOMMENDED_CRON_EXPRESSION}</code> (a cada 15 min).
            O disparador só acorda a aplicação; é o intervalo acima que decide se há sincronização — então
            mudá-lo passa a valer na hora, sem mexer no servidor.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>{format === "command" ? "Comando para o cPanel" : "URL para o disparador"}</span>
              <div style={{ display: "inline-flex", border: "1px solid var(--card-border)", borderRadius: "8px", overflow: "hidden" }}>
                {([
                  ["command", "Comando (cPanel)"],
                  ["url", "URL simples"],
                ] as [TriggerFormat, string][]).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setFormat(value)} aria-pressed={format === value} className="btn btn-toggle" >
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
                className="field-input" style={{ flex: 1, fontFamily: "var(--font-mono, monospace)" }}
              />
              <button type="button" onClick={() => setRevealUrl(v => !v)} title={revealUrl ? "Ocultar" : "Revelar"} className="btn btn-icon" style={{ borderColor: "var(--card-border)" }}>
                {revealUrl ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button type="button" onClick={() => handleCopy(triggerValue, "trigger")} disabled={!triggerValue} title="Copiar" style={{ ...iconButtonStyle, opacity: triggerValue ? 1 : 0.4 }}>
                {copied === "trigger" ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
              </button>
              <button type="button" onClick={handleRotateSecret} disabled={rotating} className="btn btn-primary">
                {rotating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {trigger?.hasDbSecret ? "Gerar novo" : "Gerar"}
              </button>
            </div>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              {format === "command"
                ? "O Cron Jobs padrão do cPanel executa um comando de shell — é este o formato para o campo \"Command\". O segredo vai no cabeçalho, fora da URL, e o comando descarta a resposta em caso de sucesso para o cPanel não te enviar um e-mail a cada batida."
                : "Use apenas se o seu disparador aceitar somente um link, sem comando. O segredo viaja na própria URL e por isso aparece nos logs de acesso do servidor."}
            </span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8 }}>
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
        </SettingsSection>

        <SettingsSection
          brand="cpanel"
          title="Hospedagem de imagens (cPanel)"
          description="Meta e TikTok entregam URLs de vida curta; as artes são copiadas para cá para não expirarem. Os campos mostram o que está em vigor — o painel tem precedência sobre a variável de ambiente."
          status={!!storage?.configured}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: "1.1rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
              <span style={{ fontWeight: 600 }}>URL de Upload (Webhook)</span>
              <input type="url" value={settings.cpanelUploadUrl} onChange={e => setSettings({...settings, cpanelUploadUrl: e.target.value})} placeholder="https://..." className="field-input" style={{ fontFamily: "var(--font-mono, monospace)" }} />
              <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", opacity: 0.8 }}>{sourceLabel(storage?.uploadUrlSource)}</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
              <span style={{ fontWeight: 600 }}>Senha (Secret Token)</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input type={revealUploadSecret ? "text" : "password"} value={settings.cpanelUploadSecret} onChange={e => setSettings({...settings, cpanelUploadSecret: e.target.value})} className="field-input" style={{ flex: 1, fontFamily: "var(--font-mono, monospace)" }} />
                <button type="button" onClick={() => setRevealUploadSecret(v => !v)} title={revealUploadSecret ? "Ocultar" : "Revelar"} className="btn btn-icon" style={{ borderColor: "var(--card-border)" }}>
                  {revealUploadSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", opacity: 0.8 }}>{sourceLabel(storage?.uploadSecretSource)}</span>
            </label>
          </div>

          {insecureUploadUrl && (
            <div style={noticeStyle("warn")}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <span>
                A URL está em <code>http://</code>, sem TLS. A senha acima é enviada nessa requisição, em texto
                claro na rede. Troque para <code>https://</code>.
              </span>
            </div>
          )}
        </SettingsSection>

        {/*
          Barra de salvar fixa no rodapé.
          A tela ficou longa, e o único botão vivia no cabeçalho da segunda
          seção: quem editava o token do TikTok no meio da página tinha que
          rolar de volta ao topo para gravar, ou não achava o botão.
        */}
        <div
          style={{
            position: "sticky", bottom: "1rem", zIndex: 5,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "1rem", flexWrap: "wrap",
            padding: "0.85rem 1.1rem", borderRadius: "12px",
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
          }}
        >
          <span style={{ fontSize: "var(--text-control)", color: "var(--muted)" }}>
            As alterações de todos os cartões acima são gravadas juntas.
          </span>
          <button type="submit" disabled={savingSettings} className="btn btn-primary" >
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {savingSettings ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </SettingsSaveProvider>
    </form>
  );
}

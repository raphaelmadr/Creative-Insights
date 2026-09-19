"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Copy, Check, AlertTriangle, RefreshCw, Eye, EyeOff, ShieldCheck, ShieldAlert } from "lucide-react";
import { FieldGrid, SettingsField, SettingsModal, SettingsSaveProvider, SettingsSection } from "@/components/SettingsUI";
import { SyncStatusView } from "@/components/SyncStatusView";
import { useNotifications } from "@/components/NotificationProvider";

/** Cadência do disparador externo: bate sempre, o painel filtra. */
const RECOMMENDED_CRON_EXPRESSION = "*/15 * * * *";

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
  /*
   * Distingue "carreguei e está vazio" de "falhei ao carregar". Sem isso, uma
   * falha na leitura de `/api/settings` deixava `settings` no valor inicial —
   * todo string vazia — e a tela abria normalmente, pronta para gravar esse
   * vazio por cima de toda credencial já salva no primeiro clique em "Salvar
   * alterações" (que grava todos os cartões juntos, veja o rodapé do form).
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
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

  /*
   * O estado da automação NÃO é montado aqui.
   *
   * Esta tela tinha a própria conta de "próxima automática", que discordava da
   * do cabeçalho e das duas do endpoint do cron. Agora vem pronto do servidor,
   * pelo mesmo provedor que alimenta o cabeçalho — e com ele vem a atualização
   * periódica, que era o que faltava para o rótulo deixar de ser uma fotografia
   * do instante em que a página abriu.
   */
  const { syncStatus, refreshSyncStatus, isSyncingAll } = useNotifications();

  // O que continua sendo desta tela: quais fontes têm credencial.
  const [status, setStatus] = useState<{
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
      /*
       * Falha aqui não pode terminar em `setSettings` nunca chamado: o estado
       * inicial já é todo string vazia, e deixá-lo como está equivale a
       * carregar "tudo vazio" sem avisar — pronto para ser salvo por cima do
       * banco. Melhor estourar e deixar o chamador decidir o que fazer.
       */
      if (!settingsRes.success || !settingsRes.data) {
        throw new Error(settingsRes.error || "Resposta inválida de /api/settings");
      }

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
        /*
         * Espelha o registro de fontes do backend (`lib/channels.ts`), que
         * são as redes e só elas. "Entregas" saiu desta lista: as entregas
         * deixaram de ser lidas de mensagens do Slack quando passaram a ser
         * medidas no Kanban, mas continuavam listadas aqui como se a
         * sincronização ainda fosse atrás delas.
         */
        sources: [
          { label: "Meta", configured: !!(data.metaAdAccountId && data.metaAccessToken) },
          { label: "TikTok", configured: !!(data.tiktokAdvertiserId && data.tiktokAccessToken) },
        ],
      });

      if (cronRes.success) setTrigger(cronRes);
    });
  }, []);

  const runLoad = React.useCallback(() => {
    setFetching(true);
    setLoadError(null);
    loadAll()
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Erro desconhecido.");
      })
      .finally(() => setFetching(false));
  }, [loadAll]);

  useEffect(() => {
    runLoad();
  }, [runLoad]);

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
      // `loadAll` agora pode rejeitar (ver comentário acima); a gravação já
      // aconteceu, então uma falha só nesta releitura não deve virar "erro ao
      // salvar" nem travar a tela — apenas os badges de integração ficam
      // desatualizados até a próxima visita.
      if (res.ok) {
        await Promise.all([
          loadAll().catch((err) => {
            console.error("Falha ao recarregar configurações após salvar:", err);
          }),
          refreshSyncStatus(),
        ]);
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
        // O comando já nasce visível e montado com a chave nova — não há mais
        // nada a revelar nem a compor.
        setTrigger(data);
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

  /*
   * Bloqueado, não em branco.
   *
   * Sem esta tela, uma falha de leitura (rede, banco momentaneamente
   * indisponível) devolvia o formulário normal com `settings` no valor
   * inicial — tudo string vazia —, indistinguível de "carregado e vazio". O
   * único botão de salvar grava todos os cartões juntos; o próximo clique,
   * por qualquer motivo, gravaria esse vazio por cima de toda credencial que
   * já estava no banco. É o caminho mais provável para credenciais do Google,
   * Meta, TikTok etc. que "desaparecem sozinhas".
   */
  if (loadError) {
    return (
      <div
        className="glass-panel"
        style={{ padding: "3rem", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "flex-start", maxWidth: "34rem" }}
      >
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", color: "#b45309" }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "0.15rem" }} />
          <span style={{ fontSize: "var(--text-control)", lineHeight: 1.6 }}>
            Não foi possível carregar as configurações atuais ({loadError}). Salvar agora
            gravaria os campos desta tela como vazios por cima das credenciais que já estão no
            banco — por isso o formulário fica bloqueado até a leitura funcionar.
          </span>
        </div>
        <button type="button" onClick={runLoad} className="btn btn-primary">
          Tentar novamente
        </button>
      </div>
    );
  }

  const noSourceConfigured = status.sources.every(s => !s.configured);

  const sourceLabel = (source: "db" | "env" | null | undefined) => {
    if (source === "db") return "Salvo neste painel.";
    if (source === "env") return "Vindo da variável de ambiente do servidor. Salvar grava no banco, que passa a ter precedência.";
    return "Não configurado.";
  };

  const insecureUploadUrl = /^http:\/\//i.test(settings.cpanelUploadUrl.trim());
  const triggerValue = (format === "command" ? trigger?.triggerCommand : trigger?.triggerUrl) ?? "";
  const urlUsable = !!triggerValue && !!trigger?.reachableExternally && !!trigger?.hasSecret;


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
          title="Slack — sem uso hoje"
          description="As entregas já não são lidas de mensagens do Slack: passaram a ser contadas no Kanban, quando o card chega à coluna de conclusão. Nenhuma rotina lê estas credenciais — elas ficam guardadas para um uso futuro."
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

            {/* O mesmo componente que o cabeçalho desenha, na versão completa.
                Um cálculo, um vocabulário: se esta tela e a barra do topo
                discordarem de novo, é porque alguém abriu uma segunda conta. */}
            <SyncStatusView status={syncStatus} variant="full" running={isSyncingAll} />

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
          description="Um único Cron Job. O cPanel bate nesta URL; a cadência de verdade é a definida acima. Configure o cron para cada 15 minutos e deixe o painel decidir."
          status={urlUsable}
        >

          <p style={{ fontSize: "var(--text-control)", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            Cole o valor abaixo no Cron Job do cPanel com a frequência <code>{RECOMMENDED_CRON_EXPRESSION}</code> (a cada 15 min).
            O disparador só acorda a aplicação; é o intervalo acima que decide se há sincronização — então
            mudá-lo passa a valer na hora, sem mexer no servidor.
          </p>

          <p style={{ fontSize: "var(--text-control)", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            É <strong style={{ color: "var(--foreground)" }}>um cadastro só</strong>. Cada batida executa uma das duas passadas,
            alternando: primeiro as <strong style={{ color: "var(--foreground)" }}>métricas e status</strong>, na batida seguinte
            as <strong style={{ color: "var(--foreground)" }}>artes e capas</strong>. As duas não cabem na mesma execução — uma
            requisição expira em 300s e só a leitura da Meta consome 180s —, e era por isso que as artes,
            que rodavam por último, nunca chegavam a ser salvas.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600 }}>
              {format === "command"
                ? "Cole no campo \"Command\" do Cron Jobs"
                : "Cole no seu disparador"}
            </span>

            {/*
              O comando aparece inteiro e legível, e não mascarado.
              Escondê-lo atrás de um campo de senha era o que fazia parecer que
              faltava montar alguma coisa — e o segredo já é visível só para
              administradores, que são os únicos que abrem esta tela.
              Textarea, e não input: um curl completo não cabe numa linha.
            */}
            <textarea
              readOnly
              rows={3}
              value={triggerValue}
              placeholder="Clique em Gerar para produzir o comando completo"
              onFocus={e => e.currentTarget.select()}
              className="field-input"
              style={{
                width: "100%",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "var(--text-control)",
                lineHeight: 1.5,
                resize: "vertical",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            />

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleCopy(triggerValue, "trigger")}
                disabled={!triggerValue}
                className="btn btn-primary"
                style={{ opacity: triggerValue ? 1 : 0.5 }}
              >
                {copied === "trigger" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "trigger" ? "Copiado!" : "Copiar comando"}
              </button>
              <button type="button" onClick={handleRotateSecret} disabled={rotating} className="btn" style={{ borderColor: "var(--card-border)" }}>
                {rotating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {trigger?.hasDbSecret ? "Gerar nova chave" : "Gerar"}
              </button>
              <button
                type="button"
                onClick={() => setFormat(f => (f === "command" ? "url" : "command"))}
                className="btn"
                style={{ borderColor: "var(--card-border)", marginLeft: "auto" }}
              >
                {format === "command" ? "Preciso de uma URL" : "Voltar ao comando"}
              </button>
            </div>

            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              {format === "command"
                ? "Já vem pronto, com a chave dentro: copie e cole, não há nada a montar. A chave viaja no cabeçalho, fora da URL, e o comando descarta a resposta em caso de sucesso para o cPanel não te enviar um e-mail a cada batida."
                : "Use só se o seu disparador aceitar apenas um link, sem comando. Aqui a chave viaja na própria URL e por isso aparece nos logs de acesso do servidor — o comando é mais seguro."}
            </span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8 }}>
              Gerar uma nova chave já monta o comando com ela e grava no mesmo instante — o valor acima é sempre o que o servidor aceita agora. Se você já tinha um cron cadastrado, troque-o pelo novo comando.
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
                {trigger.baseUrl ? <> — só existe o endereço local <code>{trigger.baseUrl}</code>, que o Cron Jobs do cPanel não alcança</> : null}.
                Abra esta página <strong>no domínio de produção</strong> para copiar o valor correto: o
                endereço por onde ela for aberta já serve de resposta. Se preferir fixá-lo, defina
                <code>NEXTAUTH_URL</code> nas variáveis do app no cPanel.
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

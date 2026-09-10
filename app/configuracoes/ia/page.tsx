"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Sparkles } from "lucide-react";
import { BrandIcon, brandOf, type BrandId } from "@/components/BrandIcon";
import { DocsLink, SettingsSection, StatusPill } from "@/components/SettingsUI";

type ProviderKey =
  | "geminiApiKey"
  | "groqApiKey"
  | "openRouterApiKey"
  | "openaiApiKey"
  | "anthropicApiKey"
  | "cohereApiKey"
  | "huggingFaceApiKey"
  | "tavilyApiKey";

/**
 * A cadeia de provedores, na ordem em que `lib/ai.ts` os tenta.
 *
 * A ordem aqui e a de lá precisam bater: esta tela é onde alguém entende por
 * que uma análise veio do Groq e não do Gemini.
 */
const PROVIDERS: { key: ProviderKey; brand: BrandId; role: string; order: boolean }[] = [
  { key: "geminiApiKey", brand: "gemini", role: "Primeiro da fila; lê imagens", order: true },
  { key: "groqApiKey", brand: "groq", role: "Rápido e barato", order: true },
  { key: "openRouterApiKey", brand: "openrouter", role: "Roteia para vários modelos", order: true },
  { key: "openaiApiKey", brand: "openai", role: "Lê imagens", order: true },
  { key: "anthropicApiKey", brand: "anthropic", role: "Lê imagens", order: true },
  { key: "cohereApiKey", brand: "cohere", role: "Só texto", order: true },
  { key: "huggingFaceApiKey", brand: "huggingface", role: "Último recurso; só texto", order: true },
  { key: "tavilyApiKey", brand: "tavily", role: "Pesquisa web dos insights de mercado", order: false },
];

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
    /*
     * As chaves dos provedores vivem aqui, ao lado dos prompts que elas
     * executam. Antes moravam na página "Integrações (API)" — e três da cadeia
     * de fallback (OpenRouter, Cohere, HuggingFace) mais a Tavily não tinham
     * campo em lugar nenhum, apesar de o código as ler.
     */
    geminiApiKey: "",
    groqApiKey: "",
    openRouterApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    cohereApiKey: "",
    huggingFaceApiKey: "",
    tavilyApiKey: "",
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
            geminiApiKey: settingsRes.data.geminiApiKey ?? "",
            groqApiKey: settingsRes.data.groqApiKey ?? "",
            openRouterApiKey: settingsRes.data.openRouterApiKey ?? "",
            openaiApiKey: settingsRes.data.openaiApiKey ?? "",
            anthropicApiKey: settingsRes.data.anthropicApiKey ?? "",
            cohereApiKey: settingsRes.data.cohereApiKey ?? "",
            huggingFaceApiKey: settingsRes.data.huggingFaceApiKey ?? "",
            tavilyApiKey: settingsRes.data.tavilyApiKey ?? "",
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
    <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>

        <SettingsSection
          title="Prompts das análises"
          description="O que cada função pede ao modelo. O idioma, o formato e a proibição de saudação são garantidos em código para toda resposta, em qualquer provedor — estes textos definem o conteúdo, não a forma."
        >
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
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              Contexto adicional, não o critério. A análise sempre segue o mesmo roteiro — peças que concentraram a verba, leitura das artes, hipóteses sobre o algoritmo do canal e o que produzir — para que duas análises sejam comparáveis entre si. O texto daqui entra somado a esse roteiro.
            </span>
            <textarea value={settings.andromedaPrompt} onChange={e => setSettings({...settings, andromedaPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
          </label>
        </div>
        </SettingsSection>

        {/*
          As chaves, na ORDEM DA CADEIA DE FALLBACK — a sequência que
          `generateWithFallback` tenta. Ver a ordem na tela é o que explica por
          que uma análise saiu de um provedor e não de outro. Cada linha traz a
          marca, o estado e o link direto de onde se gera a chave: quem revisa
          isso todo mês não deveria precisar procurar fora do produto.
        */}
        <SettingsSection
          title="Provedores de IA"
          description="São tentados nesta ordem: o primeiro que responder produz a análise, e uma chave em branco é simplesmente pulada. Toda falha — chave inválida, cota esgotada, limite de taxa — fica registrada em Configurações › Logs, com o motivo e a correção."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {PROVIDERS.map((provider, index) => {
              const info = brandOf(provider.brand);
              const filled = !!settings[provider.key];

              return (
                <div
                  key={provider.key}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap",
                    padding: "0.75rem 0.9rem", borderRadius: "12px",
                    border: "1px solid var(--card-border)",
                    background: filled ? "rgba(34,197,94,0.04)" : "var(--background-main)",
                  }}
                >
                  {/* A posição na cadeia, para a ordem ficar explícita. */}
                  <span style={{ width: "1.4rem", flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textAlign: "right" }}>
                    {provider.order ? `${index + 1}º` : "—"}
                  </span>

                  <BrandIcon id={provider.brand} size={30} />

                  <div style={{ flex: "1 1 9rem", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.86rem" }}>{info.label}</span>
                    <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>{provider.role}</span>
                  </div>

                  <input
                    type="password"
                    value={settings[provider.key]}
                    onChange={e => setSettings({ ...settings, [provider.key]: e.target.value })}
                    placeholder={filled ? "" : "sem chave — este provedor é pulado"}
                    style={{
                      flex: "2 1 14rem", minWidth: 0,
                      padding: "0.6rem 0.7rem", borderRadius: "10px",
                      border: "1px solid var(--card-border)", background: "var(--card-bg)",
                      color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.82rem",
                    }}
                  />

                  <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexShrink: 0 }}>
                    <StatusPill ok={filled} okLabel="Com chave" pendingLabel="Sem chave" />
                    {info.docsUrl && <DocsLink href={info.docsUrl} label="Obter chave" />}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          brand="tavily"
          title="Pesquisa web automática"
          description="Alimenta a página de Insights de Mercado: a Tavily busca o conteúdo e a IA o curadoria segundo o prompt abaixo."
          status={!!settings.tavilyApiKey}
        >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 600 }}>Termos de Pesquisa Base (Query)</span>
            <textarea value={settings.tavilySearchQuery} onChange={e => setSettings({...settings, tavilySearchQuery: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "80px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 600 }}>Curador de Insights de Mercado (Prompt)</span>
            <textarea value={settings.marketInsightsPrompt} onChange={e => setSettings({...settings, marketInsightsPrompt: e.target.value})} style={{ padding: "1rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", minHeight: "120px", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical" }} />
          </label>
        </div>
        </SettingsSection>

        {/* Mesma barra fixa da tela de Sistema: a página é longa. */}
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
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Prompts e chaves são gravados juntos.
          </span>
          <button
            type="submit"
            disabled={savingSettings}
            style={{
              background: "var(--primary)", color: "#fff", border: "none",
              padding: "0.6rem 1.4rem", borderRadius: "10px", fontWeight: 600, fontSize: "0.86rem",
              cursor: savingSettings ? "default" : "pointer", opacity: savingSettings ? 0.6 : 1,
              display: "inline-flex", alignItems: "center", gap: "0.5rem", whiteSpace: "nowrap",
            }}
          >
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {savingSettings ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
    </form>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { BrandIcon, brandOf, type BrandId } from "@/components/BrandIcon";
import { DocsLink, SettingsSection, StatusPill, SettingsSaveProvider } from "@/components/SettingsUI";
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ORDER,
  aiProviderById,
  resolveAiProviderOrder,
  type AiProviderId,
} from "@/lib/ai-providers";

/**
 * Os provedores e a sua ordem vêm de `lib/ai-providers.ts` — o mesmo módulo que
 * `lib/ai.ts` lê para montar a cadeia. Esta tela mantinha uma cópia manual da
 * lista, com um comentário pedindo que as duas fossem mantidas iguais; a partir
 * do momento em que a ordem virou configurável, a cópia deixaria de poder
 * acompanhar, porque a ordem passou a morar no banco.
 */
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

  /**
   * `scope` escolhe o lote: "winners" são as peças da categoria **Winners** —
   * as mesmas que o gerador de copy lê como referência —, "active" é a
   * varredura ampla.
   *
   * A distinção importa: sem transcrição, o gerador recebe o NOME do anúncio no
   * lugar do texto que converteu, e escreve genérico. O lote amplo pega até 200
   * criativos em ordem qualquer e podia nunca alcançar os vencedores.
   */
  const handleTranscribeBatch = async (scope: "active" | "winners" = "active") => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const res = await fetch("/api/creatives/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      alert(data.message || data.error || "Transcrição concluída.");
    } catch (e) {
      alert("Erro ao transcrever os criativos.");
    }
    setTranscribing(false);
  };

  /**
   * A ordem da cadeia de fallback, do primeiro ao último a ser tentado.
   *
   * Sai separada do resto da configuração porque é uma LISTA, não um campo: a
   * tela a manipula reordenando linhas, e só na hora de gravar ela vira o JSON
   * que a coluna `aiProviderOrder` guarda.
   */
  const [providerOrder, setProviderOrder] = useState<AiProviderId[]>(DEFAULT_AI_PROVIDER_ORDER);

  /** Sobe ou desce um provedor na fila. Nas pontas, o botão fica desabilitado. */
  const moveProvider = (index: number, direction: -1 | 1) => {
    const destino = index + direction;
    if (destino < 0 || destino >= providerOrder.length) return;
    const nova = [...providerOrder];
    [nova[index], nova[destino]] = [nova[destino], nova[index]];
    setProviderOrder(nova);
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
          // `resolveAiProviderOrder` é a MESMA função que o servidor usa para
          // montar a cadeia: a tela mostra a fila que vai rodar de verdade,
          // inclusive um provedor novo que a ordem salva ainda não menciona.
          setProviderOrder(resolveAiProviderOrder(settingsRes.data.aiProviderOrder));
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
        body: JSON.stringify({ ...settings, aiProviderOrder: providerOrder })
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
      <SettingsSaveProvider save={() => handleSaveSettings()} saving={savingSettings}>

        <SettingsSection
          title="Prompts das análises"
          description="O que cada função pede ao modelo. O idioma, o formato e a proibição de saudação são garantidos em código para toda resposta, em qualquer provedor — estes textos definem o conteúdo, não a forma."
        >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600 }}>Transcrição Visual do Criativo</span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              Primeira etapa de toda análise: a IA recebe a imagem e devolve o que está nela — headline, subheadline, CTA, textos, cores e elementos.
              Deve retornar JSON. É o que substitui a antiga leitura pelo nome do arquivo, e o resultado fica em cache por criativo.
            </span>
            <textarea value={settings.visionPrompt} onChange={e => setSettings({...settings, visionPrompt: e.target.value})} placeholder="Em branco usa o prompt padrão de transcrição." className="field-input field-textarea" style={{ minHeight: "120px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="button" onClick={() => handleTranscribeBatch("winners")} disabled={transcribing} className="btn btn-primary" >
                {transcribing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                {transcribing ? "Transcrevendo..." : "Transcrever peças vencedoras"}
              </button>
              <button type="button" onClick={() => handleTranscribeBatch("active")} disabled={transcribing} className="btn btn-secondary" >
                {transcribing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                Transcrever peças ativas
              </button>
              <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
                <strong>Vencedoras</strong> transcreve as peças classificadas como <strong>Winners</strong> que ainda
                estão entregando — são exatamente as que o <strong>gerador de copy</strong> usa como referência. Sem
                elas transcritas, o modelo recebe o nome do anúncio no lugar do texto que converteu, e a copy sai
                genérica. Vale rodar de novo quando o quadro de Winners mudar, e sempre que as regras de categoria
                forem alteradas em <strong>Metas</strong> — mudar o limite muda quem é referência.
                <br />
                <strong>Ativas</strong> é a varredura ampla, para deixar as análises individuais prontas de antemão.
              </span>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600 }}>Analisar Criativo Individual (Botão)</span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              Recebe a transcrição acima somada aos números do período. A transcrição é anexada automaticamente, não precisa de variável no prompt.
            </span>
            <textarea value={settings.hypothesisPrompt} onChange={e => setSettings({...settings, hypothesisPrompt: e.target.value})} className="field-input field-textarea" style={{ minHeight: "120px" }} />
          </label>
          
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600 }}>Análise de Similaridade (Projeto Andromeda)</span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              <strong>Sem uso no momento:</strong> a análise de similaridade foi removida e está sendo refeita.
              O texto continua guardado aqui — junto do material do time sobre o Andromeda, que vive no
              código — para alimentar a nova versão quando ela existir. Nada do que for escrito agora
              produz efeito em tela.
            </span>
            <textarea value={settings.andromedaPrompt} onChange={e => setSettings({...settings, andromedaPrompt: e.target.value})} className="field-input field-textarea" style={{ minHeight: "120px" }} />
          </label>
        </div>
        </SettingsSection>

        {/*
          As chaves NA ORDEM DA CADEIA — e agora a ordem é editável aqui, não no
          código. Era uma sequência fixa em `lib/ai.ts` com o Gemini sempre à
          frente: trocar a preferência exigia publicar código, e a numeração que
          esta tela mostrava era decoração. Cada linha traz a marca, o estado e o
          link direto de onde se gera a chave: quem revisa isso todo mês não
          deveria precisar procurar fora do produto.
        */}
        <SettingsSection
          title="Provedores de IA"
          description="A cadeia de fallback, na ordem em que é tentada: o primeiro que responder produz a análise, e quem falha passa a vez ao seguinte automaticamente. Provedor sem chave nem entra na fila, e as análises que dependem de ver a peça pulam os que só processam texto — mesmo que estejam à frente. Use as setas para definir a preferência. Toda falha — chave inválida, cota esgotada, limite de taxa — fica registrada em Configurações › Logs, com o motivo e a correção."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {providerOrder.map((id, index) => {
              const provider = aiProviderById(id);
              if (!provider) return null;
              const info = brandOf(id as BrandId);
              const filled = !!settings[provider.keyField];

              return (
                <div
                  key={id}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap",
                    padding: "0.75rem 0.9rem", borderRadius: "12px",
                    border: "1px solid var(--card-border)",
                    background: filled ? "rgba(34,197,94,0.04)" : "var(--background-main)",
                  }}
                >
                  {/*
                    A posição e as setas que a mudam, juntas: o número sozinho
                    não dizia que era possível trocá-lo. A cor forte só vai para
                    quem tem chave — um "1º" destacado num provedor sem chave
                    anunciaria uma preferência que a cadeia vai pular.
                  */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.15rem", flexShrink: 0 }}>
                    <span style={{ width: "1.6rem", fontSize: "var(--text-caption)", fontWeight: 700, color: filled ? "var(--foreground)" : "var(--muted)", textAlign: "right" }}>
                      {index + 1}º
                    </span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <button
                        type="button"
                        onClick={() => moveProvider(index, -1)}
                        disabled={index === 0}
                        aria-label={`Subir ${info.label} na ordem de preferência`}
                        className="btn btn-icon"
                        style={{ width: "1.5rem", height: "1.1rem", padding: 0 }}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProvider(index, 1)}
                        disabled={index === providerOrder.length - 1}
                        aria-label={`Descer ${info.label} na ordem de preferência`}
                        className="btn btn-icon"
                        style={{ width: "1.5rem", height: "1.1rem", padding: 0 }}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>

                  <BrandIcon id={id as BrandId} size={30} />

                  <div style={{ flex: "1 1 9rem", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <span className="field-label">{info.label}</span>
                    <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)" }}>{provider.note}</span>
                  </div>

                  <input
                    type="password"
                    value={settings[provider.keyField]}
                    onChange={e => setSettings({ ...settings, [provider.keyField]: e.target.value })}
                    placeholder={filled ? "" : "sem chave — este provedor é pulado"}
                    style={{
                      flex: "2 1 14rem", minWidth: 0,
                      padding: "0.6rem 0.7rem", borderRadius: "10px",
                      border: "1px solid var(--card-border)", background: "var(--card-bg)",
                      color: "var(--foreground)", fontFamily: "monospace", fontSize: "var(--text-control)",
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

          {/*
            Quem realmente vai atender, dito em uma linha. A lista acima mostra a
            preferência; esta frase mostra a CADEIA EFETIVA, que é a preferência
            menos os provedores sem chave — a diferença entre as duas é a causa
            mais comum de "configurei e continua vindo do mesmo lugar".
          */}
          <p style={{ marginTop: "0.9rem", fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.5 }}>
            {(() => {
              const fila = providerOrder
                .map((id) => aiProviderById(id))
                .filter((p) => p && settings[p.keyField])
                .map((p) => brandOf(p!.id as BrandId).label);
              if (fila.length === 0) return "Nenhuma chave preenchida: as análises ficam indisponíveis até que ao menos um provedor tenha chave.";
              return `Cadeia em vigor: ${fila.join(" → ")}. A ordem vale ao salvar.`;
            })()}
          </p>
        </SettingsSection>

        <SettingsSection
          brand="tavily"
          title="Pesquisa web automática"
          description="Alimenta a página de Insights de Mercado: a Tavily busca o conteúdo e a IA o curadoria segundo o prompt abaixo."
          status={!!settings.tavilyApiKey}
        >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/*
            A chave da Tavily ficava na lista de provedores de IA, como uma linha
            marcada "—" para indicar que não participava da ordem. Com a ordem
            agora editável, uma linha imóvel no meio de linhas móveis passou a
            ser ruído: a busca web não é um provedor de fallback, é a fonte que
            ALIMENTA a cadeia. Mora aqui, junto do que ela alimenta.
          */}
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Chave da API
              <StatusPill ok={!!settings.tavilyApiKey} okLabel="Com chave" pendingLabel="Sem chave" />
              {brandOf("tavily").docsUrl && <DocsLink href={brandOf("tavily").docsUrl!} label="Obter chave" />}
            </span>
            <span style={{ fontSize: "var(--text-control)", color: "var(--muted)", opacity: 0.8, lineHeight: 1.5 }}>
              Sem ela o botão <strong>Buscar novos insights</strong> não tem o que pesquisar: a página passa a
              mostrar apenas o que já está salvo.
            </span>
            <input
              type="password"
              value={settings.tavilyApiKey}
              onChange={e => setSettings({ ...settings, tavilyApiKey: e.target.value })}
              placeholder="sem chave — a busca de insights fica desligada"
              className="field-input"
              style={{ fontFamily: "monospace" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600 }}>Termos de Pesquisa Base (Query)</span>
            <textarea value={settings.tavilySearchQuery} onChange={e => setSettings({...settings, tavilySearchQuery: e.target.value})} className="field-input field-textarea" style={{ minHeight: "80px" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-cardtitle)" }}>
            <span style={{ fontWeight: 600 }}>Curador de Insights de Mercado (Prompt)</span>
            <textarea value={settings.marketInsightsPrompt} onChange={e => setSettings({...settings, marketInsightsPrompt: e.target.value})} className="field-input field-textarea" style={{ minHeight: "120px" }} />
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
          <span style={{ fontSize: "var(--text-control)", color: "var(--muted)" }}>
            Prompts e chaves são gravados juntos.
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

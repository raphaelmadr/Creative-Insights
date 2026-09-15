"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Wand2, Send, Copy as CopyIcon, Check, ArrowRight, Sparkles, RefreshCw, ExternalLink, CalendarDays } from "lucide-react";
import Link from "next/link";
import SearchSelect, { type SearchSelectOption } from "@/components/creator/SearchSelect";
import VariationCard from "@/components/creator/VariationCard";
import {
  parseCopyVariations,
  serializeCopyVariations,
  type CopyVariation,
} from "@/lib/copy-parse";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/kanban";
import {
  COPY_FORMATS,
  COPY_TONES,
  MAX_VARIATIONS,
  MIN_VARIATIONS,
  DEFAULT_VARIATIONS,
} from "@/lib/copy-options";

interface Target {
  boardId: string;
  boardName: string;
  columnName: string | null;
}

interface AlluProduct {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  price12: number | null;
  price24: number | null;
  price36: number | null;
  availabilityLabel: string | null;
  deliveryDays: number | null;
  url: string | null;
}

interface MetaAudience {
  id: string;
  name: string;
  /** Já em português — a rota traduz, ver `lib/meta-audiences.ts`. */
  subtypeLabel: string;
  size: number | null;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O gerador de copy.
 *
 * Duas etapas de propósito: gerar e, só depois, enviar ao quadro. A versão que
 * criava o card junto com a geração encheu o Kanban de tentativas descartadas —
 * a primeira saída quase nunca é a que se entrega.
 *
 * O produto e o público saem de listas reais: o catálogo do site e os públicos
 * personalizados da conta de anúncios. Digitar "iPhone 16 por 199" à mão é
 * exatamente onde entra o preço de três meses atrás.
 */
export default function CopyPage() {
  const [productId, setProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [audienceText, setAudienceText] = useState("");
  const [objective, setObjective] = useState("");
  const [channel, setChannel] = useState("");
  const [formatId, setFormatId] = useState<string | null>(null);
  const [toneId, setToneId] = useState<string | null>(null);
  const [toneText, setToneText] = useState("");
  const [constraints, setConstraints] = useState("");
  const [variationCount, setVariationCount] = useState(DEFAULT_VARIATIONS);
  const [priority, setPriority] = useState<Priority>("MEDIA");

  const [products, setProducts] = useState<AlluProduct[]>([]);
  const [audiences, setAudiences] = useState<MetaAudience[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingAudiences, setLoadingAudiences] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [audiencesError, setAudiencesError] = useState<string | null>(null);

  /**
   * O resultado em duas formas.
   *
   * `variations` é o caminho normal — cada variação num card editável. `rawCopy`
   * é o recuo para quando a saída não bate com o formato pedido: um provedor da
   * cadeia de fallback pode responder fora do padrão, e perder a copy por causa
   * disso seria pior do que editá-la como texto corrido.
   */
  const [variations, setVariations] = useState<CopyVariation[]>([]);
  const [rawCopy, setRawCopy] = useState("");
  const [references, setReferences] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ board: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<Target | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);


  const loadProducts = React.useCallback(async (refresh = false) => {
    setLoadingProducts(true);
    setProductsError(null);
    try {
      const res = await fetch(`/api/creator/catalog${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setProductsError(data.error || "O catálogo não respondeu.");
        return;
      }
      setProducts(data.products || []);
    } catch {
      setProductsError("Falha de conexão com o catálogo.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadAudiences = React.useCallback(async (refresh = false) => {
    setLoadingAudiences(true);
    setAudiencesError(null);
    try {
      const res = await fetch(`/api/creator/audiences${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setAudiencesError(data.error || "Não foi possível consultar os públicos.");
        return;
      }
      setAudiences(data.audiences || []);
    } catch {
      setAudiencesError("Falha de conexão com a Meta.");
    } finally {
      setLoadingAudiences(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadAudiences();

    fetch("/api/creator/copy")
      .then((res) => res.json())
      .then((res) => {
        setTarget(res.target ?? null);
        setAiConfigured(res.aiConfigured !== false);
      })
      .catch(() => setTarget(null));
  }, [loadProducts, loadAudiences]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  const productOptions: SearchSelectOption[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        label: p.name,
        hint: [p.category, p.availabilityLabel].filter(Boolean).join(" · ") || undefined,
        // O preço em destaque é o gancho da lista: escolher produto sem ver
        // quanto custa obrigaria a abrir cada um para comparar.
        trailing: p.price !== null ? `${brl(p.price)}/mês` : undefined,
      })),
    [products]
  );

  const audienceOptions: SearchSelectOption[] = useMemo(
    () =>
      audiences.map((a) => ({
        id: a.id,
        label: a.name,
        hint: a.subtypeLabel,
        trailing: a.size !== null ? `~${a.size.toLocaleString("pt-BR")}` : undefined,
      })),
    [audiences]
  );

  const payload = () => ({
    productId,
    productName,
    audienceId,
    audienceText,
    objective,
    channel,
    formatId,
    toneId,
    toneText,
    constraints,
    variations: variationCount,
  });

  const generate = async () => {
    if (!productId && !productName.trim()) {
      setError("Escolha um produto do catálogo ou descreva a oferta.");
      return;
    }
    if (!audienceId && !audienceText.trim()) {
      setError("Escolha um público ou descreva para quem é a peça.");
      return;
    }
    if (!objective.trim()) {
      setError("O objetivo é obrigatório.");
      return;
    }

    setGenerating(true);
    setError(null);
    setSent(null);

    try {
      const res = await fetch("/api/creator/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Não foi possível gerar a copy.");
        return;
      }

      const texto = data.copy || "";
      const parsed = parseCopyVariations(texto);

      setVariations(parsed);
      // Só guarda o texto cru quando não deu para quebrar em cards; com cards,
      // a verdade passa a ser eles, e um texto paralelo divergiria na primeira
      // edição.
      setRawCopy(parsed.length ? "" : texto);
      setReferences(data.referencesUsed || 0);
    } catch {
      setError("Falha de conexão ao gerar a copy.");
    } finally {
      setGenerating(false);
    }
  };

  /** O que de fato será gravado no card: os cards editados, ou o texto cru. */
  const finalCopy = () =>
    variations.length ? serializeCopyVariations(variations) : rawCopy;

  const hasResult = variations.length > 0 || !!rawCopy.trim();

  const sendToBoard = async () => {
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/creator/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload(),
          sendToBoard: true,
          // A copy revisada na tela é a que vai para o card — reenviar só o
          // briefing faria o modelo escrever tudo de novo, e o texto que a
          // pessoa acabou de aprovar seria descartado.
          editedCopy: finalCopy(),
          priority,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Não foi possível enviar ao quadro.");
        return;
      }

      setSent({ board: data.board?.name ?? "" });
    } catch {
      setError("Falha de conexão ao enviar ao quadro.");
    } finally {
      setSending(false);
    }
  };

  const block: React.CSSProperties = {
    padding: "var(--pad-card)",
    borderRadius: "var(--radius-block)",
    background: "var(--surface-sunken)",
    border: "1px solid var(--surface-sunken-border)",
  };

  const refreshBtn = {
    padding: "0.2rem 0.5rem",
    fontSize: "var(--text-eyebrow)",
  } as const;

  return (
    <div className="dashboard-container">
      <section style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <h1
            style={{ fontSize: "var(--text-page)", fontWeight: 800, margin: 0, wordBreak: "break-word" }}
            className="lowercase-title"
          >
            gerador de copy<span className="dot-green">.</span>
          </h1>
          <p style={{ color: "var(--muted)", maxWidth: "600px", lineHeight: 1.6, margin: 0 }} className="lowercase-title">
            produto e preço do catálogo do site, público da conta de anúncios, e as peças que mais converteram nos últimos 30 dias como referência.
          </p>
        </div>

        {!aiConfigured && (
          <div
            className="glass-panel"
            role="alert"
            style={{ padding: "var(--pad-card)", fontSize: "var(--text-control)", color: "var(--warning)" }}
          >
            Nenhuma IA configurada. Adicione uma chave em{" "}
            <Link href="/configuracoes/ia" style={{ textDecoration: "underline" }}>
              Configurações → IA
            </Link>
            .
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "var(--gap-grid)",
            alignItems: "start",
          }}
        >
          {/* Briefing */}
          <div
            className="glass-panel"
            style={{ padding: "var(--pad-card-lg)", display: "flex", flexDirection: "column", gap: "var(--gap-stack)" }}
          >
            <div className="section-header" style={{ marginBottom: 0 }}>
              <span className="section-title">briefing</span>
            </div>

            {/* Produto */}
            <div className="field">
              <label
                className="field-label"
                htmlFor="copy-produto"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}
              >
                <span>
                  Produto <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={refreshBtn}
                  title="Rebuscar o catálogo do site"
                  onClick={() => loadProducts(true)}
                  disabled={loadingProducts}
                >
                  <RefreshCw size={11} />
                  Atualizar
                </button>
              </label>

              <SearchSelect
                id="copy-produto"
                options={productOptions}
                value={productId}
                onChange={setProductId}
                loading={loadingProducts}
                placeholder="Escolha um produto do site…"
                emptyLabel="Nenhum produto com esse nome."
              />

              {productsError && (
                <span className="field-hint" style={{ color: "var(--danger)" }}>
                  {productsError}
                </span>
              )}

              {/* O preço aparece assim que o produto é escolhido: é o número que
                  vai para a copy e para a arte, e conferi-lo antes de gerar é
                  mais barato do que descobrir errado depois de publicado. */}
              {selectedProduct && (
                <div style={{ ...block, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {[
                      { label: "12 meses", value: selectedProduct.price12 },
                      { label: "24 meses", value: selectedProduct.price24 },
                      { label: "36 meses", value: selectedProduct.price36 },
                    ]
                      .filter((p) => p.value !== null)
                      .map((p) => (
                        <span
                          key={p.label}
                          style={{
                            display: "inline-flex",
                            flexDirection: "column",
                            gap: "0.05rem",
                            padding: "0.28rem 0.5rem",
                            borderRadius: "var(--radius-block)",
                            background: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "var(--text-eyebrow)",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              color: "var(--muted)",
                            }}
                          >
                            {p.label}
                          </span>
                          <strong style={{ fontSize: "var(--text-caption)", color: "var(--primary)" }}>
                            {brl(p.value as number)}/mês
                          </strong>
                        </span>
                      ))}
                  </div>

                  <span className="field-hint" style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    {selectedProduct.deliveryDays !== null && <span>Entrega em {selectedProduct.deliveryDays} dias</span>}
                    {selectedProduct.url && (
                      <a
                        href={selectedProduct.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", color: "var(--primary)" }}
                      >
                        ver no site <ExternalLink size={11} />
                      </a>
                    )}
                  </span>
                </div>
              )}

              {/* Um produto que ainda não subiu no site, ou uma campanha
                  institucional, não têm entrada no catálogo — e a peça existe
                  do mesmo jeito. */}
              {!productId && (
                <input
                  className="field-input"
                  value={productName}
                  placeholder="Ou descreva a oferta, se não estiver no catálogo"
                  aria-label="Produto fora do catálogo"
                  onChange={(e) => setProductName(e.target.value)}
                />
              )}
            </div>

            {/* Público */}
            <div className="field">
              <label
                className="field-label"
                htmlFor="copy-publico"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}
              >
                <span>
                  Público <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={refreshBtn}
                  title="Rebuscar os públicos da conta de anúncios"
                  onClick={() => loadAudiences(true)}
                  disabled={loadingAudiences}
                >
                  <RefreshCw size={11} />
                  Atualizar
                </button>
              </label>

              <SearchSelect
                id="copy-publico"
                options={audienceOptions}
                value={audienceId}
                onChange={setAudienceId}
                loading={loadingAudiences}
                placeholder="Escolha um público da conta…"
                emptyLabel="Nenhum público com esse nome."
              />

              {audiencesError && (
                <span className="field-hint" style={{ color: "var(--danger)" }}>
                  {audiencesError}
                </span>
              )}

              {!audienceId && (
                <input
                  className="field-input"
                  value={audienceText}
                  placeholder="Ou descreva o público, se não houver um cadastrado"
                  aria-label="Público descrito à mão"
                  onChange={(e) => setAudienceText(e.target.value)}
                />
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="copy-objetivo">
                Objetivo <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
              </label>
              <textarea
                id="copy-objetivo"
                className="field-input field-prose"
                value={objective}
                placeholder="O que esta peça precisa provocar? Que objeção precisa quebrar?"
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="copy-formato">
                Formato
              </label>
              <select
                id="copy-formato"
                className="field-input"
                value={formatId ?? ""}
                onChange={(e) => setFormatId(e.target.value || null)}
              >
                <option value="">Selecione…</option>
                {COPY_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="copy-tom">
                Tom de voz
              </label>
              <select
                id="copy-tom"
                className="field-input"
                value={toneId ?? ""}
                onChange={(e) => setToneId(e.target.value || null)}
              >
                <option value="">Selecione…</option>
                {COPY_TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                className="field-input"
                value={toneText}
                placeholder="Observação sobre o tom, se precisar"
                aria-label="Observação sobre o tom de voz"
                onChange={(e) => setToneText(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="copy-canal">
                Canal
              </label>
              <input
                id="copy-canal"
                className="field-input"
                value={channel}
                placeholder="Meta Ads"
                onChange={(e) => setChannel(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="copy-restricoes">
                Restrições
              </label>
              <textarea
                id="copy-restricoes"
                className="field-input field-prose"
                value={constraints}
                placeholder="O que não pode ser dito, termos obrigatórios, limite de caracteres."
                onChange={(e) => setConstraints(e.target.value)}
              />
            </div>

            {/*
              Até 12 variações. Doze pílulas ocupariam a largura toda do painel,
              então o controle é um deslizante com o número à vista — e o aviso
              aparece só quando o número começa a apertar o teto de saída da IA.
            */}
            <div className="field">
              <label
                className="field-label"
                htmlFor="copy-variacoes"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                Variações
                <strong style={{ color: "var(--primary)", fontSize: "var(--text-cardtitle)" }}>{variationCount}</strong>
              </label>
              <input
                id="copy-variacoes"
                type="range"
                min={MIN_VARIATIONS}
                max={MAX_VARIATIONS}
                value={variationCount}
                onChange={(e) => setVariationCount(Number(e.target.value))}
                style={{ accentColor: "var(--primary)", width: "100%" }}
              />
              {variationCount >= 8 && (
                <span className="field-hint">
                  Com muitas variações a IA fica mais concisa para caber no limite de resposta.
                </span>
              )}
            </div>

            <button className="btn btn-primary btn-block" onClick={generate} disabled={generating || !aiConfigured}>
              <Wand2 size={15} className={generating ? "spin" : ""} />
              {generating ? "Escrevendo…" : hasResult ? "Gerar de novo" : "Gerar copy"}
            </button>

            {error && (
              <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
                {error}
              </span>
            )}
          </div>

          {/* Resultado */}
          <div
            className="glass-panel"
            style={{ padding: "var(--pad-card-lg)", display: "flex", flexDirection: "column", gap: "var(--gap-stack)" }}
          >
            <div className="section-header" style={{ marginBottom: 0 }}>
              <span className="section-title">resultado</span>
              {references > 0 && (
                <span className="section-subtitle">{references} peça(s) vencedora(s) como referência</span>
              )}
            </div>

            {!hasResult ? (
              <div
                style={{
                  ...block,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "2.5rem 1rem",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: "var(--text-control)",
                }}
              >
                <Sparkles size={26} />
                Preencha o briefing e gere as variações.
              </div>
            ) : (
              <>
                {variations.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-stack)" }}>
                    {variations.map((v, i) => (
                      <VariationCard
                        key={v.id}
                        variation={v}
                        index={i}
                        canRemove={variations.length > 1}
                        onChange={(next) =>
                          setVariations((prev) => prev.map((x) => (x.id === v.id ? next : x)))
                        }
                        onRemove={() =>
                          setVariations((prev) => prev.filter((x) => x.id !== v.id))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Recuo: a saída não bateu com o formato pedido, então ela
                        é editada como texto corrido em vez de se perder. */}
                    <span className="field-hint">
                      A IA respondeu fora do formato esperado — edite como texto.
                    </span>
                    <textarea
                      className="field-input field-prose"
                      value={rawCopy}
                      aria-label="Copy gerada"
                      onChange={(e) => setRawCopy(e.target.value)}
                      style={{ minHeight: "260px" }}
                    />
                    <div style={{ ...block, fontSize: "var(--text-body)", lineHeight: 1.55 }}>
                      <ReactMarkdown>{rawCopy}</ReactMarkdown>
                    </div>
                  </>
                )}

                <div className="field">
                  <label
                    className="field-label"
                    htmlFor="copy-entrega"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <CalendarDays size={14} />
                    Data de entrega
                  </label>
                  <input
                    id="copy-entrega"
                    type="date"
                    className="field-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                  <span className="field-hint">
                    Vira o prazo do card no quadro. Em branco, a demanda entra sem prazo.
                  </span>
                </div>

                <div className="field">
                  <span className="field-label">Prioridade no quadro</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="btn btn-toggle"
                        aria-pressed={priority === p}
                        style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                        onClick={() => setPriority(p)}
                      >
                        {PRIORITY_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard?.writeText(finalCopy());
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check size={15} /> : <CopyIcon size={15} />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>

                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, minWidth: "180px" }}
                    onClick={sendToBoard}
                    disabled={sending || !target}
                    title={
                      target
                        ? `Cria um card em "${target.boardName}"${target.columnName ? ` → ${target.columnName}` : ""}`
                        : "Nenhum quadro configurado para receber copys"
                    }
                  >
                    <Send size={15} />
                    {sending ? "Enviando…" : "Enviar ao Kanban"}
                  </button>
                </div>

                {target && !sent && (
                  <span className="field-hint">
                    Cai em <strong>{target.boardName}</strong>
                    {target.columnName ? ` → ${target.columnName}` : ""}.
                  </span>
                )}

                {sent && (
                  <div
                    role="status"
                    style={{
                      ...block,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "var(--text-control)",
                      color: "var(--success)",
                    }}
                  >
                    <Check size={16} />
                    <span style={{ flex: 1, minWidth: 0 }}>Enviado para {sent.board}.</span>
                    <Link
                      href="/creator/kanban"
                      className="btn btn-secondary"
                      style={{ padding: "0.3rem 0.7rem", fontSize: "var(--text-caption)" }}
                    >
                      Ver no quadro
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

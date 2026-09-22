"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Wand2, Send, Copy as CopyIcon, Check, ArrowRight, Sparkles, RefreshCw, ExternalLink, CalendarDays, Tag, PenLine, Users } from "lucide-react";
import Link from "next/link";
import SearchSelect, { type SearchSelectOption } from "@/components/creator/SearchSelect";
import VariationCard from "@/components/creator/VariationCard";
import AttachmentField from "@/components/creator/AttachmentField";
import DatePicker from "@/components/DatePicker";
import FieldInput, { type FieldDefinition } from "@/components/creator/FieldInput";
import {
  parseCopyVariations,
  serializeCopyVariations,
  emptyVariation,
  type CopyVariation,
} from "@/lib/copy-parse";
import { type CardAttachment } from "@/lib/attachments";
import { camposVisiveis, limparRespostasOcultas } from "@/lib/kanban";
import {
  COPY_TONES,
  MAX_VARIATIONS,
  MIN_VARIATIONS,
  DEFAULT_VARIATIONS,
  COPY_MODES,
  COPY_CHANNELS,
  OTHER_OPTION_ID,
  OTHER_OPTION_LABEL,
  buildCopyCardTitle,
  formatsForChannel,
  isOtherOption,
  type CopyModeId,
} from "@/lib/copy-options";

interface Target {
  boardId: string;
  boardName: string;
  columnName: string | null;
  /** O grupo dono da entrada do quadro — o que a tela já vem marcando. */
  groupId: string | null;
}

/** Um time do quadro, com a etapa em que ele recebe o que chega. */
interface GroupOption {
  id: string;
  name: string;
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

/** A entrada fixa das duas listas — mesmo rótulo e mesma posição nos dois campos. */
const OTHER_OPTION: SearchSelectOption = {
  id: OTHER_OPTION_ID,
  label: OTHER_OPTION_LABEL,
  hint: "não está cadastrado — descrever à mão",
  keywords: "outro especifique manual fora do catalogo nao cadastrado",
};

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
  const [mode, setMode] = useState<CopyModeId>("ai");
  const [productId, setProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [audienceText, setAudienceText] = useState("");
  const [objective, setObjective] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [toneId, setToneId] = useState<string | null>(null);
  const [toneText, setToneText] = useState("");
  const [constraints, setConstraints] = useState("");
  const [variationCount, setVariationCount] = useState(DEFAULT_VARIATIONS);

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
  const [cardTitle, setCardTitle] = useState("");
  const [attachments, setAttachments] = useState<CardAttachment[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ board: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Campos obrigatórios do quadro que o gerador não sabe preencher sozinho
   * (canal/formato/quantidade, ele já sabe — o resto, não). Preenchidos aqui
   * antes de mandar ao quadro, e não a cada geração: a maioria dos quadros
   * não tem nenhum, então perguntar isso cedo demais seria atrito por nada.
   */
  const [camposFaltando, setCamposFaltando] = useState<FieldDefinition[]>([]);
  const [respostasExtras, setRespostasExtras] = useState<Record<string, unknown>>({});

  const [target, setTarget] = useState<Target | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
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
        const times: GroupOption[] = res.groups ?? [];
        setGroups(times);
        /*
         * Um time sempre marcado de saída. Deixar em branco devolveria a copy à
         * situação de antes — card no quadro sem dono —, e escolher time não é
         * decisão de quem escreveu a copy: é o desenho da esteira.
         */
        setGroupId(res.target?.groupId ?? times[0]?.id ?? null);
        setAiConfigured(res.aiConfigured !== false);
        /*
         * O que este quadro pergunta, já na abertura da tela — não só depois
         * de uma primeira tentativa de "Enviar ao Board" recusada. A rota
         * devolve a mesma lista que usaria pra recusar o envio; aqui ela só
         * chega mais cedo.
         */
        if (Array.isArray(res.missingFields) && res.missingFields.length) {
          setCamposFaltando(res.missingFields);
        }
      })
      .catch(() => setTarget(null));
  }, [loadProducts, loadAudiences]);

  const manual = mode === "manual";

  /**
   * A etapa em que a copy vai cair, segundo o time escolhido.
   *
   * A tela anuncia o destino antes de enviar, e esse destino muda com o grupo.
   * Sem isto, o aviso seguiria mostrando a etapa do grupo padrão qualquer que
   * fosse a escolha — e mentir sobre onde o trabalho foi parar é pior do que
   * não dizer nada.
   */
  const etapaDestino =
    groups.find((g) => g.id === groupId)?.columnName ?? target?.columnName ?? null;

  /** Os formatos do canal escolhido. Sem canal, a caixa de formato fica fechada. */
  const channelFormats = useMemo(() => formatsForChannel(channelId), [channelId]);

  /*
   * "Outro / especifique" é uma opção da lista, não um campo permanente abaixo
   * dela. O id sentinela nunca vira id de produto: vira nulo no envio, e o campo
   * de texto livre só existe enquanto ele estiver escolhido.
   */
  const productIsOther = isOtherOption(productId);
  const audienceIsOther = isOtherOption(audienceId);
  const toneIsOther = isOtherOption(toneId);

  /*
   * Escolhido da lista **ou** descrito à mão — as duas formas valem, e é por
   * isso que a checagem não é pelo id. Exigir o catálogo deixaria de fora a
   * campanha institucional e o produto que ainda não subiu no site.
   */
  const hasProduct = (!!productId && !productIsOther) || !!productName.trim();
  const hasAudience = (!!audienceId && !audienceIsOther) || !!audienceText.trim();

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  /**
   * O título que o card vai receber, montado sozinho.
   *
   * Vazio em `cardTitle` significa "use o automático", e é por isso que o campo
   * não guarda o texto montado: assim ele acompanha a troca de formato, de
   * produto e o descarte de uma variação enquanto ninguém o editou — e, se
   * alguém apagar o que escreveu, o automático volta em vez de o card ir ao
   * quadro sem nome.
   */
  const autoTitle = useMemo(
    () =>
      buildCopyCardTitle({
        formatId,
        productName: selectedProduct?.name || productName,
        variations: variations.length || variationCount,
      }),
    [formatId, selectedProduct, productName, variations.length, variationCount]
  );

  const productOptions: SearchSelectOption[] = useMemo(
    () => [
      OTHER_OPTION,
      ...products.map((p) => ({
        id: p.id,
        label: p.name,
        hint: [p.category, p.availabilityLabel].filter(Boolean).join(" · ") || undefined,
        // O preço em destaque é o gancho da lista: escolher produto sem ver
        // quanto custa obrigaria a abrir cada um para comparar.
        trailing: p.price !== null ? `${brl(p.price)}/mês` : undefined,
      })),
    ],
    [products]
  );

  const audienceOptions: SearchSelectOption[] = useMemo(
    () => [
      OTHER_OPTION,
      ...audiences.map((a) => ({
        id: a.id,
        label: a.name,
        hint: a.subtypeLabel,
        trailing: a.size !== null ? `~${a.size.toLocaleString("pt-BR")}` : undefined,
      })),
    ],
    [audiences]
  );

  const payload = () => ({
    mode,
    productId: productIsOther ? null : productId,
    productName: productIsOther ? productName : "",
    // No manual o campo de público nem existe na tela: mandar o que sobrou de
    // uma geração anterior poria no card um público que ninguém escolheu.
    audienceId: manual || audienceIsOther ? null : audienceId,
    audienceText: !manual && audienceIsOther ? audienceText : "",
    objective,
    channelId,
    formatId,
    toneId: toneIsOther ? null : toneId,
    toneText: toneIsOther ? toneText : "",
    constraints,
    variations: variationCount,
  });

  /** Uma variação escrita é uma que tem qualquer coisa em algum campo. */
  const temTexto = (v: CopyVariation) =>
    !!(v.headline.trim() || v.body.trim() || v.cta.trim() || v.angle.trim());

  /**
   * A quantidade e os cards andam juntos no modo manual.
   *
   * No modo IA o número é um pedido ao modelo; no manual ele **é** a pilha de
   * cards em branco na tela, um por criativo. Subir acrescenta em branco no fim;
   * descer tira do fim — e pergunta antes, se o que sairia já tem texto. O
   * ajuste acontece aqui, no gesto, e não num efeito: com a lista sincronizada
   * por efeito, o cancelar do aviso já teria chegado tarde.
   */
  const changeCount = (n: number) => {
    if (manual && n < variations.length) {
      const perdidas = variations.slice(n).filter(temTexto);
      if (
        perdidas.length &&
        !confirm(
          `${perdidas.length} variação(ões) do fim já têm texto e serão descartadas. Continuar?`
        )
      ) {
        return;
      }
    }

    setVariationCount(n);

    if (manual) {
      setVariations((prev) =>
        n > prev.length
          ? [...prev, ...Array.from({ length: n - prev.length }, emptyVariation)]
          : prev.slice(0, n)
      );
    }
  };

  /*
   * Trocar o canal derruba um formato que não seja dele.
   *
   * Sem isso, quem escolhesse "Estático Stories" no Meta e mudasse para o site
   * ficaria com um formato invisível na caixa — selecionado no estado, ausente
   * da lista —, e ele viajaria assim mesmo para o prompt e para o título do card.
   */
  const changeChannel = (next: string | null) => {
    setChannelId(next);
    if (formatId && !formatsForChannel(next).some((f) => f.id === formatId)) {
      setFormatId(null);
    }
  };

  const changeMode = (next: CopyModeId) => {
    setMode(next);
    setError(null);
    setSent(null);

    // Entrar no manual sem nada escrito já abre os cards em branco — é a tela
    // inteira do modo. O que já estava escrito, gerado ou não, permanece.
    if (next === "manual" && variations.length === 0) {
      setRawCopy("");
      setVariations(Array.from({ length: variationCount }, emptyVariation));
    }
  };

  const generate = async () => {
    if (!hasProduct) {
      setError("Escolha um produto do catálogo ou descreva a oferta.");
      return;
    }
    if (!hasAudience) {
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
    if (!hasProduct) {
      setError("Escolha um produto do catálogo ou descreva a oferta.");
      return;
    }
    if (manual && !variations.some(temTexto) && !rawCopy.trim()) {
      setError("Escreva ao menos uma variação antes de enviar ao quadro.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/creator/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload(),
          sendToBoard: true,
          title: cardTitle.trim() || autoTitle,
          // A copy revisada na tela é a que vai para o card — reenviar só o
          // briefing faria o modelo escrever tudo de novo, e o texto que a
          // pessoa acabou de aprovar seria descartado.
          editedCopy: finalCopy(),
          dueDate: dueDate || null,
          attachments,
          groupId,
          // O que a tela pediu a mais (ver `camposFaltando`, preenchido já
          // na abertura) — vazio para quem não tem nenhum campo extra.
          extraRespostas: respostasExtras,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        /*
         * A rota devolve a lista inteira de campos obrigatórios que faltam
         * (não um de cada vez) — mostra o formulário pra essa lista em vez
         * do erro genérico, pra resolver tudo numa passada só.
         */
        if (Array.isArray(data.missingFields) && data.missingFields.length) {
          setCamposFaltando(data.missingFields);
          setError(data.error || "Responda os campos obrigatórios antes de enviar ao quadro.");
          return;
        }
        setError(data.error || "Não foi possível enviar ao quadro.");
        return;
      }

      setCamposFaltando([]);
      setRespostasExtras({});
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
            produto e preço do catálogo do site, público da conta de anúncios, e as peças aprovadas como winners servindo de molde.
          </p>
        </div>

        {/*
          Quem escreve — a primeira decisão, porque é ela que define o que o
          resto da tela pede. O grupo é o `.btn-toggle` do design system, o mesmo
          do alternador Dash/Creator no cabeçalho: um conjunto em que só uma
          opção vale por vez.
        */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {COPY_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="btn btn-toggle"
                aria-pressed={mode === m.id}
                onClick={() => changeMode(m.id)}
                style={{ padding: "0.45rem 0.85rem", fontSize: "var(--text-control)" }}
              >
                {m.id === "manual" ? <PenLine size={14} /> : <Wand2 size={14} />}
                {m.label}
              </button>
            ))}
          </div>
          <span className="field-hint">
            {COPY_MODES.find((m) => m.id === mode)?.hint}
          </span>
        </div>

        {!aiConfigured && !manual && (
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
                  institucional, não têm entrada no catálogo — e a peça existe do
                  mesmo jeito. O campo aparece pela opção "Outro / especifique"
                  da lista: fixo embaixo dela, ele pedia à pessoa que já tinha
                  escolhido um produto que descrevesse a oferta de novo. */}
              {productIsOther && (
                <input
                  className="field-input"
                  value={productName}
                  placeholder="Descreva a oferta"
                  aria-label="Produto fora do catálogo"
                  autoFocus
                  onChange={(e) => setProductName(e.target.value)}
                />
              )}
            </div>

            {/*
              Público — só no modo IA.

              A lista existe para dar ao modelo a segmentação real da conta como
              briefing. Quem escreve à mão já partiu de uma análise de público
              antes de abrir a tela; repetir a pergunta aqui é pedir que a pessoa
              formalize para ninguém uma decisão que ela já tomou.
            */}
            {!manual && (
              <div className="field">
                <label
                  className="field-label"
                  htmlFor="copy-publico"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}
                >
                  <span>
                    Público{" "}
                    {!manual && <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>}
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

                {audienceIsOther && (
                  <input
                    className="field-input"
                    value={audienceText}
                    placeholder="Descreva para quem é a peça"
                    aria-label="Público descrito à mão"
                    autoFocus
                    onChange={(e) => setAudienceText(e.target.value)}
                  />
                )}
              </div>
            )}

            <div className="field">
              <label className="field-label" htmlFor="copy-objetivo">
                Objetivo{" "}
                {!manual && <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>}
              </label>
              <textarea
                id="copy-objetivo"
                className="field-input field-prose"
                value={objective}
                placeholder={
                  manual
                    ? "O que esta peça precisa provocar? Vai junto no card, para quem produzir."
                    : "O que esta peça precisa provocar? Que objeção precisa quebrar?"
                }
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>

            {/*
              Canal antes de formato, porque formato depende dele.

              O canal era texto livre ("Meta Ads", "meta", "IG") e o formato
              oferecia os dezenove de uma vez, a maioria sem relação com onde a
              peça ia rodar. Agora a segunda lista é a do canal escolhido — e
              "Carrossel", que existe no Meta e no TikTok, deixa de ser ambíguo.
            */}
            <div className="field">
              <label className="field-label" htmlFor="copy-canal">
                Canal
              </label>
              <select
                id="copy-canal"
                className="field-input"
                value={channelId ?? ""}
                onChange={(e) => changeChannel(e.target.value || null)}
              >
                <option value="">Selecione…</option>
                {COPY_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="copy-formato">
                Formato
              </label>
              <select
                id="copy-formato"
                className="field-input"
                value={formatId ?? ""}
                disabled={!channelId}
                onChange={(e) => setFormatId(e.target.value || null)}
              >
                <option value="">{channelId ? "Selecione…" : "Escolha o canal primeiro"}</option>
                {channelFormats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              {!channelId && (
                <span className="field-hint">Cada canal tem os seus formatos.</span>
              )}
            </div>

            {/* Tom e restrições são instruções para o modelo. No modo manual não
                há a quem instruir: quem escreve já está aplicando o tom. */}
            {!manual && (
              <>
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
                  {/* No fim, e não no começo como nas caixas de busca: ali a
                      lista é longa e rolável, e a opção precisava estar sempre à
                      vista; aqui os oito tons cabem na tela de uma vez, e a
                      convenção de formulário é "Outro" fechando a lista. */}
                  <option value={OTHER_OPTION_ID}>{OTHER_OPTION_LABEL}</option>
                </select>

                {toneIsOther && (
                  <input
                    className="field-input"
                    value={toneText}
                    placeholder="Descreva o tom de voz desta peça"
                    aria-label="Tom de voz descrito à mão"
                    autoFocus
                    onChange={(e) => setToneText(e.target.value)}
                  />
                )}
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
              </>
            )}

            {/*
              Até 12 variações. Doze pílulas ocupariam a largura toda do painel,
              então o controle é um deslizante com o número à vista — e o aviso
              aparece só quando o número começa a apertar o teto de saída da IA.

              No modo manual o mesmo controle monta a pilha de cards em branco,
              um por criativo: é a quantidade de peças que o card do quadro vai
              pedir.
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
                onChange={(e) => changeCount(Number(e.target.value))}
                style={{ accentColor: "var(--primary)", width: "100%" }}
              />
              {manual ? (
                <span className="field-hint">
                  Um card em branco por criativo, ao lado. Descer o número descarta os do fim.
                </span>
              ) : (
                variationCount >= 8 && (
                  <span className="field-hint">
                    Com muitas variações a IA fica mais concisa para caber no limite de resposta.
                  </span>
                )
              )}
            </div>

            {/* No manual não há o que gerar: os cards já estão ao lado, e o
                caminho até o quadro é o botão de enviar, no outro painel. */}
            {!manual && (
              <button className="btn btn-primary btn-block" onClick={generate} disabled={generating || !aiConfigured}>
                <Wand2 size={15} className={generating ? "spin" : ""} />
                {generating ? "Escrevendo…" : hasResult ? "Gerar de novo" : "Gerar copy"}
              </button>
            )}

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
              <span className="section-title">{manual ? "peças" : "resultado"}</span>
              {!manual && references > 0 && (
                <span className="section-subtitle">{references} winner(s) como referência</span>
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
                {manual
                  ? "Escolha quantas peças e escreva cada uma."
                  : "Preencha o briefing e gere as variações."}
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

                <AttachmentField attachments={attachments} onChange={setAttachments} />

                {groups.length > 0 && (
                  <div className="field">
                    <label
                      className="field-label"
                      htmlFor="copy-grupo"
                      style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                    >
                      <Users size={14} />
                      Grupo responsável
                    </label>
                    <select
                      id="copy-grupo"
                      className="field-input"
                      value={groupId ?? ""}
                      onChange={(e) => setGroupId(e.target.value || null)}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      O time que recebe esta copy. Todo mundo do grupo assume o card, e quem
                      puxar para produção fica com ele.
                    </span>
                  </div>
                )}

                <div className="field">
                  <label
                    className="field-label"
                    htmlFor="copy-titulo"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <Tag size={14} />
                    Título no quadro
                  </label>
                  <input
                    id="copy-titulo"
                    className="field-input"
                    value={cardTitle || autoTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                  />
                  <span className="field-hint">
                    Tipo de peça • produto • quantidade. Edite se quiser; em branco, volta ao automático.
                  </span>
                </div>

                <div className="field">
                  <label
                    className="field-label"
                    htmlFor="copy-entrega"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <CalendarDays size={14} />
                    Data de entrega
                  </label>
                  <DatePicker
                    id="copy-entrega"
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Sem prazo definido"
                  />
                  <span className="field-hint">
                    Vira o prazo do card no quadro. Em branco, a demanda entra sem prazo.
                  </span>
                </div>

                {/*
                  Chega preenchida já na abertura da tela (ver o `GET` no
                  `useEffect` acima) — o que este quadro pergunta não depende
                  de nada que a pessoa ainda vá escolher, então não há motivo
                  para esperar uma primeira tentativa de envio recusada pra
                  mostrar. Continua vazio em branco para quadros que não têm
                  nenhum campo extra obrigatório.
                */}
                {camposFaltando.length > 0 && (
                  <div style={block}>
                    <span className="field-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                      Este quadro também pergunta:
                    </span>
                    {/* Filtrado pela regra de exibição como em qualquer outro
                        formulário: se um campo condicional chegou aqui, ele só
                        aparece depois que a resposta que o revela for dada. */}
                    {camposVisiveis(camposFaltando, respostasExtras).map((campo) => (
                      <FieldInput
                        key={campo.key}
                        field={campo}
                        value={respostasExtras[campo.key]}
                        values={respostasExtras}
                        onChange={(v) =>
                          setRespostasExtras((atual) =>
                            limparRespostasOcultas(camposFaltando, { ...atual, [campo.key]: v })
                          )
                        }
                      />
                    ))}
                  </div>
                )}

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
                        ? `Cria um card em "${target.boardName}"${etapaDestino ? ` → ${etapaDestino}` : ""}`
                        : "Nenhum quadro configurado para receber copys"
                    }
                  >
                    <Send size={15} />
                    {sending ? "Enviando…" : "Enviar ao Board"}
                  </button>
                </div>

                {target && !sent && (
                  <span className="field-hint">
                    Cai em <strong>{target.boardName}</strong>
                    {etapaDestino ? ` → ${etapaDestino}` : ""}.
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

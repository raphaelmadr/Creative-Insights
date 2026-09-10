"use client";

import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Avatar } from "./Avatar";
import SafeImage from "./SafeImage";
import styles from "./CreativeGrid.module.css";
import {
  AudienceIcon,
  FbIcon,
  InstaIcon,
  MediaLightbox,
  MessengerIcon,
  MetricMiniCard,
  PlayBadge,
  TikTokIcon,
  approvedValueTone,
  formatCurrencyCompact,
  formatCurrencyFull,
} from "./CreativeCardPrimitives";
import { Image as ImageIcon, Copy, Check, Sparkles, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        background: "transparent", border: "none", cursor: "pointer", opacity: 0.5,
        display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "2px",
        transition: "opacity 0.2s"
      }}
      onMouseOver={e => e.currentTarget.style.opacity = "1"}
      onMouseOut={e => e.currentTarget.style.opacity = "0.5"}
      title="Copiar nome do anúncio"
    >
      {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} color="var(--foreground)" />}
    </button>
  );
}

/** Copiar o nome do anúncio com rótulo — dentro do popup há espaço para dizer o que faz. */
function CopyNameButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Copiar nome do anúncio"
      style={{
        flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "0.4rem",
        background: copied ? "rgba(16, 185, 129, 0.9)" : "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)", borderRadius: "100px",
        padding: "0.35rem 0.7rem", color: "#fff", fontSize: "0.72rem", fontWeight: 600,
        lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer", transition: "background 0.2s ease"
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copiado" : "Copiar nome"}
    </button>
  );
}

/**
 * Visualização do criativo em tamanho cheio.
 *
 * A arte de origem tem muito mais resolução do que o quadrado do cartão mostra,
 * e detalhe de peça — corpo de texto, selo, legibilidade do CTA — é o que se vem
 * conferir. O popup usa `image_url` (a arte inteira) e só cai na capa quando não
 * há arte. Fecha no fundo, no X ou no Esc.
 */
function CreativePreviewModal({ creative, onClose }: { creative: any; onClose: () => void }) {
  return (
    <MediaLightbox
      imageUrl={creative.image_url || creative.thumbnail_url}
      videoUrl={creative.videoUrl}
      alt={creative.ad_name}
      onClose={onClose}
    >
      {/* O nome e o copiar moram dentro da arte, numa caixa sobre o rodapé dela. */}
      <div
        style={{
          position: "absolute", left: "10px", right: "10px", bottom: "10px", zIndex: 2,
          display: "flex", alignItems: "center", gap: "0.6rem",
          background: "rgba(0,0,0,0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.16)", borderRadius: "12px", padding: "0.55rem 0.6rem 0.55rem 0.75rem"
        }}
      >
        <span style={{ flex: 1, minWidth: 0, color: "rgba(255,255,255,0.92)", fontSize: "0.74rem", fontWeight: 600, lineHeight: 1.35, wordBreak: "break-all", maxHeight: "2.7em", overflow: "hidden" }}>
          {creative.ad_name}
        </span>
        <CopyNameButton text={creative.ad_name} />
      </div>
    </MediaLightbox>
  );
}

/** Análise já salva no banco, entregue pela grade junto com o criativo. */
interface SavedAnalysis {
  hypothesis: string;
  analyzedAt: string | null;
}

/**
 * Estado da análise de IA de um criativo.
 *
 * Vive no cartão porque os dois pontos que dependem dele — o gatilho sobre a
 * imagem e o popup que mostra o texto — ficam distantes na árvore.
 *
 * A análise fica salva no banco. Quando o criativo já tem uma, abrir o popup é
 * uma leitura do banco — instantânea e sem custo; o modelo só é chamado na
 * primeira análise da peça ou quando alguém pede a refação.
 */
function useHypothesis(creative: any, savedAnalysis?: SavedAnalysis | null) {
  const [loading, setLoading] = useState(false);

  // Só o que foi gerado neste cartão. A análise que já estava no banco chega
  // por prop, da grade — copiá-la para o estado criaria uma segunda verdade
  // sobre o mesmo texto, e um efeito de sincronia para mantê-las iguais.
  const [fresh, setFresh] = useState<{ hypothesis: string; analyzedAt: string | null } | null>(null);

  /*
   * O que o cartão mostra, em ordem de precedência: a análise recém-gerada
   * aqui, depois a que a grade trouxe do banco. `aiAnalyzedAt` entra como
   * último recurso porque a data chega no `/api/db-ads`, antes do texto.
   */
  const hypothesis = fresh?.hypothesis ?? savedAnalysis?.hypothesis ?? null;
  const savedAt = fresh?.analyzedAt ?? savedAnalysis?.analyzedAt ?? creative.aiAnalyzedAt ?? null;

  const request = (force: boolean) => {
    setLoading(true);

    // A rota POST também devolveria a análise salva, mas o GET evita mandar o
    // criativo inteiro só para receber de volta um texto que já está no banco.
    const cached: Promise<any> =
      savedAt && !force && creative.id
        ? fetch(`/api/hypothesis?adId=${encodeURIComponent(creative.id)}`).then(res => res.json())
        : Promise.resolve(null);

    cached
      .then(saved =>
        saved?.hypothesis
          ? saved
          : fetch("/api/hypothesis", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...creative, force })
            }).then(res => res.json())
      )
      .then(data => {
        setFresh({
          hypothesis:
            data.success && data.hypothesis
              ? data.hypothesis
              : "Não foi possível gerar hipótese para este anúncio.",
          analyzedAt: data.analyzedAt ?? savedAt,
        });
        setLoading(false);
      })
      .catch(() => {
        setFresh({ hypothesis: "Erro ao conectar com a IA.", analyzedAt: null });
        setLoading(false);
      });
  };

  return {
    hypothesis,
    loading,
    savedAt,
    analyze: () => request(false),
    reanalyze: () => request(true),
  };
}

/**
 * Gatilho da análise, sobre a imagem.
 *
 * Mesma família visual do selo do criador no canto oposto — pílula escura com
 * desfoque, que pousa sobre qualquer criativo sem competir com ele — e o verde
 * da IA no hover, quando deixa de ser enfeite e vira ação. Antes era um quadrado
 * solto no canto do cartão, alinhado ao selo só por coincidência.
 */
function AnalyzeButton({
  onClick,
  saved,
  loading,
}: {
  onClick: () => void;
  saved?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      title={saved ? "Ver a análise salva deste criativo" : "Analisar criativo com IA"}
      style={{
        position: "absolute", top: "8px", right: "8px", zIndex: 10,
        display: "inline-flex", alignItems: "center", gap: "0.35rem",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.18)", borderRadius: "100px",
        padding: "4px 9px 4px 8px", color: "rgba(255,255,255,0.92)",
        fontSize: "0.68rem", fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap",
        cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", transition: "background 0.2s ease, border-color 0.2s ease, color 0.2s ease"
      }}
      onMouseOver={e => {
        e.currentTarget.style.background = "rgba(16, 185, 129, 0.9)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
        e.currentTarget.style.color = "#fff";
      }}
      onMouseOut={e => {
        e.currentTarget.style.background = "rgba(0,0,0,0.6)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
        e.currentTarget.style.color = "rgba(255,255,255,0.92)";
      }}
    >
      {loading ? <Loader2 size={12} style={{ animation: "spin 2s linear infinite" }} /> : <Sparkles size={12} />}
      {loading ? "Analisando" : saved ? "Ver análise salva" : "Analisar"}
    </button>
  );
}

/** Data e hora da análise salva — o rodapé do popup tem espaço para as duas. */
function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data desconhecida";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/*
 * As três etapas que o prompt de análise garante, cada uma em linha própria.
 * Destacá-las custa uma expressão regular e devolve a estrutura do texto: sem
 * isso o popup mostra um bloco corrido de mil caracteres.
 */
const SECTION_TITLE = /^\s*(?:\*\*|##\s*)?(Transcri[çc][ãa]o|An[áa]lise|Melhorias)\b\s*:?\s*(?:\*\*)?\s*$/i;

/** A análise em si: títulos de etapa destacados, o resto como parágrafo. */
function AnalysisBody({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "0.35rem" }} />;

        const title = line.match(SECTION_TITLE);
        if (title) {
          return (
            <h4
              key={i}
              style={{
                margin: i === 0 ? 0 : "0.5rem 0 0",
                color: "#10b981",
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
              }}
            >
              {title[1]}
            </h4>
          );
        }

        return (
          <p
            key={i}
            style={{
              margin: 0,
              fontSize: "0.84rem",
              lineHeight: 1.6,
              opacity: 0.9,
              whiteSpace: "pre-wrap",
            }}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Popup da análise: a peça em alta à esquerda, a leitura da IA à direita.
 *
 * A análise fala da arte — "o CTA está apagado", "a headline compete com o
 * selo". Lê-la embaixo do cartão, com a miniatura de 200px acima, obrigava a
 * decorar a peça; aqui as duas ficam lado a lado. E o popup abre no clique, com
 * a arte já visível, em vez de esperar a resposta do modelo para mostrar algo.
 */
function AnalysisModal({
  creative,
  hypothesis,
  loading,
  savedAt,
  onReanalyze,
  onClose,
}: {
  creative: any;
  hypothesis: string | null;
  loading: boolean;
  savedAt?: string | null;
  onReanalyze: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const posterUrl = creative.thumbnail_url || creative.image_url || "";
  const imageUrl = creative.image_url || creative.thumbnail_url || "";

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Análise do criativo ${creative.ad_name}`}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem"
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className={styles.analysisModal}
        style={{ position: "relative" }}
      >
        <div className={styles.analysisMedia}>
          {creative.videoUrl ? (
            <video src={creative.videoUrl} poster={posterUrl} controls preload="metadata" />
          ) : imageUrl ? (
            <SafeImage src={imageUrl} alt={creative.ad_name} />
          ) : (
            <div style={{ padding: "4rem 3rem", color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
              <ImageIcon size={28} />
            </div>
          )}
        </div>

        <div className={styles.analysisText}>
          {/* Cabeçalho fixo: o nome da peça é a referência de tudo o que o texto diz. */}
          <div
            style={{
              flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.4rem",
              padding: "1rem 2.6rem 0.75rem 1.1rem", borderBottom: "1px solid var(--card-border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "#10b981", fontWeight: 700, fontSize: "0.78rem" }}>
              <Sparkles size={14} />
              Leitura do criativo pela IA
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: "0.72rem", opacity: 0.7, lineHeight: 1.4, wordBreak: "break-all" }}>
                {creative.ad_name}
              </span>
              <CopyButton text={creative.ad_name} />
            </div>
          </div>

          {/* Só o texto rola: o cabeçalho e o rodapé ficam à vista numa análise longa. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.9rem 1.1rem" }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.7, fontSize: "0.85rem" }}>
                <Loader2 size={14} style={{ animation: "spin 2s linear infinite" }} />
                {savedAt ? "Refazendo a análise..." : "Lendo a peça e analisando..."}
              </div>
            ) : hypothesis ? (
              <AnalysisBody text={hypothesis} />
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}>Nada a mostrar para esta peça.</p>
            )}
          </div>

          <div
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "0.75rem", flexWrap: "wrap", padding: "0.7rem 1.1rem",
              borderTop: "1px solid var(--card-border)", fontSize: "0.68rem", opacity: 0.75
            }}
          >
            {/* Dizer que o texto veio do banco é o que explica por que abriu na hora. */}
            <span>{savedAt ? `Análise salva em ${formatSavedAt(savedAt)}` : "Análise desta sessão"}</span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReanalyze(); }}
              disabled={loading}
              title="Descartar a análise salva e pedir uma nova à IA"
              style={{
                background: "none", border: "none", color: "#10b981",
                fontSize: "0.68rem", fontWeight: 600, cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.4 : 1, padding: 0,
                display: "inline-flex", alignItems: "center", gap: "0.3rem"
              }}
            >
              <RefreshCw size={11} /> Refazer análise
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar"
          style={{
            position: "absolute", top: "10px", right: "10px",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "28px", height: "28px", borderRadius: "100px",
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            color: "var(--foreground)", cursor: "pointer"
          }}
        >
          <X size={15} />
        </button>
      </motion.div>
    </div>,
    document.body
  );
}

interface CreativeCardProps {
  creative: any;
  creators: any[];
  tier?: "super" | "winner";
  /** Análise salva desta peça, quando a grade já a trouxe do banco. */
  savedAnalysis?: SavedAnalysis;
}

export function CreativeCard({ creative, creators, tier, savedAnalysis }: CreativeCardProps) {
  const ai = useHypothesis(creative, savedAnalysis);

  /*
   * Antes o clique na arte chamava um `setHoveredPreview` que ninguém renderiza
   * — a peça nunca abria. O estado do popup mora aqui, no cartão, e vale em
   * qualquer tela que use o componente.
   */
  const [zoomed, setZoomed] = useState(false);

  /*
   * O popup abre no clique, não no fim da análise: a arte já está à vista
   * enquanto o modelo escreve, e uma análise já salva aparece na hora. Analisar
   * de novo é sempre um pedido explícito — nunca um efeito de abrir o popup.
   */
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const openAnalysis = () => {
    setAnalysisOpen(true);
    if (!ai.hypothesis && !ai.loading) ai.analyze();
  };
  const previewUrl = creative.image_url || creative.thumbnail_url;
  
  const creatorAcronym = (creative.designer || "").trim().toUpperCase();
  const matchingCreator = creators.find(c => {
    const acronyms = c.acronym.split(",").map((s: string) => s.trim().toUpperCase());
    return acronyms.includes(creatorAcronym);
  });
  
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } }}
      className={`glass-panel ${styles.card}`}
      style={{ position: "relative", transition: "all 0.3s ease" }}
    >
      {/*
        A mídia do cartão é sempre miniatura, vídeo incluído: o player embutido
        de 200px não dava para assistir e engolia o clique de abrir a peça.
        Vídeo mostra a capa com o selo de play e abre no popup, onde toca com
        controles — o mesmo comportamento da análise de similaridade.
      */}
      <div 
        className={styles.imageWrapper} 
        style={{ position: "relative", cursor: creative.videoUrl || previewUrl ? "zoom-in" : "default", overflow: "hidden" }}
        onClick={() => {
          if (creative.videoUrl || previewUrl) setZoomed(true);
        }}
      >
      {creative.videoUrl ? (
        <>
          <SafeImage
            src={creative.thumbnail_url || creative.image_url || ""}
            alt={creative.ad_name}
            style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "8px", transition: "transform 0.3s ease" }}
          />
          <PlayBadge />
        </>
      ) : creative.image_url ? (
        <SafeImage 
          src={creative.image_url} 
          alt={creative.ad_name} 
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "8px", transition: "transform 0.3s ease" }} 
        />
      ) : (
        <div style={{ width: "100%", aspectRatio: "1 / 1", background: "var(--card-border)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ImageIcon size={32} opacity={0.3} />
        </div>
      )}
      
      {matchingCreator && (
        <div style={{
          position: "absolute",
          top: "8px",
          left: "8px",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          padding: "4px 8px 4px 4px",
          borderRadius: "100px",
          color: "white",
          pointerEvents: "none"
        }} title={`Criador: ${matchingCreator.name}`}>
          <Avatar src={matchingCreator.avatarUrl} name={matchingCreator.name} size="xs" isActive={matchingCreator.active !== false} />
          <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{matchingCreator.name.split(" ")[0]}</span>
        </div>
      )}

      {/* Canto oposto ao selo do criador, na mesma altura. */}
      <AnalyzeButton onClick={openAnalysis} saved={!!ai.savedAt} loading={ai.loading} />
    </div>
    
    <div className={styles.info}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.25rem" }}>
            <h4 style={{ 
              margin: 0, fontSize: "0.8rem", lineHeight: 1.3, opacity: 0.9, wordBreak: "break-all", fontWeight: 600,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.6em"
            }}>
              {creative.ad_name}
            </h4>
            <CopyButton text={creative.ad_name} />
          </div>
        </div>
        <div style={{ flex: "2 1 200px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          <MetricMiniCard
            label="Invest."
            value={formatCurrencyCompact(parseFloat(creative.spend))}
            title={`Investimento acumulado: ${formatCurrencyFull(parseFloat(creative.spend))}`}
            tone="neutral"
          />
          <MetricMiniCard
            label="CPA"
            value={formatCurrencyCompact(parseFloat(creative.cpa))}
            title={`Custo por pedido aprovado: ${formatCurrencyFull(parseFloat(creative.cpa))}`}
            tone="neutral"
          />
          <MetricMiniCard
            label="Rec. Bruta"
            value={formatCurrencyCompact(parseFloat(creative.grossValue))}
            title={`Receita bruta acumulada (payment_approved): ${formatCurrencyFull(parseFloat(creative.grossValue))}`}
            tone="good"
          />
          <MetricMiniCard
            label="Rec. Líquida"
            value={formatCurrencyCompact(parseFloat(creative.riskApprovedValue))}
            title={`Receita líquida acumulada (risk_approved): ${formatCurrencyFull(parseFloat(creative.riskApprovedValue))}`}
            tone={approvedValueTone(parseFloat(creative.riskApprovedValue))}
          />
        </div>
      </div>
      
      <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--card-border)", paddingTop: "0.5rem" }}>
        {creative.createdTime ? (
          <span style={{ fontSize: "0.65rem", color: "var(--foreground)", opacity: 0.5, fontWeight: 500 }} title="Anúncio rodando desde">
            Desde {new Date(creative.createdTime).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </span>
        ) : <span />}
        
        {creative.platform === "TIKTOK" ? (
          <div style={{ display: "flex", gap: "0.4rem", opacity: 0.5, color: "var(--foreground)" }} title="TikTok Ads">
            <TikTokIcon size={12} />
          </div>
        ) : creative.platform === "META" ? (
          <div style={{ display: "flex", gap: "0.4rem", opacity: 0.5, color: "var(--foreground)" }} title={creative.publisherPlatforms ? `Canais: ${creative.publisherPlatforms}` : "Meta Ads"}>
            <FbIcon size={12} />
            {creative.publisherPlatforms?.includes("instagram") && <InstaIcon size={12} />}
            {creative.publisherPlatforms?.includes("messenger") && <MessengerIcon size={12} />}
            {creative.publisherPlatforms?.includes("audience_network") && <AudienceIcon size={12} />}
          </div>
        ) : null}
      </div>
    </div>

    {zoomed && <CreativePreviewModal creative={creative} onClose={() => setZoomed(false)} />}

    {analysisOpen && (
      <AnalysisModal
        creative={creative}
        hypothesis={ai.hypothesis}
        loading={ai.loading}
        savedAt={ai.savedAt}
        onReanalyze={ai.reanalyze}
        onClose={() => setAnalysisOpen(false)}
      />
    )}
  </motion.div>
  );
}

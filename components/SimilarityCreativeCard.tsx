"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import SafeImage from "./SafeImage";
import styles from "./CreativeGrid.module.css";
import { Ghost, Image as ImageIcon } from "lucide-react";
import {
  FbIcon,
  InstaIcon,
  MediaLightbox,
  MetricMiniCard,
  PlayBadge,
  TikTokIcon,
  formatCurrencyCompact,
  formatCurrencyFull,
} from "./CreativeCardPrimitives";

/**
 * O criativo dentro de um grupo de similaridade.
 *
 * Usa a linguagem dos cartões da home — pílula de métrica, selos sobre a arte,
 * painel de vidro — porque é a mesma leitura: uma peça e seus números. O que
 * muda é a pergunta: aqui o que importa é a POSIÇÃO da peça na disputa de verba
 * do grupo, então a fatia de gasto vira a métrica principal, e a categoria de
 * performance aparece no cartão para se ver de imediato se quem sugou a verba é
 * um Prime Winner ou apenas o primeiro de um grupo em teste.
 *
 * A arte aparece inteira, em `contain` sobre um fundo neutro, e não recortada
 * em `cover`: quase metade das peças é vertical (9:16), e comparar composição,
 * hierarquia e cores entre criativos cortados no meio não é possível.
 */

export interface SimilarityCreative {
  id: string;
  adName: string;
  campaignName: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  mediaType?: string | null;
  designer?: string | null;
  platform?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  spend: number;
  roas: number;
  ctr: number;
  cpm: number;
  purchases: number;
  reach?: number;
  frequency?: number;
}

/** Selo sobre a arte: mesma pílula translúcida dos cartões da home. */
function OverlayBadge({
  children,
  side,
  background,
}: {
  children: React.ReactNode;
  side: "left" | "right";
  background: string;
}) {
  return (
    <div
      style={{
        position: "absolute", top: "8px", [side]: "8px", zIndex: 10,
        display: "inline-flex", alignItems: "center", gap: "0.28rem",
        background, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.22)", borderRadius: "100px",
        padding: "4px 9px", color: "#fff",
        fontSize: "0.66rem", fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
      }}
    >
      {children}
    </div>
  );
}

/** Uma fileira de pílulas de métrica, com o espaçamento de três linhas. */
function MetricRow({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", marginTop: first ? 0 : "0.35rem" }}>
      {children}
    </div>
  );
}

function ChannelIcons({ platform }: { platform?: string | null }) {
  const key = (platform || "META").toUpperCase();
  if (key === "TIKTOK") {
    return (
      <div style={{ display: "flex", gap: "0.4rem", opacity: 0.5 }} title="TikTok Ads">
        <TikTokIcon size={12} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: "0.4rem", opacity: 0.5 }} title="Meta Ads">
      <FbIcon size={12} />
      <InstaIcon size={12} />
    </div>
  );
}

export function SimilarityCreativeCard({
  creative,
  shareOfSpend,
  isLeader,
  isIgnored,
  platformShort,
}: {
  creative: SimilarityCreative;
  shareOfSpend: number;
  /** A peça que ficou com a maior fatia da verba do grupo. */
  isLeader: boolean;
  /** Fatia irrelevante: o algoritmo praticamente não entregou esta peça. */
  isIgnored: boolean;
  platformShort: string;
}) {
  const [zoomed, setZoomed] = useState(false);
  const previewUrl = creative.imageUrl || "";
  const sharePct = shareOfSpend * 100;

  return (
    <>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } }}
        className={`glass-panel ${styles.card}`}
        style={{
          position: "relative",
          transition: "all 0.3s ease",
          borderColor: isLeader
            ? "rgba(39, 174, 96, 0.45)"
            : isIgnored
              ? "rgba(239, 68, 68, 0.35)"
              : "var(--card-border)",
        }}
      >
        <div
          className={styles.imageWrapper}
          style={{ position: "relative", cursor: previewUrl || creative.videoUrl ? "zoom-in" : "default" }}
          onClick={() => {
            if (previewUrl || creative.videoUrl) setZoomed(true);
          }}
        >
          {/*
            A arte inteira dentro de um quadro 1:1, sem recorte. O fundo é o
            cinza do tema, então a faixa que sobra nas verticais pertence à
            interface em vez de parecer defeito da peça.
          */}
          <div
            style={{
              width: "100%", aspectRatio: "1 / 1", borderRadius: "8px", overflow: "hidden",
              background: "var(--background-main)", border: "1px solid var(--card-border)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            {previewUrl ? (
              <>
                <SafeImage
                  src={previewUrl}
                  alt={creative.adName}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
                {creative.videoUrl && <PlayBadge />}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", color: "var(--muted)" }}>
                <ImageIcon size={26} opacity={0.4} />
                <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>Sem imagem</span>
              </div>
            )}
          </div>

          {isLeader && (
            <OverlayBadge side="right" background="rgba(39, 174, 96, 0.92)">
              SUGOU A VERBA
            </OverlayBadge>
          )}

          {isIgnored && (
            <OverlayBadge side="left" background="rgba(239, 68, 68, 0.92)">
              <Ghost size={11} /> IGNORADO PELO {platformShort}
            </OverlayBadge>
          )}

          {/* A fatia de gasto é a leitura central da página: barra sobre a arte. */}
          <div
            title={`${sharePct.toFixed(1)}% da verba do grupo`}
            style={{
              position: "absolute", bottom: "4px", left: 0, right: 0, height: "4px",
              background: "rgba(0,0,0,0.35)", borderRadius: "100px", overflow: "hidden"
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(sharePct, 100)}%`,
                background: isLeader ? "var(--success)" : isIgnored ? "var(--danger)" : "var(--warning)"
              }}
            />
          </div>
        </div>

        <div className={styles.info}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
            {creative.categoryName ? (
              <span
                style={{
                  display: "inline-flex", alignItems: "center",
                  background: "var(--card-bg)", border: `1px solid ${creative.categoryColor || "var(--card-border)"}`,
                  color: creative.categoryColor || "var(--foreground)",
                  padding: "0.12rem 0.5rem", borderRadius: "100px",
                  fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px"
                }}
              >
                {creative.categoryName}
              </span>
            ) : (
              <span style={{ fontSize: "0.62rem", opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                sem categoria
              </span>
            )}
            {creative.designer && (
              <span style={{ fontSize: "0.62rem", opacity: 0.5, fontWeight: 600 }}>{creative.designer}</span>
            )}
          </div>

          <p
            title={creative.campaignName}
            style={{
              margin: 0, fontSize: "0.6rem", color: "var(--primary)", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
            }}
          >
            {creative.campaignName}
          </p>

          <h4
            title={creative.adName}
            style={{
              margin: "0.2rem 0 0.6rem", fontSize: "0.8rem", lineHeight: 1.35, fontWeight: 600,
              maxHeight: "2.7em", overflow: "hidden", wordBreak: "break-word"
            }}
          >
            {creative.adName}
          </h4>

          <MetricRow first>
            <MetricMiniCard
              label="Fatia de gasto"
              value={`${sharePct.toFixed(1)}%`}
              tone={isLeader ? "good" : isIgnored ? "bad" : "watch"}
              title="Quanto desta verba do grupo o algoritmo entregou nesta peça"
            />
            <MetricMiniCard
              label="Gasto"
              value={formatCurrencyCompact(creative.spend)}
              tone="neutral"
              title={formatCurrencyFull(creative.spend)}
            />
          </MetricRow>

          <MetricRow>
            <MetricMiniCard
              label="CTR"
              value={`${(creative.ctr || 0).toFixed(2)}%`}
              tone="neutral"
              title="Atenção: quanto da entrega virou clique"
            />
            <MetricMiniCard
              label="CPM"
              value={formatCurrencyCompact(creative.cpm || 0)}
              tone="neutral"
              title="Quanto o algoritmo cobra para entregar esta peça"
            />
          </MetricRow>

          <MetricRow>
            <MetricMiniCard
              label="ROAS"
              value={`${(creative.roas || 0).toFixed(2)}x`}
              tone={creative.roas >= 1 ? "good" : creative.roas > 0 ? "watch" : "bad"}
              title="Retorno sobre o investimento da peça"
            />
            <MetricMiniCard
              label="Compras"
              value={String(creative.purchases || 0)}
              tone={creative.purchases > 0 ? "good" : "watch"}
              title="Compras atribuídas à peça"
            />
          </MetricRow>

          <div
            style={{
              marginTop: "0.6rem", paddingTop: "0.45rem", borderTop: "1px solid var(--card-border)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem"
            }}
          >
            <span style={{ fontSize: "0.62rem", opacity: 0.5 }}>
              {creative.frequency ? `Frequência ${creative.frequency.toFixed(2)}` : " "}
            </span>
            <ChannelIcons platform={creative.platform} />
          </div>
        </div>
      </motion.div>

      {zoomed && (
        <MediaLightbox
          imageUrl={creative.imageUrl}
          videoUrl={creative.videoUrl}
          alt={creative.adName}
          onClose={() => setZoomed(false)}
        />
      )}
    </>
  );
}

"use client";

/**
 * A capa de um artigo na grade de insights.
 *
 * Nem todo artigo tem imagem para mostrar, e não é por falta de tentativa:
 * medido sobre os artigos salvos, dois sites recusam robôs com 403, um saiu do
 * ar e um é o Facebook, que bloqueia leitura. Para esses não existe imagem a
 * buscar — a extração já esgotou og:image, twitter:image, itemprop e a primeira
 * imagem do corpo.
 *
 * Então a capa é desenhada. Não um ícone cinza de "imagem ausente", que anuncia
 * o defeito e enfeia a grade, mas uma capa com identidade própria: a cor vem do
 * domínio da fonte, então todo artigo do mesmo site tem a mesma cor, e o nome
 * do domínio aparece no lugar onde a imagem estaria. A grade fica uniforme e o
 * cartão continua dizendo de onde veio o artigo.
 *
 * Vale também para imagem que quebra depois: a URL foi salva um dia e o site
 * pode removê-la. `onError` cai na mesma capa desenhada, em vez de deixar o
 * ícone de imagem partida do navegador.
 */

import React, { useState } from "react";
import { Link2 } from "lucide-react";

interface ArticleCoverProps {
  thumbnailUrl?: string | null;
  sourceUrl?: string | null;
  title: string;
  /** Altura da área de capa. A grade usa proporção, o modal usa altura fixa. */
  height?: string;
  aspectRatio?: string;
}

/** O domínio, sem `www.` — é o que identifica a fonte para quem lê. */
export function sourceDomain(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Um matiz estável a partir do texto.
 *
 * Estável importa: a cor precisa ser sempre a mesma para o mesmo domínio, entre
 * recarregamentos e entre pessoas, senão deixa de ser identidade e vira ruído.
 */
function hueFrom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function ArticleCover({
  thumbnailUrl,
  sourceUrl,
  title,
  height,
  aspectRatio = "16 / 9",
}: ArticleCoverProps) {
  const [failed, setFailed] = useState(false);

  const domain = sourceDomain(sourceUrl);
  const hue = hueFrom(domain || title);

  const box: React.CSSProperties = {
    position: "relative",
    width: "100%",
    ...(height ? { height } : { aspectRatio }),
    overflow: "hidden",
    background: "var(--card-border)",
  };

  if (thumbnailUrl && !failed) {
    return (
      <div style={box}>
        <img
          src={thumbnailUrl}
          alt={title}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  /*
   * Saturação e luminosidade fixas, só o matiz varia: é o que mantém todas as
   * capas desenhadas com o mesmo peso visual na grade. Uma sorteando cor
   * totalmente livre traria capas berrantes ao lado de capas apagadas.
   */
  const base = `hsl(${hue} 62% 34%)`;
  const deep = `hsl(${(hue + 38) % 360} 58% 20%)`;

  return (
    <div
      style={{
        ...box,
        background: `linear-gradient(135deg, ${base} 0%, ${deep} 100%)`,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      {/* Textura diagonal: tira o aspecto de bloco chapado sem competir com o texto. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 14px)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "1rem",
          color: "rgba(255,255,255,0.92)",
          minWidth: 0,
          width: "100%",
        }}
      >
        <Link2 size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
        <span
          style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {domain || "fonte não informada"}
        </span>
      </div>
    </div>
  );
}

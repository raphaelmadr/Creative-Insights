"use client";

import React from "react";

/**
 * As marcas dos produtos de terceiros que o sistema integra.
 *
 * Tudo sai como um mesmo azulejo arredondado na cor da marca: alguns trazem o
 * glifo real (os que dá para desenhar com fidelidade), os demais trazem o
 * monograma. Uniforme de propósito — um logo aproximado, desenhado de memória,
 * fica pior do que uma letra bem posta, e a tela precisa parecer um sistema, não
 * uma colagem.
 */

export type BrandId =
  | "meta"
  | "tiktok"
  | "google"
  | "slack"
  | "cpanel"
  | "gemini"
  | "groq"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "cohere"
  | "huggingface"
  | "tavily";

interface Brand {
  label: string;
  /** Cor institucional, usada no azulejo e na borda da seção. */
  color: string;
  /** Monograma, quando não há glifo. */
  monogram?: string;
  glyph?: (size: number) => React.ReactNode;
  /** Onde obter a credencial — o passo a passo do próprio fornecedor. */
  docsUrl?: string;
  /** O que fazer lá, em uma linha. */
  docsLabel?: string;
}

const FacebookGlyph = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const TikTokGlyph = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
);

/** As quatro barras cruzadas do Slack, cada uma na sua cor. */
const SlackGlyph = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9.5" y="1.5" width="3.4" height="12" rx="1.7" fill="#36C5F0" />
    <rect x="1.5" y="9.5" width="12" height="3.4" rx="1.7" fill="#2EB67D" />
    <rect x="11.1" y="10.5" width="3.4" height="12" rx="1.7" fill="#ECB22E" />
    <rect x="10.5" y="11.1" width="12" height="3.4" rx="1.7" fill="#E01E5A" />
  </svg>
);

const BRANDS: Record<BrandId, Brand> = {
  meta: {
    label: "Meta Ads",
    color: "#1877F2",
    glyph: FacebookGlyph,
    docsUrl: "https://developers.facebook.com/docs/marketing-api/get-started",
    docsLabel: "Como gerar o token da Marketing API",
  },
  tiktok: {
    label: "TikTok Ads",
    // O ciano de acento, e não o preto da marca: em `#010101` o azulejo e o
    // glifo desapareciam no tema escuro.
    color: "#25F4EE",
    glyph: TikTokGlyph,
    docsUrl: "https://business-api.tiktok.com/portal/docs?id=1738373141733378",
    docsLabel: "Como gerar o access token do TikTok Business",
  },
  google: {
    label: "Google OAuth",
    color: "#4285F4",
    monogram: "G",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    docsLabel: "Criar credencial OAuth no Google Cloud",
  },
  slack: {
    label: "Slack",
    // O aubergine é escuro, mas o glifo do Slack é multicolorido e se sustenta.
    color: "#611F69",
    glyph: SlackGlyph,
    docsUrl: "https://api.slack.com/apps",
    docsLabel: "Criar o app e copiar o Bot Token",
  },
  cpanel: {
    label: "cPanel",
    color: "#FF6C2C",
    monogram: "cP",
  },
  gemini: {
    label: "Google Gemini",
    color: "#8E75F8",
    monogram: "G",
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "Gerar chave no Google AI Studio",
  },
  groq: {
    label: "Groq",
    color: "#F55036",
    monogram: "gq",
    docsUrl: "https://console.groq.com/keys",
    docsLabel: "Gerar chave no console da Groq",
  },
  openrouter: {
    label: "OpenRouter",
    color: "#6467F2",
    monogram: "OR",
    docsUrl: "https://openrouter.ai/keys",
    docsLabel: "Gerar chave no OpenRouter",
  },
  openai: {
    label: "OpenAI",
    color: "#10A37F",
    monogram: "AI",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "Gerar chave na plataforma da OpenAI",
  },
  anthropic: {
    label: "Anthropic",
    color: "#D97757",
    monogram: "A",
    docsUrl: "https://console.anthropic.com/settings/keys",
    docsLabel: "Gerar chave no console da Anthropic",
  },
  cohere: {
    label: "Cohere",
    // Mesma razão do TikTok: o verde escuro da marca não sobrevive no escuro.
    color: "#FF7759",
    monogram: "co",
    docsUrl: "https://dashboard.cohere.com/api-keys",
    docsLabel: "Gerar chave no painel da Cohere",
  },
  huggingface: {
    label: "Hugging Face",
    color: "#FFB000",
    monogram: "HF",
    docsUrl: "https://huggingface.co/settings/tokens",
    docsLabel: "Gerar access token no Hugging Face",
  },
  tavily: {
    label: "Tavily",
    color: "#3B82F6",
    monogram: "tv",
    docsUrl: "https://app.tavily.com/home",
    docsLabel: "Gerar chave no painel da Tavily",
  },
};

export function brandOf(id: BrandId): Brand {
  return BRANDS[id];
}

/**
 * A cor da marca com transparência.
 *
 * Calculada aqui em vez de `color-mix()` no CSS: a função só existe em
 * navegadores recentes, e onde ela falha a declaração inteira é descartada — o
 * azulejo ficaria sem fundo nem borda, sem aviso nenhum.
 */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  const value = Number.parseInt(full, 16);

  if (Number.isNaN(value) || full.length !== 6) return `rgba(128, 128, 128, ${alpha})`;

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** O azulejo da marca. `size` é o lado do quadrado. */
export function BrandIcon({ id, size = 34 }: { id: BrandId; size?: number }) {
  const brand = BRANDS[id];
  const glyphSize = Math.round(size * 0.58);

  return (
    <span
      aria-hidden="true"
      title={brand.label}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: Math.round(size * 0.28),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // O azulejo é a cor da marca lavada, com a borda na cor cheia: legível
        // nos dois temas sem precisar de variante por tema.
        background: withAlpha(brand.color, 0.14),
        border: `1px solid ${withAlpha(brand.color, 0.38)}`,
        color: brand.color,
        fontWeight: 800,
        fontSize: Math.round(size * (brand.monogram && brand.monogram.length > 1 ? 0.32 : 0.44)),
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      {brand.glyph ? brand.glyph(glyphSize) : brand.monogram}
    </span>
  );
}

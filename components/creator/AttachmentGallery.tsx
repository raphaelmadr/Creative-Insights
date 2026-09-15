"use client";

import React, { useState } from "react";
import { Paperclip, ChevronLeft, ChevronRight } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { MediaLightbox } from "@/components/CreativeCardPrimitives";
import { formatBytes, type CardAttachment } from "@/lib/attachments";

/**
 * As referências de um card, e o popup que as abre.
 *
 * O popup é o `MediaLightbox` dos criativos — o mesmo que abre a arte de um
 * anúncio na Home, com o mesmo fundo escurecido, o mesmo botão de fechar e o
 * mesmo Esc. Um segundo visualizador de imagem na plataforma seria a mesma
 * função com dois comportamentos, e o segundo esqueceria de travar a rolagem de
 * trás — foi exatamente o que aconteceu antes com os popups de análise.
 *
 * Dois formatos, uma lógica: no painel do card as referências aparecem como
 * miniaturas; no quadro, como um mini-badge de clipe, porque um cartão de 300px
 * não comporta miniatura sem empurrar o resto para fora da tela.
 */
export default function AttachmentGallery({
  attachments,
  variant = "thumbs",
}: {
  attachments: CardAttachment[];
  variant?: "thumbs" | "badge";
}) {
  const [aberto, setAberto] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  const atual = aberto !== null ? attachments[aberto] : null;
  const anterior = () => setAberto((i) => (i === null ? null : (i - 1 + attachments.length) % attachments.length));
  const proximo = () => setAberto((i) => (i === null ? null : (i + 1) % attachments.length));

  const setaStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
  };

  return (
    <>
      {variant === "badge" ? (
        <button
          type="button"
          className="card-badge"
          title={`${attachments.length} referência(s) anexada(s)`}
          aria-label={`Abrir ${attachments.length} referência(s)`}
          /*
           * O clique não pode subir: o card inteiro é um botão que abre o painel
           * da demanda, e quem clica no clipe quer ver a imagem, não o briefing.
           * O arrasto pelo cartão continua funcionando porque só o clique é
           * interrompido aqui.
           */
          onClick={(e) => {
            e.stopPropagation();
            setAberto(0);
          }}
          // `font-family` não é herdada por botão: sem isto o número do clipe
          // sairia na fonte do sistema, ao lado de badges que usam a da página.
          style={{ cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
        >
          <Paperclip size={10} />
          {attachments.length}
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {attachments.map((anexo, i) => (
            <button
              key={anexo.url}
              type="button"
              title={`${anexo.name} · ${formatBytes(anexo.size)}`}
              aria-label={`Abrir ${anexo.name}`}
              onClick={() => setAberto(i)}
              style={{
                width: "72px",
                height: "72px",
                padding: 0,
                overflow: "hidden",
                borderRadius: "var(--radius-block)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--surface-sunken-border)",
                cursor: "zoom-in",
              }}
            >
              <SafeImage
                src={anexo.url}
                alt={anexo.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>
      )}

      {atual && (
        <MediaLightbox
          imageUrl={atual.url}
          alt={atual.name}
          onClose={() => setAberto(null)}
        >
          {/* O nome da referência, na mesma caixa sobre o rodapé que o popup de
              criativo usa para o nome do anúncio. */}
          <div
            style={{
              position: "absolute",
              left: "10px",
              right: "10px",
              bottom: "10px",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              background: "rgba(0,0,0,0.62)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: "12px",
              padding: "0.55rem 0.75rem",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                color: "rgba(255,255,255,0.92)",
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                lineHeight: 1.35,
                wordBreak: "break-all",
                maxHeight: "2.7em",
                overflow: "hidden",
              }}
            >
              {atual.name}
            </span>
            {attachments.length > 1 && (
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "var(--text-eyebrow)", flexShrink: 0 }}>
                {(aberto ?? 0) + 1} / {attachments.length}
              </span>
            )}
          </div>

          {attachments.length > 1 && (
            <>
              <button
                type="button"
                className="btn btn-overlay"
                aria-label="Referência anterior"
                onClick={anterior}
                style={{ ...setaStyle, left: "10px" }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="btn btn-overlay"
                aria-label="Próxima referência"
                onClick={proximo}
                style={{ ...setaStyle, right: "10px" }}
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </MediaLightbox>
      )}
    </>
  );
}

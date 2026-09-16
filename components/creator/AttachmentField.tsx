"use client";

import React, { useRef, useState } from "react";
import { Paperclip, X, Loader2 } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  MAX_ATTACHMENTS,
  formatBytes,
  type CardAttachment,
} from "@/lib/attachments";

/**
 * O campo de referências — sobe o arquivo e devolve a lista.
 *
 * O upload acontece aqui, e não junto com o envio do card, de propósito: um
 * anexo de 4 MB dentro do mesmo POST que cria a demanda faria o botão "Enviar ao
 * Kanban" ficar pensando por vários segundos sem dizer em que ponto está — e uma
 * falha de rede levaria junto a copy que a pessoa acabou de revisar. Subindo
 * antes, o que chega ao card é uma URL, e a criação continua instantânea.
 *
 * O arquivo removido daqui continua no servidor: apagar exigiria uma rota de
 * exclusão no handler do cPanel, que hoje só sabe receber. Um anexo órfão de
 * alguns KB é mais barato do que publicar uma rota capaz de apagar arquivos.
 */
export default function AttachmentField({
  attachments,
  onChange,
  disabled = false,
}: {
  attachments: CardAttachment[];
  onChange: (list: CardAttachment[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const cheio = attachments.length >= MAX_ATTACHMENTS;

  const enviar = async (files: FileList) => {
    setErro(null);

    // Um por vez, e não em paralelo: o mesmo host já recusou envios simultâneos
    // durante o sync de mídia, e três referências não valem uma fila de espera.
    const aceitos: CardAttachment[] = [];
    const escolhidos = Array.from(files).slice(0, MAX_ATTACHMENTS - attachments.length);

    for (const file of escolhidos) {
      setEnviando(file.name);
      try {
        const body = new FormData();
        body.append("file", file);

        const res = await fetch("/api/creator/attachments", { method: "POST", body });
        const data = await res.json();

        if (!res.ok) {
          setErro(data.error || `Não foi possível subir "${file.name}".`);
          break;
        }
        aceitos.push(data.attachment);
      } catch {
        setErro("Falha de conexão ao subir o arquivo.");
        break;
      }
    }

    setEnviando(null);
    if (aceitos.length) onChange([...attachments, ...aceitos]);

    // Sem isto, escolher o mesmo arquivo de novo depois de removê-lo não
    // dispara `change` — o valor do campo não mudou.
    if (input.current) input.current.value = "";
  };

  return (
    <div className="field">
      <label className="field-label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <Paperclip size={14} />
        Referências
      </label>

      {attachments.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {attachments.map((anexo) => (
            <span
              key={anexo.url}
              title={`${anexo.name} · ${formatBytes(anexo.size)}`}
              style={{
                position: "relative",
                width: "72px",
                height: "72px",
                borderRadius: "var(--radius-block)",
                overflow: "hidden",
                background: "var(--surface-sunken)",
                border: "1px solid var(--surface-sunken-border)",
              }}
            >
              <SafeImage
                src={anexo.url}
                alt={anexo.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <button
                type="button"
                className="btn btn-close btn-close-float btn-overlay"
                title={`Remover "${anexo.name}"`}
                aria-label={`Remover ${anexo.name}`}
                onClick={() => onChange(attachments.filter((a) => a.url !== anexo.url))}
                style={{ top: "4px", right: "4px", width: "20px", height: "20px" }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) enviar(e.target.files);
        }}
      />

      <button
        type="button"
        className="btn btn-secondary"
        disabled={disabled || cheio || !!enviando}
        onClick={() => input.current?.click()}
        title={cheio ? `O limite é de ${MAX_ATTACHMENTS} referências` : "Subir uma imagem de referência"}
        style={{ alignSelf: "flex-start" }}
      >
        {enviando ? <Loader2 size={15} className="spin" /> : <Paperclip size={15} />}
        {enviando ? "Enviando…" : attachments.length ? "Anexar outra" : "Anexar referência"}
      </button>

      <span className="field-hint">
        {enviando
          ? `Subindo "${enviando}".`
          : `Imagem até ${formatBytes(ATTACHMENT_MAX_BYTES)} — o anexo abre em popup no card do quadro.`}
      </span>

      {erro && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {erro}
        </span>
      )}
    </div>
  );
}

"use client";

import React, { useRef, useState } from "react";
import { Upload, Download, ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  RAW_VIDEO_ACCEPT,
  RAW_VIDEO_MAX_BYTES,
  MAX_RAW_VIDEOS,
  formatRawVideoSize,
  isRawVideoType,
  rawVideoDownloadUrl,
  rawVideoViewUrl,
  type RawVideo,
} from "@/lib/raw-videos";
import { enviarVideosBrutos } from "@/lib/drive-upload-client";

/**
 * O campo que aceita as DUAS coisas: um link já existente e o vídeo em si.
 *
 * São duas maneiras de responder a mesma pergunta, e por isso um campo só. O
 * bruto de uma parceria às vezes já está no Drive de quem gravou — aí o que se
 * quer é colar o endereço — e às vezes chega como arquivo no WhatsApp de quem
 * abre a demanda, e aí subir é o único caminho que não passa por baixar,
 * renomear à mão e arrastar para a pasta certa.
 *
 * O envio não aparece sempre: a regra do campo decide (ver `envioLiberado`).
 * É o que faz a caixa de link continuar valendo para toda demanda enquanto o
 * botão de subir vídeo só existe onde ele se aplica.
 *
 * O nome do arquivo NÃO é escolhido aqui. O servidor devolve o nome de cada
 * vídeo junto com a pasta, já pelo padrão de nomenclatura — montar o nome no
 * navegador significaria duas implementações da mesma regra, e a do navegador
 * seria a que ninguém lembra de atualizar.
 */

interface Enviando {
  nome: string;
  pct: number;
}

export default function RawVideoField({
  id,
  label,
  value,
  placeholder,
  hint,
  podeEnviar,
  legendaEnvio,
  cardId,
  fieldKey,
  videos,
  fila,
  onChange,
  onVideos,
  onFila,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  placeholder: string;
  hint: React.ReactNode;
  /** A regra do campo libera o envio para as respostas de agora? */
  podeEnviar: boolean;
  /** O texto miúdo sob o botão, dizendo a quem o envio se aplica. */
  legendaEnvio: string;
  /** Nulo enquanto a demanda não existe — aí os arquivos vão para a fila. */
  cardId: string | null;
  fieldKey: string;
  videos: RawVideo[];
  /** Os arquivos escolhidos antes de a demanda existir. */
  fila?: File[];
  onChange: (v: string) => void;
  onVideos?: (videos: RawVideo[]) => void;
  /**
   * Entrega a fila a quem abre a demanda.
   *
   * O envio só pode acontecer depois da criação — o nome do arquivo leva o
   * MKT-XXXX. Mas a ESCOLHA acontece antes, e é isso que faltava: o campo
   * mostrava só a caixa de link, e quem tinha o vídeo em mãos não via caminho
   * nenhum para ele. Guardando a escolha, o formulário promete e a criação
   * cumpre.
   */
  onFila?: (arquivos: File[]) => void;
}) {
  const [enviando, setEnviando] = useState<Enviando | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const escolher = async (lista: FileList | null) => {
    const arquivos = Array.from(lista ?? []);
    if (!arquivos.length) return;
    setErro(null);

    /*
     * A recusa acontece ANTES de qualquer byte subir.
     *
     * Um vídeo de dois gigabytes recusado no fim do envio é meia hora de rede
     * jogada fora, e a mensagem chegaria quando já não há o que fazer com ela.
     */
    const invalido = arquivos.find((f) => !isRawVideoType(f.type));
    if (invalido) {
      setErro(`"${invalido.name}" não é um vídeo — aceitos: MP4, MOV, M4V e WebM.`);
      return;
    }
    const grande = arquivos.find((f) => f.size > RAW_VIDEO_MAX_BYTES);
    if (grande) {
      setErro(
        `"${grande.name}" tem ${formatRawVideoSize(grande.size)} e o limite é 2 GB. ` +
          "Suba direto no Drive e cole o link acima."
      );
      return;
    }
    if (videos.length + (fila?.length ?? 0) + arquivos.length > MAX_RAW_VIDEOS) {
      setErro(`São no máximo ${MAX_RAW_VIDEOS} vídeos por demanda.`);
      return;
    }

    /*
     * Sem demanda ainda: os arquivos esperam.
     *
     * Subir agora produziria um nome sem o número da demanda, que o padrão de
     * nomenclatura não reconhece — e renomear depois exigiria mover arquivo no
     * Drive. Quem abre a demanda os manda logo depois de criá-la, com o número
     * na mão. Ver `enviarVideosBrutos`.
     */
    if (!cardId) {
      onFila?.([...(fila ?? []), ...arquivos]);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      const { rawVideos, linkDaPasta } = await enviarVideosBrutos({
        cardId,
        fieldKey,
        files: arquivos,
        onProgresso: (nome, pct) => setEnviando({ nome, pct }),
      });
      onVideos?.(rawVideos as RawVideo[]);

      /* O servidor acabou de responder a pergunta com o link da pasta; a caixa
         mostra isso na hora, senão ela ficaria vazia até alguém recarregar o
         quadro — e seria exatamente a tela vazia que este envio veio resolver. */
      if (!value && linkDaPasta) onChange(linkDaPasta);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setEnviando(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="field">
      {label}

      <input
        id={id}
        type="url"
        className="field-input"
        value={value}
        placeholder={placeholder || "https://drive.google.com/…"}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint}

      {podeEnviar && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <input
            ref={inputRef}
            type="file"
            accept={RAW_VIDEO_ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={(e) => escolher(e.target.files)}
          />

          <span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!!enviando}
              onClick={() => inputRef.current?.click()}
            >
              {enviando ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
              {enviando ? `Enviando… ${enviando.pct}%` : "Subir vídeo bruto no Drive"}
            </button>
          </span>

          {/* O texto miúdo que diz a quem isto se aplica — sem ele, o botão
              parece disponível para qualquer demanda. */}
          <span className="field-hint">{legendaEnvio}</span>

          {/*
            Os arquivos escolhidos antes de a demanda existir, à espera.
            
            Dizer que eles sobem "ao abrir a demanda" é o que torna a espera
            compreensível: sem essa frase, a pessoa vê o arquivo listado, não vê
            barra de progresso nenhuma, e conclui que travou.
          */}
          {!cardId && (fila?.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {fila!.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.35rem 0.55rem",
                    borderRadius: "var(--radius-block)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--surface-sunken-border)",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "var(--text-caption)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.name}
                  >
                    {f.name}
                  </span>
                  <span className="field-hint" style={{ flexShrink: 0 }}>
                    {formatRawVideoSize(f.size)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={`Tirar "${f.name}" da fila`}
                    aria-label={`Tirar ${f.name} da fila`}
                    onClick={() => onFila?.(fila!.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <span className="field-hint">
                {fila!.length === 1 ? "Sobe" : "Sobem"} para a pasta de brutos assim que a demanda
                for aberta — o nome do arquivo leva o número dela.
              </span>
            </div>
          )}

          {enviando && (
            <span className="field-hint" style={{ wordBreak: "break-all" }}>
              {enviando.nome}
            </span>
          )}

          {erro && (
            <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
              {erro}
            </span>
          )}
        </div>
      )}

    </div>
  );
}

/**
 * Os vídeos já no Drive, listados como anexos.
 *
 * Desenhada na SEÇÃO DE ANEXOS do card, e não dentro do campo que os subiu:
 * quem abre a demanda para ver o que ela tem procura os arquivos junto dos
 * outros arquivos, não no meio do formulário. O campo fica com o que é dele —
 * a caixa de link e o botão de subir.
 *
 * Baixar não abre guia: o endereço é o da nossa rota, que devolve os bytes com
 * `Content-Disposition: attachment` — ver `rawVideoDownloadUrl`. O link de
 * abrir continua existindo ao lado, porque às vezes o que se quer é ver o vídeo
 * sem baixar meio gigabyte.
 */
export function RawVideoList({
  videos,
  onVideos,
  cardId,
}: {
  videos: RawVideo[];
  onVideos?: (videos: RawVideo[]) => void;
  cardId: string | null;
}) {
  const [removendo, setRemovendo] = useState<string | null>(null);

  const remover = async (video: RawVideo) => {
    if (!cardId || !onVideos) return;
    if (
      !confirm(
        `Tirar "${video.name}" desta demanda?\n\nO arquivo continua no Drive — só deixa de aparecer aqui.`
      )
    ) {
      return;
    }
    setRemovendo(video.fileId);
    try {
      const res = await fetch("/api/creator/cards/raw-video/complete", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, remover: video.fileId }),
      });
      const data = await res.json();
      if (res.ok) onVideos(data.rawVideos ?? []);
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
      {videos.map((video) => (
        <div
          key={video.fileId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.45rem 0.6rem",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <span
              style={{
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={video.name}
            >
              {video.name}
            </span>
            {video.size > 0 && (
              <span className="field-hint">{formatRawVideoSize(video.size)}</span>
            )}
          </div>

          {/*
            `download` no anchor não basta sozinho quando a resposta vem de
            outra origem — por isso a rota manda o cabeçalho. Os dois juntos
            cobrem o navegador que respeita um e o que respeita o outro.
          */}
          <a
            className="btn btn-icon"
            href={rawVideoDownloadUrl(video.fileId)}
            download={video.name}
            title={`Baixar "${video.name}"`}
            aria-label={`Baixar ${video.name}`}
          >
            <Download size={15} />
          </a>

          <a
            className="btn btn-icon"
            href={rawVideoViewUrl(video.fileId)}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir no Drive"
            aria-label={`Abrir ${video.name} no Drive`}
          >
            <ExternalLink size={15} />
          </a>

          {onVideos && cardId && (
            <button
              type="button"
              className="btn btn-icon"
              disabled={removendo === video.fileId}
              title={`Tirar "${video.name}" da demanda`}
              aria-label={`Tirar ${video.name} da demanda`}
              onClick={() => remover(video)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

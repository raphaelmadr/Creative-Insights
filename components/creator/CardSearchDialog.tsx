"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, Archive, Wand2, Paperclip, Link2, Clock, Loader2, Columns3, PackageCheck } from "lucide-react";
import Modal from "@/components/Modal";
import { Skeleton } from "@/components/Skeleton";
import { type CardData } from "./CardDialog";
import { formatCardCode, parseAssignees, PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from "@/lib/kanban";
import { parseAttachments } from "@/lib/attachments";
import { describeCardLink } from "@/lib/card-link";

/**
 * Procurar uma demanda pelo que se lembra dela.
 *
 * O quadro mostra o que está em jogo e o arquivo mostra o que saiu, e nenhum
 * dos dois responde "onde foi parar aquela demanda do tênis?" — para chegar à
 * resposta era preciso saber de antemão em qual dos dois procurar, que é
 * justamente o que não se sabe. Aqui os dois são varridos de uma vez, e cada
 * resultado diz em que etapa a demanda está.
 *
 * A varredura é do servidor, e não um filtro sobre o que a tela já carregou: o
 * arquivo só chega quando alguém abre o arquivo, e boa parte do texto que se
 * procura — o briefing, a copy gerada, as respostas do formulário — nem
 * aparece na frente do card. Ver o `q` em `app/api/creator/cards/route.ts`.
 *
 * É montado só quando abre — `{showSearch && <CardSearchDialog …>}` no quadro,
 * em vez do `open` que os outros diálogos recebem. Assim cada abertura começa
 * limpa por construção: sem isso seria preciso zerar campo, resultados e erro
 * num efeito de abertura, e reencontrar a consulta anterior parece memória
 * útil até a pessoa vir procurar outra coisa.
 */

/** O que a busca devolve: o card de sempre, mais a etapa onde ele está. */
export type CardSearchHit = CardData & {
  column?: { id: string; name: string } | null;
};

/** O tempo entre a última tecla e a ida ao banco. */
const DEBOUNCE_MS = 300;

/** Abaixo disto a busca não sai: duas letras trazem meio quadro. */
const MIN_TERMO = 2;

/** O teto que a rota aplica. Repetido aqui só para avisar quando se encosta nele. */
const TETO = 60;

export default function CardSearchDialog({
  onClose,
  boardId,
  onOpenCard,
}: {
  onClose: () => void;
  boardId: string;
  onOpenCard: (card: CardData) => void;
}) {
  const [termo, setTermo] = useState("");
  const [hits, setHits] = useState<CardSearchHit[]>([]);
  /** O termo que produziu `hits`. Nulo antes da primeira resposta. */
  const [resultadoDe, setResultadoDe] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * O que se mostra é DERIVADO do que está escrito, e não uma terceira cópia
   * guardada em estado.
   *
   * Apagar o campo tinha que limpar a lista, e limpá-la dentro do efeito da
   * digitação criava renderização em cascata — um `setState` que dispara outro
   * render que dispara o efeito de novo. Comparando o termo com o termo que
   * produziu os resultados, a lista some sozinha no instante em que o campo
   * muda, sem ninguém precisar apagá-la.
   */
  const termoLimpo = termo.trim();
  const curto = termoLimpo.length < MIN_TERMO;
  const achados = curto ? [] : hits;
  const jaBuscou = !curto && resultadoDe === termoLimpo;

  /* O `Modal` leva o foco ao primeiro elemento do painel, que é o "X" do
     cabeçalho. Aqui o ponto da tela é o campo: quem abriu veio digitar. O
     quadro de tempo espera o diálogo montar — focar antes não pega nada. */
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const buscar = useCallback(
    async (q: string, signal: AbortSignal) => {
      setBuscando(true);
      try {
        const res = await fetch(
          `/api/creator/cards?boardId=${encodeURIComponent(boardId)}&q=${encodeURIComponent(q)}`,
          { signal }
        );
        const data = await res.json();
        if (signal.aborted) return;

        if (!res.ok) {
          setError(data.error || "A busca não respondeu.");
          setHits([]);
        } else {
          setHits(data.cards || []);
          setError(null);
        }
        setResultadoDe(q);
      } catch (e) {
        // Cancelamento é o fluxo normal — a pessoa continuou digitando.
        if ((e as Error)?.name === "AbortError") return;
        setError("Falha de conexão na busca.");
        setHits([]);
        setResultadoDe(q);
      } finally {
        /* Sem condição: se esta busca foi cancelada, quem cancelou já agendou
           a próxima, e é ela que volta a ligar o indicador. */
        setBuscando(false);
      }
    },
    [boardId]
  );

  /*
   * Uma busca por pausa na digitação, e a anterior cancelada.
   *
   * Sem o `abort`, "tênis" dispara seis consultas e a resposta da terceira
   * pode chegar depois da sexta — a tela mostraria o resultado de "tên" com
   * "tênis" escrito no campo.
   */
  useEffect(() => {
    const q = termo.trim();
    if (q.length < MIN_TERMO) return;

    const controller = new AbortController();
    const t = setTimeout(() => buscar(q, controller.signal), DEBOUNCE_MS);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [termo, buscar]);

  const quando = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  const ativos = achados.filter((c) => !c.archived).length;
  const arquivados = achados.length - ativos;

  const vazio = (texto: string) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        padding: "2rem 1rem",
        color: "var(--muted)",
        fontSize: "var(--text-control)",
        textAlign: "center",
      }}
    >
      <Search size={26} />
      {texto}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Procurar demanda"
      description="No quadro e no arquivo ao mesmo tempo. Busca por título, número, briefing, copy, respostas do formulário e responsável."
      width="min(720px, 100%)"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search
          size={15}
          aria-hidden="true"
          style={{ position: "absolute", left: "0.7rem", color: "var(--muted)", pointerEvents: "none" }}
        />
        <input
          ref={inputRef}
          className="field-input"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Título, MKT-42, um trecho do briefing, um e-mail…"
          aria-label="Termo da busca"
          style={{ width: "100%", paddingLeft: "2.1rem", paddingRight: "2.1rem" }}
        />
        {buscando && (
          <Loader2
            size={15}
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "0.7rem",
              color: "var(--muted)",
              animation: "spin 1s linear infinite",
            }}
          />
        )}
      </div>

      {/* O placar do que voltou. Dizer quantos saíram do quadro evita a
          conclusão errada de quem vê um resultado e depois não o acha no
          Kanban. */}
      {jaBuscou && achados.length > 0 && (
        <span className="field-hint">
          {ativos > 0 && `${ativos} no quadro`}
          {ativos > 0 && arquivados > 0 && " · "}
          {arquivados > 0 && `${arquivados} no arquivo`}
        </span>
      )}

      {curto ? (
        vazio(`Escreva ao menos ${MIN_TERMO} letras.`)
      ) : !jaBuscou ? (
        [0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            height="58px"
            borderRadius="var(--radius-block)"
            style={{ background: "var(--surface-sunken)" }}
          />
        ))
      ) : achados.length === 0 ? (
        vazio(`Nada com “${termoLimpo}” — nem no quadro, nem no arquivo.`)
      ) : (
        achados.map((card) => {
          const anexos = parseAttachments(card.attachments);
          const link = describeCardLink(card.linkUrl);
          const priority = (card.priority as Priority) || "MEDIA";
          const numero = formatCardCode(card.code);
          const responsaveis = parseAssignees(card.assignees);

          return (
            <button
              key={card.id}
              type="button"
              title="Abrir a demanda"
              onClick={() => onOpenCard(card)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                alignItems: "flex-start",
                textAlign: "left",
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: "var(--radius-block)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--surface-sunken-border)",
                borderLeft: `3px solid ${PRIORITY_COLOR[priority]}`,
                cursor: "pointer",
                fontFamily: "inherit",
                color: "inherit",
                /* Arquivada continua clicável e continua legível — só não
                   disputa atenção com o que ainda está em jogo. */
                opacity: card.archived ? 0.75 : 1,
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-control)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  maxWidth: "100%",
                }}
              >
                {card.origin === "COPY" && (
                  <Wand2 size={12} color="var(--primary)" style={{ flexShrink: 0 }} />
                )}
                {numero && (
                  <span style={{ color: "var(--muted)", fontWeight: 600, flexShrink: 0 }}>{numero}</span>
                )}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {card.title}
                </span>
              </span>

              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
                {/* Onde a demanda está — a etapa, ou o arquivo. É o que a
                    pessoa veio descobrir, e por isso vem primeiro. */}
                {card.archived ? (
                  <span className="card-badge" title="Fora do quadro">
                    <Archive size={10} />
                    arquivo · saiu {quando(card.updatedAt)}
                  </span>
                ) : (
                  <span
                    className="card-badge"
                    style={{ fontWeight: 600 }}
                    title="Etapa onde a demanda está agora"
                  >
                    <Columns3 size={10} />
                    {card.column?.name ?? "no quadro"}
                  </span>
                )}

                {card.completedAt && (
                  <span className="card-badge" title="Entregue em">
                    <Clock size={10} />
                    entregue {quando(card.completedAt)}
                  </span>
                )}

                {responsaveis.length > 0 && (
                  <span className="card-badge" style={{ fontWeight: 600 }} title={responsaveis.join(", ")}>
                    {responsaveis.map((e) => e.split("@")[0]).join(", ")}
                  </span>
                )}

                {link && (
                  <span className="card-badge">
                    <Link2 size={10} />
                    {link.isDrive ? "Drive" : link.label}
                  </span>
                )}
                {card.deliveryUrl && (
                  <span className="card-badge" style={{ color: "var(--primary)", fontWeight: 600 }} title="Esta demanda já tem entrega registrada">
                    <PackageCheck size={10} />
                    entrega
                  </span>
                )}

                {anexos.length > 0 && (
                  <span className="card-badge">
                    <Paperclip size={10} />
                    {anexos.length}
                  </span>
                )}

                <span className="card-badge" style={{ color: PRIORITY_COLOR[priority], fontWeight: 600 }}>
                  {PRIORITY_LABEL[priority]}
                </span>
              </span>
            </button>
          );
        })
      )}

      {achados.length >= TETO && (
        <span className="field-hint">
          Mostrando os {TETO} primeiros. Um termo mais específico estreita a lista.
        </span>
      )}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

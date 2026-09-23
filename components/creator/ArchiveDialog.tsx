"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Wand2, Paperclip, Link2, Clock, Trash2, PackageCheck } from "lucide-react";
import Modal from "@/components/Modal";
import { Skeleton } from "@/components/Skeleton";
import { type CardData } from "./CardDialog";
import { parseAssignees } from "@/lib/kanban";
import { parseAttachments } from "@/lib/attachments";
import { describeCardLink } from "@/lib/card-link";
import { PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from "@/lib/kanban";

/**
 * O arquivo do quadro.
 *
 * Existe porque o quadro passou a esvaziar sozinho: a entrega fica o mês em que
 * aconteceu e some quando o mês vira. Some da tela — nunca do banco —, e sem um
 * lugar para consultá-la, "some" e "foi apagada" seriam a mesma coisa para quem
 * olha. Vale também para o arquivamento à mão, que já era invisível antes disto.
 *
 * A lista é de reconhecimento, não de leitura: título, quando saiu, prazo, dono
 * e os sinais de que há copy, referências e link dentro. O conteúdo inteiro se
 * vê abrindo o card — no mesmo painel de sempre, que sabe se apresentar em
 * modo somente-leitura.
 */
export default function ArchiveDialog({
  open,
  onClose,
  boardId,
  onOpenCard,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  onOpenCard: (card: CardData) => void;
  onChanged: () => void;
}) {
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** "2026-09", ou "" para o arquivo inteiro. */
  const [mes, setMes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/creator/cards?boardId=${boardId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível ler o arquivo.");
        return;
      }
      setCards(data.cards || []);
      setError(null);
    } catch {
      setError("Falha de conexão ao ler o arquivo.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  // Buscado a cada abertura, e não uma vez só: entre uma consulta e outra o mês
  // pode ter virado, e a lista guardada estaria faltando justamente o que a
  // pessoa veio procurar.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restaurar = async (card: CardData) => {
    setBusy(card.id);
    setError(null);
    try {
      const res = await fetch("/api/creator/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: { cardId: card.id } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível restaurar.");
        return;
      }
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      onChanged();
    } catch {
      setError("Falha de conexão ao restaurar.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Apaga o arquivo inteiro, sem volta.
   *
   * A confirmação diz o número e diz o que vai junto — briefing, copy, anexos e
   * histórico. "Tem certeza?" não informa nada: a pessoa que clicou por engano
   * também tem certeza de que clicou.
   *
   * O servidor confere de novo que só administrador pode, e é lá que mora o
   * filtro de "apenas arquivados". Esta tela não manda apagar nada além do
   * quadro que está aberto.
   */
  /**
   * Apaga o que está À VISTA — o arquivo inteiro, ou só o mês filtrado.
   *
   * Segue o filtro de propósito: um botão que diz "esvaziar" enquanto a tela
   * mostra três de quarenta demandas apagaria trinta e sete que a pessoa não
   * estava vendo. O texto da confirmação nomeia o alcance.
   */
  const apagar = async (alvos: CardData[], escopo: string) => {
    if (
      !confirm(
        `Apagar em definitivo ${escopo}?\n\n` +
          `Briefing, copy, anexos e histórico vão junto. Não há como desfazer, ` +
          `e não há cópia em outro lugar.`
      )
    ) {
      return;
    }

    const ids = alvos.map((c) => c.id);
    setBusy(alvos.length === 1 ? ids[0] : "lote");
    setError(null);
    try {
      const res = await fetch("/api/creator/cards/purge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        /* A lista vai mesmo quando é o arquivo inteiro: o que a tela mostra é o
           que ela carregou (as 200 mais recentes), e mandar "apague tudo"
           alcançaria o que ela nunca exibiu. */
        body: JSON.stringify({ boardId, cardIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível apagar.");
        return;
      }
      const apagados = new Set(ids);
      setCards((prev) => prev.filter((c) => !apagados.has(c.id)));
      onChanged();
    } catch {
      setError("Falha de conexão ao apagar.");
    } finally {
      setBusy(null);
    }
  };

  const quando = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  /*
   * O mês de uma demanda arquivada é o da ENTREGA, e só na falta dele o da
   * saída do quadro.
   *
   * É como a equipe pergunta — "as entregas de agosto" —, e as duas datas quase
   * sempre caem no mesmo mês, porque a entrega sai do quadro na virada. Elas
   * divergem justamente no caso que interessa: a entrega do dia 31, arquivada
   * no dia 1º, pertence ao mês em que foi feita.
   *
   * Sem carimbo de entrega vale a saída do quadro — é o arquivamento à mão, e
   * "quando saiu" é a única data que ele tem.
   */
  const mesDoCard = (card: CardData) => {
    const d = new Date(card.completedAt ?? card.updatedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const rotuloDoMes = (chave: string) => {
    const [ano, m] = chave.split("-").map(Number);
    return new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  /* Os meses que EXISTEM no arquivo, do mais recente para o mais antigo — uma
     lista fixa de doze meses ofereceria filtros que não filtram nada. */
  const meses = Array.from(
    cards.reduce((acc, c) => {
      const chave = mesDoCard(c);
      acc.set(chave, (acc.get(chave) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).sort((a, b) => b[0].localeCompare(a[0]));

  const visiveis = mes ? cards.filter((c) => mesDoCard(c) === mes) : cards;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Arquivo do quadro"
      description="Tudo que saiu do quadro — arquivado à mão ou pela virada do mês. Nada foi apagado."
      width="min(720px, 100%)"
      footer={
        <>
          {/*
            Fica à esquerda, longe do botão de fechar, e só existe quando há o
            que apagar. Um botão vermelho encostado no "Fechar" cobra atenção
            justamente de quem só queria sair da tela.
          */}
          {visiveis.length > 0 && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                apagar(
                  visiveis,
                  mes
                    ? `as ${visiveis.length} demanda(s) de ${rotuloDoMes(mes)}`
                    : `${visiveis.length} demanda(s) do arquivo`
                )
              }
              disabled={busy !== null}
              style={{ marginRight: "auto" }}
              title={
                mes
                  ? `Apagar em definitivo o que está arquivado em ${rotuloDoMes(mes)}`
                  : "Apagar em definitivo tudo o que está no arquivo"
              }
            >
              <Trash2 size={14} />
              {busy === "lote"
                ? "Apagando…"
                : mes
                  ? `Apagar ${rotuloDoMes(mes)}`
                  : "Esvaziar arquivo"}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy !== null}>
            Fechar
          </button>
        </>
      }
    >
      {/*
        O filtro aparece sempre que há arquivo, mesmo com um mês só.
        
        Com um mês, ele decide pouco — mas INFORMA: diz de quando é o que está
        guardado, sem obrigar a ler a data de cada linha. E o botão de apagar
        segue esta escolha, então esconder o seletor esconderia também a única
        forma de apagar um mês inteiro de uma vez.
      */}
      {!loading && meses.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="arquivo-mes">
            Mês
          </label>
          <select
            id="arquivo-mes"
            className="field-input"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          >
            <option value="">Todos os meses ({cards.length})</option>
            {meses.map(([chave, quantas]) => (
              <option key={chave} value={chave}>
                {rotuloDoMes(chave)} ({quantas})
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        [0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            height="58px"
            borderRadius="var(--radius-block)"
            style={{ background: "var(--surface-sunken)" }}
          />
        ))
      ) : visiveis.length === 0 ? (
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
          <Archive size={26} />
          {mes ? `Nada arquivado em ${rotuloDoMes(mes)}.` : "Nada no arquivo ainda."}
        </div>
      ) : (
        visiveis.map((card) => {
          const anexos = parseAttachments(card.attachments);
          const link = describeCardLink(card.linkUrl);
          const priority = (card.priority as Priority) || "MEDIA";

          return (
            <div
              key={card.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.6rem 0.75rem",
                borderRadius: "var(--radius-block)",
                background: "var(--surface-sunken)",
                border: "1px solid var(--surface-sunken-border)",
                borderLeft: `3px solid ${PRIORITY_COLOR[priority]}`,
              }}
            >
              <button
                type="button"
                title="Abrir a demanda arquivada"
                onClick={() => onOpenCard(card)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  alignItems: "flex-start",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  textAlign: "left",
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
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {card.title}
                  </span>
                </span>

                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
                  {/* A última alteração de um card arquivado é o arquivamento —
                      não há escrita depois dele. */}
                  <span className="card-badge" title="Saiu do quadro em">
                    <Archive size={10} />
                    {quando(card.updatedAt)}
                  </span>

                  {card.completedAt && (
                    <span className="card-badge" title="Entregue em">
                      <Clock size={10} />
                      entregue {quando(card.completedAt)}
                    </span>
                  )}

                  {parseAssignees(card.assignees).length > 0 && (
                    /* A parte antes do @, e não o endereço inteiro: o crachá
                       vive numa linha com data e link, e um e-mail corporativo
                       completo empurra os dois para fora dela. */
                    <span
                      className="card-badge"
                      style={{ fontWeight: 600 }}
                      title={parseAssignees(card.assignees).join(", ")}
                    >
                      {parseAssignees(card.assignees)
                        .map((e) => e.split("@")[0])
                        .join(", ")}
                    </span>
                  )}

                  {link && (
                    <span className="card-badge">
                      <Link2 size={10} />
                      {link.isDrive ? "Drive" : link.label}
                    </span>
                  )}

                  {/* Demanda arquivada é justamente onde se procura arte
                      antiga: dizer que ela já tem entrega poupa abrir
                      o card para descobrir. */}
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

              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy === card.id}
                title="Trazer de volta ao quadro"
                onClick={() => restaurar(card)}
                style={{ flexShrink: 0, padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              >
                <ArchiveRestore size={13} />
                Restaurar
              </button>

              {/*
                Apagar uma só — sem ícone e sem texto juntos: a linha já tem o
                botão de restaurar, e dois botões com palavra viram uma escolha
                a mais de ler. O vermelho e a dica dizem o que ele faz.
              */}
              <button
                type="button"
                className="btn btn-icon"
                disabled={busy !== null}
                title={`Apagar "${card.title}" em definitivo`}
                aria-label={`Apagar ${card.title} em definitivo`}
                onClick={() => apagar([card], `a demanda "${card.title}"`)}
                style={{ flexShrink: 0, color: "var(--danger)" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })
      )}

      {cards.length >= 200 && (
        <span className="field-hint">
          O arquivo traz as 200 demandas mais recentes — o filtro de mês procura dentro delas.
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

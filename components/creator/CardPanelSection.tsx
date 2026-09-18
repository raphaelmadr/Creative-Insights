"use client";

import React, { useState } from "react";
import { type FieldDefinition } from "./FieldInput";
import { useRascunho, type SecaoHandle } from "./useRascunho";
import {
  CARD_PANEL_SECTIONS,
  fonteDaSecao,
  type CardPanelKey,
  type FormBuiltinKey,
} from "@/lib/kanban";

/**
 * O que o card mostra ABERTO — a terceira superfície do quadro a virar escolha.
 *
 * As outras duas já eram: o formulário decide o que se pergunta, a frente do
 * card decide o que se lê de relance. O painel era o que sobrava — dez seções
 * cravadas no componente, iguais em todo quadro. Um time que nunca usou o
 * gerador de copy carregava a seção de copy para sempre; um que resolve tudo no
 * Slack, o acompanhamento.
 *
 * A lista segue a regra do módulo inteiro: o formulário é a base. Seção que vive
 * de uma pergunta desligada não aparece aqui, porque não há o que decidir sobre
 * um valor que o quadro deixou de coletar. O que nasce do próprio quadro — a
 * etapa, o responsável, quem abriu — está sempre disponível.
 *
 * Não há prévia, e é de propósito: o painel é uma página inteira, e uma miniatura
 * dele ao lado dos interruptores seria pequena demais para se ler e grande demais
 * para caber. A frente do card tem prévia porque cabe — ver `CardFaceSection`.
 */
const CardPanelSection = React.forwardRef<
  SecaoHandle,
  {
    open: boolean;
    boardId: string;
    panel: CardPanelKey[];
    /** As perguntas de nascença que o quadro faz — é o que filtra esta lista. */
    builtins: FormBuiltinKey[];
    /** As perguntas do quadro: sem nenhuma e sem briefing, o bloco fica vazio. */
    fields: FieldDefinition[];
    onChanged: () => void;
    onSujo?: (sujo: boolean) => void;
  }
>(function CardPanelSection(
  { open, boardId, panel, builtins, fields, onChanged, onSujo },
  ref
) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, panel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Só as seções que ainda têm de onde tirar valor.
   *
   * O interruptor de uma seção sem fonte não mudaria nada no card de amanhã, e
   * a lista existe justamente para dizer o que o card mostra. A decisão gravada
   * dela continua no banco: voltar a fazer a pergunta devolve a linha do jeito
   * que estava.
   */
  const disponiveis = CARD_PANEL_SECTIONS.filter((secao) => {
    const fonte = fonteDaSecao(secao.key);
    return !fonte || builtins.includes(fonte);
  });

  const alternar = (key: CardPanelKey) =>
    setDraft(draft.includes(key) ? draft.filter((k) => k !== key) : [...draft, key]);

  const salvar = async (): Promise<boolean> => {
    if (JSON.stringify(draft) === JSON.stringify(panel)) return true;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: boardId, cardPanel: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");

      adotar(draft);
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* O handle aponta para a versão mais recente de `salvar`. Ver `CardFaceSection`. */
  const salvarRef = React.useRef(salvar);
  salvarRef.current = salvar;

  React.useImperativeHandle(ref, () => ({ sujo, salvar: () => salvarRef.current() }), [sujo]);

  React.useEffect(() => {
    onSujo?.(sujo);
  }, [sujo, onSujo]);

  return (
    <>
      <span className="field-hint">
        O painel que abre ao clicar num card. Desligue o que este quadro não usa — a
        informação continua guardada, apenas sai da tela.
      </span>

      {disponiveis.map((secao) => {
        const ligada = draft.includes(secao.key);
        const editavel = "edita" in secao && secao.edita;

        return (
          <div
            key={secao.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.6rem 0.75rem",
              borderRadius: "var(--radius-block)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--surface-sunken-border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>
                {secao.label}
              </span>
              <span className="field-hint">
                {secao.hint}
                {/*
                  O aviso só aparece no que está prestes a sumir: dizer "daqui
                  também se edita" numa seção ligada é informação sobre o que
                  já está na tela, e quem a lê está olhando para ela.
                */}
                {editavel && !ligada && " Desligada, isto deixa de ser editável pelo card aberto."}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={ligada}
              disabled={busy}
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)", flexShrink: 0 }}
              onClick={() => alternar(secao.key)}
            >
              {ligada ? "No card" : "Oculto"}
            </button>
          </div>
        );
      })}

      {/*
        As respostas somem sozinhas quando não há pergunta nenhuma: o
        interruptor continua ligado e prometendo uma seção que o card nunca
        desenha. Dizer isso aqui evita a leitura de que ele está quebrado.
      */}
      {draft.includes("answers") && fields.length === 0 && (
        <span className="field-hint">
          As respostas estão ligadas, mas este quadro ainda não tem perguntas próprias
          — crie uma em <strong>Formulário</strong> e elas aparecem aqui.
        </span>
      )}

      {sujo && (
        <span className="field-hint">
          Há alterações não salvas. Elas só vão ao quadro no <strong>Salvar alterações</strong>.
        </span>
      )}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </>
  );
});

export default CardPanelSection;

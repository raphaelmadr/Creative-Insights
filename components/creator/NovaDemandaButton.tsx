"use client";

import React, { useState } from "react";
import nextDynamic from "next/dynamic";
import { Check, Loader2, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { formatCardCode, type GroupDefinition } from "@/lib/kanban";
import { type FieldDefinition } from "./FieldInput";

/**
 * A porta de entrada de demandas, em qualquer tela.
 *
 * Existe porque o modo Creator passou a ser restrito e a abertura de demanda
 * não: quem pede a peça — mídia, growth, comercial — não tem mais o board para
 * clicar em "Nova demanda". Sem um botão que viaje com a barra do topo, a
 * plataforma teria fechado o board e a porta junto.
 *
 * O mesmo `DemandDialog` do quadro, e não uma segunda versão do formulário. As
 * perguntas são configuráveis por quadro: uma cópia aqui ficaria para trás no
 * dia em que alguém acrescentasse um campo, e o defeito só apareceria quando
 * uma demanda chegasse sem a informação que o time precisa.
 */

/** Carregado só quando alguém abre. O diálogo puxa DatePicker, FieldInput e o
 *  seletor de link — peso que não se justifica em toda visita a toda página. */
const DemandDialog = nextDynamic(() => import("./DemandDialog"), { ssr: false });

interface FormularioDeDemanda {
  id: string;
  name: string;
  description: string | null;
  groups: GroupDefinition[];
  fields: FieldDefinition[];
}

export default function NovaDemandaButton({
  className = "btn btn-primary",
  style,
  onOpen,
}: {
  className?: string;
  style?: React.CSSProperties;
  /** O menu do celular se fecha quando o diálogo abre por cima dele. */
  onOpen?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [board, setBoard] = useState<FormularioDeDemanda | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O número da demanda recém-aberta — o que a pessoa leva embora. */
  const [pronto, setPronto] = useState<{ code: number | null; title: string } | null>(null);

  const abrir = async () => {
    onOpen?.();
    setPronto(null);
    setAberto(true);

    // O formulário é buscado uma vez por sessão de aba: os campos de um quadro
    // mudam raramente, e recarregá-los a cada abertura poria uma espera entre o
    // clique e o formulário toda vez.
    if (board) return;

    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/demanda");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível carregar o formulário.");
      if (!json.board) throw new Error("Nenhum quadro está recebendo demandas no momento.");
      setBoard(json.board);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const fechar = () => {
    setAberto(false);
    setPronto(null);
  };

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={abrir}
        title="Pedir uma peça para o time de criação"
      >
        <Plus size={15} />
        Nova demanda
      </button>

      {/* A confirmação vem antes do formulário na ordem de decisão: quem acabou
          de enviar precisa ver o número, e não o formulário em branco de novo. */}
      {aberto && pronto ? (
        <Modal
          open
          onClose={fechar}
          title="Demanda recebida"
          footer={
            <button type="button" className="btn btn-primary" onClick={fechar}>
              Fechar
            </button>
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              color: "var(--primary)",
              fontWeight: 700,
              fontSize: "var(--text-cardtitle)",
            }}
          >
            <Check size={20} />
            {formatCardCode(pronto.code) ?? "Demanda aberta"}
          </div>
          <span className="field-hint">
            <strong>{pronto.title}</strong> entrou na fila do time.
            {formatCardCode(pronto.code)
              ? " Guarde esse número para acompanhar."
              : ""}
          </span>
        </Modal>
      ) : aberto && board ? (
        <DemandDialog
          open
          onClose={fechar}
          boardId={board.id}
          boardName={board.name}
          groups={board.groups}
          fields={board.fields}
          onCreated={(card) => setPronto(card)}
        />
      ) : aberto ? (
        <Modal
          open
          onClose={fechar}
          title="Nova demanda"
          footer={
            <button type="button" className="btn btn-secondary" onClick={fechar}>
              Fechar
            </button>
          }
        >
          {carregando ? (
            <span
              className="field-hint"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Loader2 size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} />
              Carregando o formulário…
            </span>
          ) : (
            <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
              {erro}
            </span>
          )}
        </Modal>
      ) : null}
    </>
  );
}

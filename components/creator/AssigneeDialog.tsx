"use client";

import React, { useState } from "react";
import { UserCheck } from "lucide-react";
import Modal from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import type { CreatorOption } from "./DemandDialog";

/**
 * "Quem assume?" — a pergunta que a etapa faz quando exige responsável.
 *
 * Aparece no momento em que o card é solto na etapa, e não como um erro depois
 * do fato. Recusar o movimento com uma mensagem faria a pessoa arrastar de
 * volta, abrir o card, escolher o dono e arrastar de novo — quatro gestos para
 * responder uma pergunta de um clique.
 *
 * A escolha viaja junto com o movimento, numa requisição só: atribuir primeiro e
 * mover depois deixaria, no meio do caminho, um card com dono na etapa errada
 * se a segunda chamada falhasse.
 */
export default function AssigneeDialog({
  open,
  columnName,
  cardTitle,
  creators,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  columnName: string;
  cardTitle: string;
  creators: CreatorOption[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (acronym: string) => void;
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quem assume esta demanda?"
      description={`"${columnName}" só recebe cards com responsável definido.`}
      width="min(520px, 100%)"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!escolhido || busy}
            onClick={() => escolhido && onConfirm(escolhido)}
          >
            <UserCheck size={14} />
            {busy ? "Movendo…" : "Assumir e mover"}
          </button>
        </>
      }
    >
      <span className="field-hint">{cardTitle}</span>

      {creators.length === 0 ? (
        <span className="field-hint">
          Nenhum criador cadastrado. Cadastre a equipe para poder atribuir demandas.
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {creators.map((c) => {
            const ativo = escolhido === c.acronym;
            return (
              <button
                key={c.acronym}
                type="button"
                role="option"
                aria-selected={ativo}
                onClick={() => setEscolhido(c.acronym)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.5rem 0.6rem",
                  borderRadius: "var(--radius-block)",
                  background: ativo ? "var(--primary-glow)" : "var(--surface-sunken)",
                  border: `1px solid ${ativo ? "var(--primary)" : "var(--surface-sunken-border)"}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--foreground)",
                  textAlign: "left",
                }}
              >
                <Avatar name={c.name} src={c.avatarUrl} size="xs" />
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-control)", fontWeight: ativo ? 600 : 400 }}>
                  {c.name}
                </span>
                <span className="acronym-chip">{c.acronym}</span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

"use client";

import React, { useState } from "react";
import { Copy, Check, Link2, RefreshCw, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";

/**
 * O link público de abertura de demandas.
 *
 * Quem tem o link abre demanda sem ter conta — é para colar num canal do Slack,
 * numa assinatura de e-mail ou num aviso interno. Quem preenche informa o
 * próprio e-mail corporativo, e o card diz que veio dali.
 *
 * O código é gerado pelo servidor, nunca escolhido aqui: se a tela pudesse
 * propor o valor, quem manda a requisição proporia o dele, e a porta teria uma
 * senha conhecida. Gerar outro é o desfazer de um vazamento — o anterior morre
 * na mesma escrita, sem tocar no quadro nem nas demandas já abertas.
 */
export default function PublicLinkDialog({
  open,
  onClose,
  boardId,
  token,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** O código atual, ou nulo quando o quadro ainda não tem link. */
  token: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  /*
   * A URL é montada no navegador, e aqui isso é seguro.
   *
   * É o oposto do link do cron, que precisa do domínio de produção vindo do
   * servidor: aquele é colado numa máquina de fora, esta é aberta por quem já
   * está na página. O endereço que ela vê é o endereço certo, por definição.
   */
  const url = token && typeof window !== "undefined"
    ? `${window.location.origin}/demanda/${token}`
    : null;

  const mandar = async (publicLink: "rotate" | "revoke") => {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/creator/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: boardId, publicLink }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      setCopiado(false);
      onChanged();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar. Selecione o endereço e copie à mão.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link público de demandas"
      description="Um endereço que qualquer pessoa da empresa pode abrir para pedir uma peça, sem ter conta no sistema."
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Fechar
        </button>
      }
    >
      {!token ? (
        <>
          <span className="field-hint">
            Este quadro ainda não tem link público. Enquanto não tiver, o endereço não
            existe — não há porta a ser encontrada.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ alignSelf: "flex-start" }}
            onClick={() => mandar("rotate")}
            disabled={busy}
          >
            <Link2 size={14} />
            {busy ? "Gerando…" : "Gerar link público"}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label className="field-label" htmlFor="link-publico">
              Endereço
            </label>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                id="link-publico"
                className="field-input"
                readOnly
                value={url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={copiar}
                title="Copiar o endereço"
                style={{ flexShrink: 0 }}
              >
                {copiado ? <Check size={14} /> : <Copy size={14} />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            <span className="field-hint">
              Quem abrir informa o e-mail corporativo e a demanda entra na etapa de
              entrada, marcada como vinda do link público.
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!confirm("Gerar um link novo invalida o atual na hora. Quem tiver o antigo deixa de conseguir abrir demandas. Continuar?")) return;
                mandar("rotate");
              }}
              disabled={busy}
              title="Invalida o link atual e cria outro"
            >
              <RefreshCw size={14} />
              Gerar novo
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!confirm("Desligar o link fecha a porta para todo mundo. As demandas já abertas continuam no quadro. Continuar?")) return;
                mandar("revoke");
              }}
              disabled={busy}
              title="Fecha a porta — ninguém mais abre demanda por link"
            >
              <Trash2 size={14} />
              Desligar
            </button>
          </div>

          <span className="field-hint">
            Vazou? <strong>Gerar novo</strong> resolve na hora: o endereço antigo passa a
            dizer que o link não existe mais, e as demandas já abertas ficam onde estão.
          </span>
        </>
      )}

      {erro && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {erro}
        </span>
      )}
    </Modal>
  );
}

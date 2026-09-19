"use client";

import React, { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { fetchJson } from "@/lib/fetch-json";
import DatePicker from "@/components/DatePicker";
import CardLinkField from "./CardLinkField";
import FieldInput, { type FieldDefinition } from "./FieldInput";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  parseAssignees,
  type Priority,
  type FormBuiltinKey,
  type GroupDefinition,
} from "@/lib/kanban";

/**
 * Uma pessoa que pode responder por uma demanda.
 *
 * É qualquer usuário cadastrado, e não só quem tem ficha de criador: a esteira
 * passa por mídia paga, conteúdo e revisão, e essas pessoas não desenham peça
 * nenhuma. `Creator` continua sendo o cadastro de quem ASSINA criativos, com a
 * sigla que o `designer-match` usa para ler nome de anúncio — outro assunto.
 *
 * O e-mail é a chave porque já é o que liga sessão, conta Google e a ficha de
 * criador de quem tem uma.
 */
export interface PersonOption {
  email: string;
  name: string;
  avatarUrl?: string | null;
  /** Sigla de criador (`rm`, `ez`...) — só quem tem ficha em `Creator`. Ver `lib/acronyms.ts`. */
  acronym?: string | null;
}

/**
 * O formulário de entrada de uma demanda.
 *
 * Metade dele é fixa — título, briefing, prioridade, prazo, responsável — e
 * metade é desenhada a partir dos campos do quadro. A parte fixa não vira campo
 * definível porque o próprio Kanban depende dela: é com prioridade e prazo que
 * o card se ordena e se destaca, e um campo qualquer chamado "prazo" não diria
 * ao quadro que é dele que sai a data.
 *
 * Fixa, porém, não quer dizer obrigatória: o quadro escolhe quais dessas
 * perguntas faz (`builtins`). Sem essa escolha, um time que já pergunta a data
 * do jeito dele acabava respondendo duas — ver `FORM_BUILTINS`.
 *
 * Título e responsável ficam de fora da escolha, e por motivos diferentes: um
 * card sem título é uma linha em branco no quadro, e sem time a demanda não tem
 * para onde ir.
 */
export default function DemandDialog({
  open,
  onClose,
  boardId,
  boardName,
  groups = [],
  fields,
  builtins,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  /** Os grupos do quadro — cada um é um time, e é neles que a equipe mora. */
  groups?: GroupDefinition[];
  fields: FieldDefinition[];
  /**
   * Quais perguntas de nascença este quadro faz. Ver `parseFormBuiltins`.
   *
   * Sem valor padrão de propósito: um `= DEFAULT_FORM_BUILTINS` aqui faria a
   * tela que esqueceu de passar a configuração perguntar tudo — exatamente o
   * defeito que esta lista existe para corrigir —, e sem erro nenhum a apontá-lo.
   */
  builtins: FormBuiltinKey[];
  /** Recebe o card recém-criado — o quadro recarrega, a barra do topo confirma. */
  onCreated: (card: { code: number | null; title: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIA");
  const [dueDate, setDueDate] = useState("");
  const [groupId, setGroupId] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada abertura começa limpa: sem isto, o rascunho abandonado de uma demanda
  // reaparece dentro da próxima, misturado ao que a pessoa está escrevendo.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("MEDIA");
    setDueDate("");
    setGroupId("");
    setLinkUrl(null);
    setValues({});
    setError(null);
  }, [open]);

  /*
   * O grupo escolhido é a única fonte de responsável neste formulário.
   *
   * Não há mais queda para a "etapa de entrada": ela exibia o nome de uma
   * COLUNA — "Backlog" — num campo que pergunta por um time, e quem abre a
   * demanda não tem como saber que aquilo não é o nome de uma equipe.
   */
  const grupoEscolhido = groups.find((g) => g.id === groupId) ?? null;
  const equipeDoGrupo = parseAssignees(grupoEscolhido?.assignees);

  /** Se este quadro faz esta pergunta de nascença. */
  const pergunta = (key: FormBuiltinKey) => builtins.includes(key);

  const submit = async () => {
    if (!title.trim()) {
      setError("A demanda precisa de um título.");
      return;
    }

    // O time é obrigatório: sem ele a demanda cairia na entrada do quadro, que
    // é uma etapa — e uma etapa não tem equipe para assumir a demanda.
    if (groups.length > 0 && !groupId) {
      setError("Escolha para qual time é esta demanda.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      /*
       * `/api/demanda`, e não `/api/creator/cards`: abrir demanda é de qualquer
       * pessoa autenticada, e este mesmo diálogo é aberto pela barra do topo por
       * quem não tem o board. Uma porta só — ver `lib/demanda-intake.ts`.
       */
      const { ok, data } = await fetchJson<any>("/api/demanda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * Só o que foi perguntado sobe.
         *
         * Os estados das perguntas desligadas continuam no valor inicial, e
         * mandá-los seria gravar uma resposta que ninguém deu — uma prioridade
         * "média" que o formulário não ofereceu, e que o card exibiria como se
         * fosse escolha de quem pediu. A prioridade some inteira, e não vira
         * nula: é ela que pinta a borda do card, e o servidor tem o padrão.
         */
        body: JSON.stringify({
          boardId,
          title,
          description: pergunta("description") ? description : "",
          ...(pergunta("priority") ? { priority } : {}),
          dueDate: (pergunta("dueDate") && dueDate) || null,
          groupId: groupId || null,
          linkUrl: pergunta("linkUrl") ? linkUrl : null,
          values,
        }),
      });

      if (!ok) {
        setError(data?.error || "Não foi possível abrir a demanda.");
        return;
      }

      onCreated(data.card ?? { code: null, title });
      onClose();
    } catch (e) {
      /*
       * A mensagem do erro, e não uma genérica: "falha de conexão" mandaria
       * conferir a internet quando o que houve foi a hospedagem recusando a
       * requisição. `RespostaNaoJson` já vem com a frase certa.
       */
      setError((e as Error)?.message || "Falha de conexão ao abrir a demanda.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova demanda"
      description={`Entra no quadro "${boardName}".`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Enviando…" : "Abrir demanda"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="demanda-titulo">
          Título <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
        </label>
        <input
          id="demanda-titulo"
          className="field-input"
          value={title}
          placeholder="Ex.: Criativo de Black Friday para retargeting"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* "Briefing", e não "Contexto".
          
          Eram dois nomes para a mesma coisa em telas diferentes — o formulário
          pedia contexto, o card mostrava briefing —, e um quadro que criasse a
          própria pergunta de briefing ficava com as duas, sem nada na tela
          dizendo que pediam o mesmo. */}
      {pergunta("description") && (
        <div className="field">
          <label className="field-label" htmlFor="demanda-descricao">
            Briefing
          </label>
          <textarea
            id="demanda-descricao"
            className="field-input field-prose"
            value={description}
            placeholder="O que quem for produzir precisa saber antes de começar."
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      )}

      {pergunta("priority") && (
        <div className="field">
          <span className="field-label">Prioridade</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-toggle"
                aria-pressed={priority === p}
                style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                onClick={() => setPriority(p)}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* `auto-fit` já cuida do prazo desligado: sem ele a grade tem uma coluna
          só, e o seletor de time ocupa a linha inteira em vez de metade dela. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.9rem" }}>
        {pergunta("dueDate") && (
          <div className="field">
            <label className="field-label" htmlFor="demanda-prazo">
              Prazo
            </label>
            <DatePicker
              id="demanda-prazo"
              value={dueDate}
              onChange={setDueDate}
              placeholder="Sem prazo"
            />
          </div>
        )}

        <div className="field">
          {/*
            O rótulo é a PERGUNTA, não o nome do dado.
            
            Dizia "Responsável", e a palavra desencontrava do que o campo faz:
            aqui se escolhe um TIME, e "responsável" no resto do quadro é a
            pessoa que assumiu o card. Quem abria a demanda procurava um nome e
            encontrava uma lista de áreas.
          */}
          <label className="field-label" htmlFor="demanda-grupo">
            Para qual time é esta solicitação?
            <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }} aria-hidden="true">
              *
            </span>
          </label>
          <select
            id="demanda-grupo"
            className="field-input"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {/*
              Só GRUPOS aqui — nunca nomes de etapa.
              
              Quem abre a demanda conhece os times da empresa, não a esteira
              interna deles: "Backlog" é um ponto do fluxo da Criação, e
              oferecê-lo como responsável faz a pessoa procurar um time com esse
              nome. Escolher o grupo põe a demanda na fila daquele time e
              atribui todo mundo que responde por ele.
            */}
            <option value="">Selecione o time</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <span className="field-hint">
            {groups.length === 0
              ? "Este quadro ainda não tem grupos. Crie um em Grupos antes de abrir demandas."
              : !grupoEscolhido
                ? "A demanda entra na fila do time escolhido."
                : equipeDoGrupo.length
                  ? `Entra na fila de "${grupoEscolhido.name}" e ${equipeDoGrupo.length} pessoa(s) do time assumem.`
                  : `"${grupoEscolhido.name}" não tem ninguém marcado: qualquer pessoa pode assumir.`}
          </span>
        </div>
      </div>

      {/* O link pode já existir na abertura — quem pede a peça costuma ter a
          pasta de referência antes de escrever o briefing. */}
      {pergunta("linkUrl") && (
        <CardLinkField
          id="demanda-link"
          value={linkUrl}
          onSave={setLinkUrl}
          busy={saving}
          hint="A pasta do Drive com as imagens, se já existir."
        />
      )}

      {fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={values[field.key]}
          values={values}
          parentLabel={fields.find((f) => f.key === field.dependsOn)?.label}
          onChange={(v) =>
            setValues((prev) => {
              const proximo = { ...prev, [field.key]: v };

              /*
               * Mudar o pai zera os filhos.
               *
               * Sem isto, escolher "Meta Ads", marcar "Carrossel" e depois
               * trocar para "TikTok Ads" deixa "Carrossel" marcado — um valor
               * que o novo canal não aceita, invisível na tela porque a opção
               * nem aparece mais, e que só o servidor recusaria no fim.
               */
              for (const outro of fields) {
                if (outro.dependsOn === field.key) delete proximo[outro.key];
              }
              return proximo;
            })
          }
        />
      ))}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

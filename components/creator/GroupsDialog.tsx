"use client";

import React, { useState } from "react";
import { Plus, Trash2, Layers, Users } from "lucide-react";
import Modal from "@/components/Modal";
import {
  GROUP_COLORS,
  DEFAULT_GROUP_COLOR,
  parseAssignees,
  serializeAssignees,
  type GroupDefinition,
} from "@/lib/kanban";
import { Avatar } from "@/components/Avatar";
import { useRascunho } from "./useRascunho";
import type { PersonOption } from "./DemandDialog";

/**
 * Os grupos do quadro — os times, e as etapas de cada um.
 *
 * Mesma forma do editor de etapas — nome à esquerda, paleta abaixo, lixeira à
 * direita — porque é a mesma operação: uma lista curta de coisas que o time
 * define para si. Um segundo desenho para a mesma tarefa só faria quem já sabe
 * mexer em etapas ter de aprender de novo.
 *
 * Quais etapas entram em cada grupo se decide no editor de etapas, e não aqui:
 * é lá que a pessoa está olhando a etapa quando a pergunta aparece.
 *
 * As edições ficam num rascunho até alguém clicar em Salvar. Gravando a cada
 * clique, marcar duas pessoas seguidas desfazia a primeira — ver `useRascunho`.
 */
export default function GroupsDialog({
  open,
  onClose,
  boardId,
  groups,
  people,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  groups: GroupDefinition[];
  /*
   * Obrigatória, e sem valor padrão de propósito.
   *
   * Com `people = []` a seção de equipe renderizava vazia e em silêncio quando
   * a página esquecia de passá-la — foi exatamente o que aconteceu, e só se
   * descobriu abrindo a tela. Sem padrão, o mesmo esquecimento vira erro de
   * tipo antes de chegar ao navegador.
   */
  people: PersonOption[];
  onChanged: () => void;
}) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, groups);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    const res = await fetch("/api/creator/groups", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível salvar o grupo.");
    return data;
  };

  const mexer = (id: string, mudanca: Partial<GroupDefinition>) =>
    setDraft(draft.map((g) => (g.id === id ? { ...g, ...mudanca } : g)));

  /**
   * Manda ao servidor só os grupos que mudaram.
   *
   * Um PUT por grupo alterado, e não um por campo: o corpo de cada um sai do
   * rascunho, que já tem todas as edições daquele grupo juntas.
   */
  const salvar = async (): Promise<boolean> => {
    const alterados = draft.filter((g) => {
      const original = groups.find((o) => o.id === g.id);
      return original && JSON.stringify(original) !== JSON.stringify(g);
    });

    if (alterados.length === 0) return true;

    const semNome = alterados.find((g) => !g.name.trim());
    if (semNome) {
      setError("Um grupo não pode ficar sem nome.");
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      for (const g of alterados) {
        await send("PUT", {
          id: g.id,
          name: g.name.trim(),
          color: g.color,
          assignees: parseAssignees(g.assignees),
        });
      }
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

  /*
   * Criar e remover são mudanças de estrutura, não de conteúdo, e por isso
   * acontecem na hora — mas nunca por cima de edição pendente. Gravar o que
   * está em aberto ANTES é o que permite adotar a lista nova em seguida sem
   * declarar salvo algo que não foi.
   */
  const criar = async () => {
    const nome = newName.trim();
    if (!nome || !(await salvar())) return;

    setBusy(true);
    setError(null);
    try {
      const { group } = await send("POST", { boardId, name: nome, color: DEFAULT_GROUP_COLOR });
      adotar([...draft, group]);
      setNewName("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remover = async (group: GroupDefinition) => {
    if (
      !confirm(
        `Remover o grupo "${group.name}"?\n\nAs etapas dele continuam no quadro, apenas sem faixa.`
      )
    ) {
      return;
    }
    if (!(await salvar())) return;

    setBusy(true);
    setError(null);
    try {
      await send("DELETE", { id: group.id });
      adotar(draft.filter((g) => g.id !== group.id));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Fechar com alteração pendente avisa — é o que o clique fora da janela faz. */
  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas neste grupo. Fechar e perdê-las?")) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Grupos do quadro"
      description="Os times do quadro. Cada grupo reúne as etapas de um time e vira uma faixa colorida sobre as colunas dela."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={fechar} disabled={busy}>
            {sujo ? "Cancelar" : "Fechar"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              if (await salvar()) onClose();
            }}
            disabled={busy || !sujo}
            title={sujo ? "Gravar as alterações" : "Nada alterado"}
          >
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      {draft.length === 0 && (
        <span className="field-hint">
          Nenhum grupo ainda. Sem grupos, as etapas aparecem soltas, lado a lado.
        </span>
      )}

      {draft.map((group) => (
        <div
          key={group.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            padding: "var(--pad-card)",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            // A borda do bloco já mostra a cor do grupo aplicada — é exatamente
            // o que vai aparecer na faixa, e não uma amostra ao lado dela.
            border: `1px solid ${group.color}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Layers size={15} style={{ color: group.color, flexShrink: 0 }} />
            <input
              className="field-input"
              style={{ flex: 1, minWidth: 0 }}
              /*
               * Controlado pelo rascunho, e não `defaultValue` gravando no
               * `blur`: com o valor solto no DOM, sair da janela sem passar por
               * outro campo levava o texto junto, e não havia como saber, ao
               * olhar a tela, se o que estava escrito ali já contava.
               */
              value={group.name}
              aria-label={`Nome do grupo ${group.name}`}
              onChange={(e) => mexer(group.id, { name: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${group.name}"`}
              aria-label={`Remover ${group.name}`}
              disabled={busy}
              onClick={() => remover(group)}
            >
              <Trash2 size={15} />
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {GROUP_COLORS.map((c) => (
              <button
                key={c.token}
                type="button"
                className="btn btn-toggle"
                aria-pressed={group.color === c.token}
                title={c.label}
                style={{ padding: "0.3rem 0.6rem", fontSize: "var(--text-caption)" }}
                onClick={() => mexer(group.id, { color: c.token })}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "var(--radius-pill)",
                    background: c.token,
                    display: "inline-block",
                  }}
                />
                {c.label}
              </button>
            ))}
          </div>

          {/*
            Quem responde por este grupo.

            Mora aqui, e não no editor de etapas, porque o grupo É o time:
            "Produção" nomeia um conjunto de pessoas tanto quanto um trecho do
            fluxo. Repetir a mesma equipe em cada etapa do grupo era descrever
            três vezes o mesmo fato — e deixar que as três divergissem.
          */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label className="field-label" style={{ margin: 0 }}>
              <Users size={13} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />
              Quem responde por este grupo
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {people.map((pessoa) => {
                const equipe = parseAssignees(group.assignees);
                const email = pessoa.email.toLowerCase();
                const dentro = equipe.includes(email);

                return (
                  <button
                    key={pessoa.email}
                    type="button"
                    className="btn btn-toggle"
                    aria-pressed={dentro}
                    title={
                      dentro
                        ? `Tirar ${pessoa.name} deste grupo`
                        : `${pessoa.name} passa a responder por este grupo`
                    }
                    style={{ padding: "0.25rem 0.55rem", fontSize: "var(--text-caption)", gap: "0.35rem" }}
                    onClick={() =>
                      mexer(group.id, {
                        // A ORDEM importa: quem entra vai para o fim, e o
                        // primeiro da lista é quem assume os cards que chegam
                        // sem dono do time. Ver `resolveStageAssignee`.
                        assignees: serializeAssignees(
                          dentro ? equipe.filter((e) => e !== email) : [...equipe, email]
                        ),
                      })
                    }
                  >
                    <Avatar name={pessoa.name} src={pessoa.avatarUrl} size="xs" />
                    {pessoa.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>

            <span className="field-hint">
              {(() => {
                const equipe = parseAssignees(group.assignees);
                if (equipe.length === 0) {
                  return "Sem ninguém marcado: qualquer pessoa pode assumir as demandas deste grupo.";
                }
                const primeiro =
                  people.find((x) => x.email === equipe[0])?.name.split(" ")[0] ?? equipe[0];
                return `Só estas pessoas assumem demandas deste grupo. Quem move o card assume, se for do time; senão, ${primeiro} assume.`;
              })()}
            </span>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="field-input"
          style={{ flex: 1, minWidth: 0 }}
          value={newName}
          placeholder="Nome do grupo — ex.: Criação, Growth, Mídia"
          aria-label="Nome do novo grupo"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") criar();
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !newName.trim()}
          onClick={criar}
        >
          <Plus size={15} />
          Criar grupo
        </button>
      </div>

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
    </Modal>
  );
}

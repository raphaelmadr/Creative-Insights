"use client";

import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import {  type GroupDefinition } from "@/lib/kanban";
import { useRascunho, type SecaoHandle } from "./useRascunho";

export interface ColumnDefinition {
  id: string;
  name: string;
  color: string | null;
  /** O que acontece nesta etapa — aparece no topo da coluna. */
  description: string | null;
  /** A partir daqui o card precisa de dono. */
  /** JSON de siglas de quem responde por esta etapa. Ver `parseAssignees`. */
  /** Quem assume quando o card chega aqui. */
  /** O grupo a que esta etapa pertence, ou nulo. */
  groupId: string | null;
  isIntake: boolean;
  isDone: boolean;
  /** Libera o painel "Entrega de criativos" dentro do card. Ver `CardDialog`. */
  isProduction: boolean;
  wipLimit: number | null;
  /** Avisa no Slack quando um card entra nesta etapa. */
  notifySlackOnEnter: boolean;
  /** Canal alternativo do aviso. Vazio usa o canal padrão de Configurações › Sistema. */
  slackChannelId: string | null;
  /** Texto customizado do aviso. Vazio usa o formato padrão de entrega. */
  slackMessageTemplate: string | null;
  position: number;
}

/**
 * As etapas do quadro.
 *
 * Três marcas importam: a coluna de **entrada**, onde chega o que é novo pra
 * um grupo, a de **entrega**, que carimba a conclusão do card, e a de
 * **produção**, que libera o painel de subir os arquivos da entrega. Sem elas
 * explícitas, a primeira e a última coluna passariam a ter significado só
 * pela posição — e reordenar o quadro mudaria, sem aviso, onde as demandas
 * caem.
 *
 * Entrada é exclusiva dentro do GRUPO, não do quadro inteiro: cada grupo pode
 * ter a sua. A do grupo mais cedo do quadro é quem recebe demanda nova do
 * formulário e do gerador de copy (`intakeColumnId`). Entrega e produção não
 * são exclusivas nem aqui nem lá: um quadro pode ter mais de uma etapa de
 * conclusão, e mais de uma etapa de produção.
 *
 * O aviso no Slack (`notifySlackOnEnter`) é independente dessas três — cada
 * etapa liga o próprio aviso, com canal e texto opcionais por etapa (ver
 * `lib/slack-delivery.ts`).
 */

/** As cores possíveis para o topo de uma coluna — todas do design system. */
const COLORS = [
  { token: "var(--muted)", label: "Neutro" },
  { token: "var(--info)", label: "Azul" },
  { token: "var(--warning)", label: "Âmbar" },
  { token: "var(--success)", label: "Verde" },
  { token: "var(--danger)", label: "Vermelho" },
];

/**
 * Os dados que a mensagem customizada do Slack pode citar — um botão por
 * placeholder, com um nome que diz o que ele faz, e não o `{{token}}` cru que
 * ele insere. É a resposta para "não entendi o botão marcacoes": o botão não
 * se chama mais isso, e o `title` explica antes de clicar.
 */
const SLACK_PLACEHOLDERS = [
  {
    token: "{{tarefa}}",
    label: "Tarefa",
    title: "Insere o código da tarefa, já como link para ela (ex.: MKT-42).",
  },
  {
    token: "{{responsavel}}",
    label: "Quem entregou",
    title: "Insere o nome de quem estava com a demanda antes desta etapa.",
  },
  {
    token: "{{drive}}",
    label: "Link do Drive",
    title: "Insere o link do Google Drive enviado nesta entrega.",
  },
  {
    token: "{{marcacoes}}",
    label: "Marcar equipe",
    title:
      "Insere a menção (@) de cada pessoa responsável por esta etapa no Slack — a mesma equipe definida no Grupo desta etapa.",
  },
] as const;

const ColumnsSection = React.forwardRef<
  SecaoHandle,
  {
    open: boolean;
    boardId: string;
    columns: ColumnDefinition[];
    /** Os grupos do quadro, para dizer a que faixa cada etapa pertence. */
    groups?: GroupDefinition[];
    onChanged: () => void;
    /**
     * Avisa o diálogo que contém esta seção que há (ou deixou de haver) algo a
     * salvar. O `ref` entrega o `salvar`, mas não serve para isto: mudar uma
     * ref não renderiza ninguém, e o botão de Salvar do pai ficaria eternamente
     * desabilitado enquanto o rascunho daqui já tinha mudado.
     */
    onSujo?: (sujo: boolean) => void;
  }
>(function ColumnsSection({ open, boardId, columns, groups = [], onChanged, onSujo }, ref) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, columns);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Só o nome fica sempre à vista — o resto (descrição, grupo, os
   * alternadores, o aviso no Slack) é o que ocupava a tela toda com um quadro
   * de dez etapas. Estado só de tela, nunca gravado: reabrir o diálogo começa
   * com tudo recolhido de novo.
   */
  const [etapasAbertas, setEtapasAbertas] = useState<Set<string>>(new Set());
  const alternarAberta = (id: string) =>
    setEtapasAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    const res = await fetch("/api/creator/columns", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível salvar a coluna.");
    return data;
  };

  const mexer = (id: string, mudanca: Partial<ColumnDefinition>) => {
    // O grupo da etapa mexida — o novo, se está mudando nesta mesma tacada,
    // senão o que ela já tinha. É contra ELE que a exclusividade se mede.
    const alvo = draft.find((d) => d.id === id);
    const grupoDoAlvo = mudanca.groupId !== undefined ? mudanca.groupId : alvo?.groupId ?? null;

    setDraft(
      draft.map((c) => {
        if (c.id === id) return { ...c, ...mudanca };
        /*
         * Entrada é exclusiva DENTRO DO GRUPO — o servidor desmarca as demais
         * do mesmo grupo ao gravar. O rascunho faz o mesmo na hora, senão a
         * tela mostraria duas entradas marcadas no mesmo grupo até alguém
         * salvar e descobrir qual das duas venceu.
         */
        if (mudanca.isIntake === true && c.groupId === grupoDoAlvo) {
          return { ...c, isIntake: false };
        }
        return c;
      })
    );
  };

  /*
   * Um `<textarea>` por etapa, todas na mesma tela — por isso um Map, e não um
   * único ref: o botão "Marcar equipe" da etapa 3 precisa saber onde é o
   * cursor NA CAIXA DA ETAPA 3, não na primeira que existir.
   */
  const templateRefs = React.useRef(new Map<string, HTMLTextAreaElement>());

  /**
   * Insere o token no ponto onde o cursor estava — ou no final, se o campo
   * nunca ganhou foco. Devolver o cursor pro ponto certo depois pede um
   * `setTimeout`: a caixa é controlada pelo rascunho, e o texto novo só existe
   * no DOM depois que este componente renderizar de novo com o valor mudado.
   */
  const inserirPlaceholder = (columnId: string, token: string) => {
    const el = templateRefs.current.get(columnId);
    const atual = draft.find((c) => c.id === columnId)?.slackMessageTemplate ?? "";
    const inicio = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    const novoValor = `${atual.slice(0, inicio)}${token}${atual.slice(fim)}`;
    const novaPosicao = inicio + token.length;

    mexer(columnId, { slackMessageTemplate: novoValor });

    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(novaPosicao, novaPosicao);
    }, 0);
  };

  /** Um PUT por etapa alterada, com todas as edições dela juntas. */
  const salvar = async (): Promise<boolean> => {
    const alteradas = draft.filter((c) => {
      const original = columns.find((o) => o.id === c.id);
      return original && JSON.stringify(original) !== JSON.stringify(c);
    });

    if (alteradas.length === 0) return true;

    if (alteradas.some((c) => !c.name.trim())) {
      setError("Uma etapa não pode ficar sem nome.");
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      for (const c of alteradas) {
        await send("PUT", {
          id: c.id,
          name: c.name.trim(),
          description: c.description ?? "",
          color: c.color,
          groupId: c.groupId,
          isIntake: c.isIntake,
          isDone: c.isDone,
          isProduction: c.isProduction,
          wipLimit: c.wipLimit,
          notifySlackOnEnter: c.notifySlackOnEnter,
          slackChannelId: c.slackChannelId,
          slackMessageTemplate: c.slackMessageTemplate,
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
   * Criar e remover mudam a estrutura e valem na hora — mas nunca por cima de
   * edição pendente. Gravar o que está em aberto ANTES é o que permite adotar a
   * lista nova em seguida sem declarar salvo algo que não foi.
   */
  const criar = async () => {
    const nome = newName.trim();
    if (!nome || !(await salvar())) return;

    setBusy(true);
    setError(null);
    try {
      const { column } = await send("POST", { boardId, name: nome, color: "var(--muted)" });
      adotar([...draft, column]);
      // Quem acabou de criar quer configurá-la — recolhida, o próximo passo
      // óbvio (grupo, Entrada/Entrega) ficaria escondido atrás de outro clique.
      setEtapasAbertas((atual) => new Set(atual).add(column.id));
      setNewName("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remover = async (column: ColumnDefinition) => {
    if (
      !confirm(
        `Remover a etapa "${column.name}"?\n\nAs demandas que estão nela vão para a primeira etapa do quadro.`
      )
    ) {
      return;
    }
    if (!(await salvar())) return;

    setBusy(true);
    setError(null);
    try {
      await send("DELETE", { id: column.id });
      adotar(draft.filter((c) => c.id !== column.id));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /*
   * O handle aponta para a versão MAIS RECENTE de `salvar`, sem se recriar por
   * causa dela.
   *
   * `salvar` é redefinida a cada renderização e fecha sobre o rascunho daquele
   * instante. Colocá-la nas dependências recriava o handle a cada tecla digitada
   * numa etapa; tirá-la sem o ref congelaria a função na primeira renderização,
   * e o Salvar do diálogo gravaria o rascunho de quando a janela abriu.
   */
  const salvarRef = React.useRef(salvar);
  salvarRef.current = salvar;

  React.useImperativeHandle(ref, () => ({ sujo, salvar: () => salvarRef.current() }), [sujo]);

  React.useEffect(() => {
    onSujo?.(sujo);
  }, [sujo, onSujo]);

  return (
    <>
      {draft.map((column) => {
        const aberta = etapasAbertas.has(column.id);

        return (
        <div
          key={column.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            padding: "var(--pad-card)",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-icon"
              aria-expanded={aberta}
              title={aberta ? `Recolher "${column.name}"` : `Expandir "${column.name}"`}
              aria-label={aberta ? `Recolher ${column.name}` : `Expandir ${column.name}`}
              onClick={() => alternarAberta(column.id)}
            >
              {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            <span
              aria-hidden="true"
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "var(--radius-pill)",
                background: column.color || "var(--muted)",
                flexShrink: 0,
              }}
            />
            <input
              className="field-input"
              style={{ flex: 1, minWidth: 0 }}
              /*
                * Controlado pelo rascunho, e não `defaultValue` gravando no
                * `blur`: com o valor solto no DOM, sair da janela sem passar por
                * outro campo levava o texto junto.
                */
              value={column.name}
              aria-label={`Nome da etapa ${column.name}`}
              onChange={(e) => mexer(column.id, { name: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${column.name}"`}
              aria-label={`Remover ${column.name}`}
              disabled={busy}
              onClick={() => remover(column)}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/*
            Descrição, cor, grupo, os alternadores e o aviso no Slack — tudo
            isso só aparece com a etapa expandida. Recolhida, cada etapa é uma
            linha só; era o que faltava para um quadro com dez etapas caber no
            painel sem rolar o tempo todo.
          */}
          {aberta && (
            <>
              <textarea
                className="field-input field-prose"
                value={column.description ?? ""}
                placeholder="O que acontece nesta etapa? Quem faz, e o que precisa estar pronto para entrar aqui."
                aria-label={`Descrição da etapa ${column.name}`}
                style={{ minHeight: "56px" }}
                onChange={(e) => mexer(column.id, { description: e.target.value })}
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {COLORS.map((c) => (
                  <button
                    key={c.token}
                    type="button"
                    className="btn btn-toggle"
                    aria-pressed={(column.color || "var(--muted)") === c.token}
                    title={c.label}
                    style={{ padding: "0.3rem 0.6rem", fontSize: "var(--text-caption)" }}
                    onClick={() => mexer(column.id, { color: c.token })}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "var(--radius-pill)",
                        background: c.token,
                      }}
                    />
                    {c.label}
                  </button>
                ))}
              </div>

              {/*
                O grupo a que a etapa pertence.

                Chamava-se "Fase" só aqui, enquanto o botão da barra, o diálogo e o
                próprio modelo já diziam "Grupo" — quem procurasse onde mexer nas
                fases não achava, e quem achava não sabia que era a mesma coisa.

                A etapa vai para junto das irmãs de grupo ao ser marcada — a faixa
                precisa de colunas vizinhas para existir, e ninguém deveria ter de
                reordenar o quadro à mão para consegui-la. Ver `groupColumns`.
              */}
              {groups.length > 0 && (
                <div className="field">
                  <label className="field-label" htmlFor={`grupo-${column.id}`}>
                    Grupo
                  </label>
                  <select
                    id={`grupo-${column.id}`}
                    className="field-input"
                    value={column.groupId ?? ""}
                    // A cor do grupo escolhido na própria caixa: sem ela, só se
                    // descobre qual faixa é depois de fechar o diálogo.
                    style={{ borderColor: groups.find((g) => g.id === column.groupId)?.color }}
                    onChange={(e) => mexer(column.id, { groupId: e.target.value || null })}
                  >
                    <option value="">Sem grupo</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    O grupo é a faixa que aparece sobre as etapas no quadro — Criação, Growth,
                    Mídia — e é quem carrega a EQUIPE: quando uma demanda entra numa etapa
                    deste grupo, ela chega para as pessoas responsáveis por ele. Etapas do
                    mesmo grupo ficam lado a lado, e marcar aqui já move esta para junto das
                    outras. Sem grupo, a etapa fica solta, sem faixa e sem time.
                  </span>
                </div>
              )}

              {/*
                A equipe NÃO se define aqui — ela mora no grupo, em "Grupos".

                O grupo é o time: "Produção" nomeia um conjunto de pessoas tanto
                quanto um trecho do fluxo, e repetir a mesma equipe em cada etapa
                dele era descrever três vezes o mesmo fato — e garantir que um dia
                as três divergissem. Ver `ownershipOf` em `lib/kanban.ts`.
              */}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={column.isIntake}
                  title="Entrada do grupo desta etapa — no primeiro grupo do quadro, também recebe demanda nova"
                  style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                  onClick={() => mexer(column.id, { isIntake: !column.isIntake })}
                >
                  Entrada
                </button>

                <button
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={column.isDone}
                  title="Chegar aqui marca a demanda como entregue"
                  style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                  onClick={() => mexer(column.id, { isDone: !column.isDone })}
                >
                  Entrega
                </button>

                <button
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={column.isProduction}
                  title="Libera o envio de arquivos de entrega dentro do card, só a partir daqui"
                  style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                  onClick={() => mexer(column.id, { isProduction: !column.isProduction })}
                >
                  Produção
                </button>

                {/*
                  Interruptor, não botão-pílula — mesmo desenho do filtro de Safra
                  no dashboard (`app/page.tsx`): trilho + bolinha que deslizam,
                  em vez de um rótulo que liga/desliga a própria cor. `role` e
                  `onKeyDown` porque um `div` clicável não herda o teclado que um
                  `<button>` teria de graça.
                */}
                <div
                  role="switch"
                  aria-checked={column.notifySlackOnEnter}
                  aria-label="Avisar no Slack quando um card entrar nesta etapa"
                  tabIndex={0}
                  title="Avisar no Slack quando um card entrar nesta etapa"
                  onClick={() => mexer(column.id, { notifySlackOnEnter: !column.notifySlackOnEnter })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      mexer(column.id, { notifySlackOnEnter: !column.notifySlackOnEnter });
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "20px",
                      borderRadius: "100px",
                      background: column.notifySlackOnEnter ? "var(--primary)" : "var(--muted)",
                      position: "relative",
                      transition: "background 0.2s ease-in-out",
                      opacity: column.notifySlackOnEnter ? 1 : 0.4,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: column.notifySlackOnEnter ? "18px" : "2px",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "var(--text-caption)" }}>Aviso no Slack</span>
                </div>
              </div>

              {/*
                Canal e texto só aparecem com o aviso ligado — a maioria das
                etapas não avisa nada, e mostrar os dois campos sempre poluiria o
                painel de etapas que quase ninguém usa.
              */}
              {column.notifySlackOnEnter && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div className="field">
                    <label className="field-label" htmlFor={`slack-canal-${column.id}`}>
                      Canal do Slack (opcional)
                    </label>
                    <input
                      id={`slack-canal-${column.id}`}
                      className="field-input"
                      placeholder="Ex.: C0123456789"
                      value={column.slackChannelId ?? ""}
                      onChange={(e) => mexer(column.id, { slackChannelId: e.target.value })}
                    />
                    <span className="field-hint">
                      Em branco, usa o canal padrão de Configurações › Sistema.
                    </span>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor={`slack-texto-${column.id}`}>
                      Mensagem customizada (opcional)
                    </label>
                    {/*
                      Um botão por dado disponível, com nome do que ele FAZ —
                      não o token cru. Clicar insere no ponto onde o cursor
                      estiver na caixa abaixo; sem foco nela ainda, insere no
                      final.
                    */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.35rem" }}>
                      {SLACK_PLACEHOLDERS.map((p) => (
                        <button
                          key={p.token}
                          type="button"
                          className="btn btn-toggle"
                          title={p.title}
                          style={{ padding: "0.25rem 0.55rem", fontSize: "var(--text-caption)" }}
                          onClick={() => inserirPlaceholder(column.id, p.token)}
                        >
                          <Plus size={11} />
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      id={`slack-texto-${column.id}`}
                      ref={(el) => {
                        if (el) templateRefs.current.set(column.id, el);
                        else templateRefs.current.delete(column.id);
                      }}
                      className="field-input field-prose"
                      style={{ minHeight: "56px" }}
                      placeholder="Ex.: A tarefa {{tarefa}} está pronta para aprovação."
                      value={column.slackMessageTemplate ?? ""}
                      onChange={(e) => mexer(column.id, { slackMessageTemplate: e.target.value })}
                    />
                    <span className="field-hint">
                      Em branco, usa o texto padrão de entrega. Os botões acima inserem cada dado
                      no ponto onde o cursor estiver.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        );
      })}

      <div className="field">
        <label className="field-label" htmlFor="coluna-nova">
          Nova etapa
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            id="coluna-nova"
            className="field-input"
            style={{ flex: 1, minWidth: 0 }}
            value={newName}
            placeholder="Ex.: Aprovação do cliente"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !newName.trim()}
            onClick={criar}
          >
            <Plus size={15} />
            Adicionar
          </button>
        </div>
      </div>

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </>
  );
});

export default ColumnsSection;

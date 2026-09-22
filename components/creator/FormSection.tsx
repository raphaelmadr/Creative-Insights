"use client";

import React, { useState } from "react";
import { Plus, Trash2, Check, ChevronUp, ChevronDown } from "lucide-react";
import { type FieldDefinition } from "./FieldInput";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  FIELD_TYPES_WITH_OPTIONS,
  FIELD_TYPES_WITH_UPLOAD,
  FIELD_TYPES_AS_TRIGGER,
  FORM_BUILTINS,
  ordenarCampos,
  parseOptions,
  parseOptionsMap,
  parseShowWhenValues,
  universoDeOpcoes,
  type FieldType,
  type FormBuiltinKey,
} from "@/lib/kanban";

/**
 * O formulário do quadro — a primeira aba das preferências, e a base das outras.
 *
 * É aqui que se decide o que a demanda diz. As outras abas decidem o que fazer
 * com isso: a frente do card escolhe o que cabe de relance, o card aberto
 * escolhe o que cabe no painel. Nenhuma das duas inventa informação — o que não
 * se pergunta aqui não existe lá, e some das listas delas. A exceção é o que
 * nasce no quadro (número, etapa, responsável) e o que vem do gerador de copy.
 *
 * Fica no Kanban, não em Configurações: quem sabe o que precisa perguntar é
 * quem recebe as demandas, e essa pessoa não é necessariamente administradora
 * da plataforma. Mandá-la a outra tela para acrescentar "Formato" é atrito num
 * ajuste de dez segundos.
 *
 * São duas listas porque são duas origens — as perguntas de nascença (`FORM_BUILTINS`)
 * e as do time (`BoardField`) —, mas uma tela só, porque a pergunta de quem abre
 * esta janela é uma só: o que este formulário pergunta?
 *
 * Juntá-las foi o que resolveu a duplicata. Só as do time eram editáveis, então
 * um quadro que precisava perguntar a data do jeito dele criava o campo e ficava
 * com dois — "Prazo" de fábrica e "Data esperada" logo abaixo, mesma pergunta,
 * nomes diferentes, e o card mostrando a que a pessoa tivesse escolhido
 * responder. Não faltava um campo novo: faltava poder desligar o de fábrica.
 */

interface Draft {
  label: string;
  type: FieldType;
  options: string;
  /** A chave do campo pai, ou "" para campo independente. */
  dependsOn: string;
  /** Com pai: as opções de cada valor dele, uma por linha. Ver `optionsFor`. */
  optionsByParent: Record<string, string>;
  /** A chave do campo que revela este, ou "" para aparecer sempre. */
  showWhenKey: string;
  /** As respostas do revelador que fazem este campo aparecer. */
  showWhenValues: string[];
  /** A chave do campo que libera o ENVIO de arquivo, ou "" para sempre liberado. */
  uploadWhenKey: string;
  /** As respostas que liberam o envio. */
  uploadWhenValues: string[];
  placeholder: string;
  helpText: string;
  required: boolean;
  showOnCard: boolean;
}

const EMPTY: Draft = {
  label: "",
  type: "TEXT",
  options: "",
  dependsOn: "",
  optionsByParent: {},
  showWhenKey: "",
  showWhenValues: [],
  uploadWhenKey: "",
  uploadWhenValues: [],
  placeholder: "",
  helpText: "",
  required: false,
  showOnCard: false,
};

/** Um campo que pode ser pai de outro: escolha única, com opções próprias. */
interface ParentOption {
  key: string;
  label: string;
  values: string[];
}

/**
 * Um campo que pode REVELAR outro — qualquer escolha, única ou múltipla.
 *
 * Lista mais larga que a de pais (`ParentOption`) de propósito: para filtrar
 * opções o valor precisa ser um só, mas para acender um campo basta uma marca
 * entre várias. Ver `FIELD_TYPES_AS_TRIGGER`.
 */
interface TriggerOption {
  key: string;
  label: string;
  values: string[];
}

/** As opções são digitadas uma por linha — mais simples de revisar que vírgulas. */
const splitOptions = (raw: string) =>
  raw
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

function DraftForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  parents,
  triggers,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
  parents: ParentOption[];
  triggers: TriggerOption[];
}) {
  const needsOptions = FIELD_TYPES_WITH_OPTIONS.includes(draft.type);
  const pai = parents.find((p) => p.key === draft.dependsOn) ?? null;
  const gatilho = triggers.find((t) => t.key === draft.showWhenKey) ?? null;
  const aceitaEnvio = FIELD_TYPES_WITH_UPLOAD.includes(draft.type);
  const gatilhoEnvio = triggers.find((t) => t.key === draft.uploadWhenKey) ?? null;

  const alternarResposta = (valor: string) =>
    setDraft({
      ...draft,
      showWhenValues: draft.showWhenValues.includes(valor)
        ? draft.showWhenValues.filter((v) => v !== valor)
        : [...draft.showWhenValues, valor],
    });

  const alternarRespostaEnvio = (valor: string) =>
    setDraft({
      ...draft,
      uploadWhenValues: draft.uploadWhenValues.includes(valor)
        ? draft.uploadWhenValues.filter((v) => v !== valor)
        : [...draft.uploadWhenValues, valor],
    });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "var(--pad-card)",
        borderRadius: "var(--radius-block)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--surface-sunken-border)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        <div className="field">
          <label className="field-label" htmlFor="campo-rotulo">
            Pergunta
          </label>
          <input
            id="campo-rotulo"
            className="field-input"
            value={draft.label}
            placeholder="Ex.: Formato da peça"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="campo-tipo">
            Tipo
          </label>
          <select
            id="campo-tipo"
            className="field-input"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {needsOptions && parents.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="campo-depende">
            Depende de
          </label>
          <select
            id="campo-depende"
            className="field-input"
            value={draft.dependsOn}
            onChange={(e) => setDraft({ ...draft, dependsOn: e.target.value })}
          >
            <option value="">Nada — as opções são sempre as mesmas</option>
            {parents.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Com um pai escolhido, este campo só oferece as opções do valor que a pessoa
            marcar lá — &quot;Formato&quot; mostra outra lista para cada canal.
          </span>
        </div>
      )}

      {needsOptions && !pai && (
        <div className="field">
          <label className="field-label" htmlFor="campo-opcoes">
            Opções
          </label>
          <textarea
            id="campo-opcoes"
            className="field-input field-prose"
            value={draft.options}
            placeholder={"Uma por linha:\nEstático 1:1\nVídeo 9:16"}
            onChange={(e) => setDraft({ ...draft, options: e.target.value })}
          />
          <span className="field-hint">Uma opção por linha.</span>
        </div>
      )}

      {/*
        Uma caixa por valor do pai, e não uma sintaxe dentro de uma caixa só.
        Os valores do pai já são conhecidos — pedir que sejam redigitados com
        algum separador seria inventar uma linguagem só para errá-la.
      */}
      {needsOptions && pai && (
        <div className="field">
          <label className="field-label">Opções por {pai.label.toLowerCase()}</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {pai.values.length === 0 && (
              <span className="field-hint">
                &quot;{pai.label}&quot; ainda não tem opções — cadastre-as primeiro.
              </span>
            )}
            {pai.values.map((valor) => (
              <div key={valor} className="field">
                <label className="field-label" htmlFor={`campo-opcoes-${valor}`}>
                  {valor}
                </label>
                <textarea
                  id={`campo-opcoes-${valor}`}
                  className="field-input field-prose"
                  value={draft.optionsByParent[valor] ?? ""}
                  placeholder={"Uma por linha"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      optionsByParent: { ...draft.optionsByParent, [valor]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <span className="field-hint">
            Valor sem nenhuma opção some do formulário em vez de abrir um seletor vazio.
          </span>
        </div>
      )}

      {/*
        Quando o campo aparece — o eixo que não é "quais opções ele oferece".
        
        Fica abaixo das opções e acima da ajuda porque é a última decisão sobre
        a PERGUNTA em si; o que vem depois é acabamento. E vale para todo tipo,
        não só para os de escolha: o mais útil desta regra é justamente revelar
        uma caixa de texto ("Qual evento?") ou uma data que só faz sentido num
        dos caminhos.
      */}
      {triggers.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="campo-aparece">
            Quando aparece
          </label>
          <select
            id="campo-aparece"
            className="field-input"
            value={draft.showWhenKey}
            onChange={(e) =>
              /* Trocar de revelador zera as respostas marcadas: elas eram da
                 lista do revelador anterior, e manter uma marca que a nova
                 lista não tem gravaria uma regra que nunca acende. */
              setDraft({ ...draft, showWhenKey: e.target.value, showWhenValues: [] })
            }
          >
            <option value="">Sempre — a pergunta vale para todo mundo</option>
            {triggers.map((t) => (
              <option key={t.key} value={t.key}>
                Só quando responderem &quot;{t.label}&quot;…
              </option>
            ))}
          </select>
          {!gatilho && (
            <span className="field-hint">
              Uma pergunta que só vale em alguns casos pode ficar escondida até lá — assim
              quem pede um banner não precisa passar pelo campo do evento.
            </span>
          )}
        </div>
      )}

      {gatilho && (
        <div className="field">
          <label className="field-label">
            Aparece quando &quot;{gatilho.label}&quot; for
          </label>
          {gatilho.values.length === 0 ? (
            <span className="field-hint">
              &quot;{gatilho.label}&quot; ainda não tem opções — cadastre-as primeiro.
            </span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {gatilho.values.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={draft.showWhenValues.includes(valor)}
                  style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                  onClick={() => alternarResposta(valor)}
                >
                  {valor}
                </button>
              ))}
            </div>
          )}
          <span className="field-hint">
            Marque as respostas que fazem esta pergunta aparecer — basta uma delas. Sem nenhuma
            marcada, não há regra e o campo volta a aparecer sempre.
            {draft.required && " Escondido, ele não é cobrado como obrigatório."}
          </span>
        </div>
      )}

      {/*
        Quando LIBERAR O ENVIO — outro eixo que "quando o campo aparece".
        
        No quadro real as duas respostas são diferentes: "Arquivos Brutos"
        aparece quando o canal é Parcerias, e subir vídeo só vale quando a
        frente é Influenciadores ou Embaixadores. Com uma regra só, uma das duas
        viraria outro campo — e o formulário teria duas caixas de link onde quem
        preenche enxerga uma pergunta.
      */}
      {aceitaEnvio && triggers.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="campo-envio">
            Quando liberar o envio de arquivo
          </label>
          <select
            id="campo-envio"
            className="field-input"
            value={draft.uploadWhenKey}
            onChange={(e) =>
              setDraft({ ...draft, uploadWhenKey: e.target.value, uploadWhenValues: [] })
            }
          >
            <option value="">Sempre que o campo aparecer</option>
            {triggers.map((t) => (
              <option key={t.key} value={t.key}>
                Só quando responderem &quot;{t.label}&quot;…
              </option>
            ))}
          </select>
          {!gatilhoEnvio && (
            <span className="field-hint">
              A caixa de link vale sempre. O botão de subir arquivo pode valer só para alguns
              casos — é o que faz &quot;Arquivos Brutos&quot; continuar servindo a todo mundo com
              o envio reservado a parcerias.
            </span>
          )}
        </div>
      )}

      {aceitaEnvio && gatilhoEnvio && (
        <div className="field">
          <label className="field-label">
            Envio liberado quando &quot;{gatilhoEnvio.label}&quot; for
          </label>
          {gatilhoEnvio.values.length === 0 ? (
            <span className="field-hint">
              &quot;{gatilhoEnvio.label}&quot; ainda não tem opções — cadastre-as primeiro.
            </span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {gatilhoEnvio.values.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={draft.uploadWhenValues.includes(valor)}
                  style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                  onClick={() => alternarRespostaEnvio(valor)}
                >
                  {valor}
                </button>
              ))}
            </div>
          )}
          {/* A legenda sob o botão de envio é ESTA lista, lida em voz alta —
              ver `legendaDoEnvio`. Dizer isso aqui evita escrever o texto duas
              vezes e vê-los divergir. */}
          <span className="field-hint">
            Quem preencher vê &quot;Exclusivo{" "}
            {draft.uploadWhenValues.join("/") || "…"}&quot; abaixo do botão.
          </span>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="campo-ajuda">
          Texto de ajuda
        </label>
        <input
          id="campo-ajuda"
          className="field-input"
          value={draft.helpText}
          placeholder="Aparece abaixo do campo, em cinza."
          onChange={(e) => setDraft({ ...draft, helpText: e.target.value })}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        <button
          type="button"
          className="btn btn-toggle"
          aria-pressed={draft.required}
          style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
          onClick={() => setDraft({ ...draft, required: !draft.required })}
        >
          Obrigatório
        </button>
        <button
          type="button"
          className="btn btn-toggle"
          aria-pressed={draft.showOnCard}
          style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
          onClick={() => setDraft({ ...draft, showOnCard: !draft.showOnCard })}
        >
          Mostrar na frente do card
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy}>
          <Check size={14} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * O pedaço da lista que anda junto: o campo e tudo que ele revela.
 *
 * Só funciona sobre uma lista já passada por `ordenarCampos`, e é por isso que
 * ela é sempre o ponto de partida daqui: é lá que os revelados ficam contíguos,
 * logo abaixo de quem os revela.
 */
function blocoDe(lista: FieldDefinition[], index: number): [number, number] {
  const dentro = new Set([lista[index].key]);
  let fim = index + 1;

  while (fim < lista.length) {
    const chave = lista[fim].showWhenKey;
    if (!chave || !dentro.has(chave)) break;
    dentro.add(lista[fim].key);
    fim += 1;
  }

  return [index, fim];
}

/** Dois campos do mesmo nível: soltos no formulário, ou revelados pelo mesmo campo. */
const mesmoNivel = (a: FieldDefinition, b: FieldDefinition) =>
  (a.showWhenKey || "") === (b.showWhenKey || "");

/**
 * O índice do irmão imediatamente acima ou abaixo — ou nulo, quando não há.
 *
 * Abaixo, é o começo do próximo bloco. Acima, é o primeiro campo do mesmo nível
 * que aparece voltando: entre dois irmãos só existem os revelados do primeiro,
 * e nenhum deles é do mesmo nível que eles.
 */
function irmaoVizinho(
  lista: FieldDefinition[],
  index: number,
  direcao: -1 | 1
): number | null {
  const alvo = lista[index];

  if (direcao === 1) {
    const [, fim] = blocoDe(lista, index);
    return fim < lista.length && mesmoNivel(lista[fim], alvo) ? fim : null;
  }

  for (let p = index - 1; p >= 0; p--) {
    if (mesmoNivel(lista[p], alvo)) return p;
  }
  return null;
}

export default function FormSection({
  boardId,
  fields,
  builtins,
  onBuiltins,
  onChanged,
}: {
  boardId: string;
  fields: FieldDefinition[];
  /** As perguntas de nascença que este quadro faz. Ver `parseFormBuiltins`. */
  builtins: FormBuiltinKey[];
  /**
   * Avisa a janela que a lista de perguntas mudou, no INSTANTE do clique.
   *
   * As outras abas derivam desta: desligar o prazo tira a linha do prazo de
   * lá. Elas liam a configuração do servidor, que só chega depois de o quadro
   * inteiro recarregar — alguns segundos —, e quem ligava uma pergunta e
   * trocava de aba na hora encontrava a aba velha, sem nada na tela explicando
   * a diferença. Parecia que a pergunta não tinha efeito nenhum.
   */
  onBuiltins?: (perguntas: FormBuiltinKey[]) => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Perguntas fixas e ordem têm cópia local porque a tela responde ANTES do
   * servidor: a gravação leva um segundo, e um interruptor que só se mexe
   * depois da resposta parece não ter funcionado — a pessoa clica de novo, e o
   * segundo clique desfaz o primeiro. Na seta é pior: quem reordena cinco
   * campos clica cinco vezes numa lista que ainda não se mexeu, e erra o alvo.
   *
   * As duas voltam ao valor do servidor quando a gravação falha, e o adotam
   * quando o quadro recarrega.
   */
  const [perguntas, setPerguntas] = useState<FormBuiltinKey[]>(builtins);
  const [ordem, setOrdem] = useState<FieldDefinition[]>(fields);

  /*
   * A adoção é feita na RENDERIZAÇÃO, e não num efeito — mesmo idioma de
   * `useRascunho`. Num efeito, a lista apareceria uma vez com o valor velho e
   * seria corrigida no quadro seguinte, o que se vê como um piscar depois de
   * cada gravação.
   *
   * A régua é o CONTEÚDO, não a identidade: as propriedades são recalculadas a
   * cada renderização da página (`parseFormBuiltins` devolve um array novo toda
   * vez), e comparar referências jogaria fora a cópia local a cada quadro
   * desenhado — inclusive no instante entre o clique e a resposta do servidor,
   * que é justamente o que ela existe para cobrir.
   */
  const doServidor = JSON.stringify({ builtins, fields });
  const [visto, setVisto] = useState(doServidor);
  if (doServidor !== visto) {
    setVisto(doServidor);
    setPerguntas(builtins);
    setOrdem(fields);
  }

  const send = async (method: "POST" | "PUT" | "DELETE", body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/fields", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar o campo.");
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Liga ou desliga uma pergunta de nascença.
   *
   * Vai direto ao quadro, sem botão de salvar, como todo o resto desta janela:
   * criar e apagar campo já gravam no clique, e um interruptor que esperasse um
   * "Salvar" inexistente seria a única coisa aqui a não valer imediatamente.
   */
  const alternarPergunta = async (key: FormBuiltinKey) => {
    const anterior = perguntas;
    const proximo = anterior.includes(key)
      ? anterior.filter((p) => p !== key)
      : [...anterior, key];

    setPerguntas(proximo);
    onBuiltins?.(proximo);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: boardId, formBuiltins: proximo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPerguntas(anterior);
        onBuiltins?.(anterior);
        setError(data.error || "Não foi possível salvar a pergunta.");
        return;
      }
      onChanged();
    } catch {
      setPerguntas(anterior);
      onBuiltins?.(anterior);
      setError("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Sobe ou desce uma pergunta uma posição.
   *
   * Setas, e não arrasto. A lista é curta, mora dentro de um diálogo que já
   * rola, e um alvo de arrasto aqui dentro disputaria o gesto com a rolagem no
   * celular — onde a maior parte destes ajustes é feita entre uma reunião e
   * outra. Duas setas sempre acertam.
   *
   * A ordem importa de verdade: é nela que o formulário desenha as perguntas, e
   * é ela que decide o que se lê antes de responder o resto.
   */
  const mover = async (index: number, direcao: -1 | 1) => {
    const anterior = ordem;
    const lista = ordenarCampos(ordem);
    const alvo = lista[index];
    if (!alvo) return;

    const [ini, fim] = blocoDe(lista, index);
    const vizinho = irmaoVizinho(lista, index, direcao);
    if (vizinho === null) return;

    /*
     * Troca de lugar com o IRMÃO, levando junto tudo que o campo revela.
     *
     * Descer "Canal" uma posição precisa descer também as perguntas que só
     * existem por causa dele — deixá-las para trás as largaria sob a pergunta
     * de cima, que não as revela, e `ordenarCampos` as puxaria de volta no
     * quadro seguinte. A seta pareceria não ter funcionado.
     *
     * "Irmão" é o campo do mesmo nível: um condicional se move entre os outros
     * condicionais do mesmo revelador, e nunca para fora dele.
     */
    const [iniVizinho, fimVizinho] = blocoDe(lista, vizinho);
    const proximo =
      direcao === 1
        ? [
            ...lista.slice(0, ini),
            ...lista.slice(iniVizinho, fimVizinho),
            ...lista.slice(ini, fim),
            ...lista.slice(fimVizinho),
          ]
        : [
            ...lista.slice(0, iniVizinho),
            ...lista.slice(ini, fim),
            ...lista.slice(iniVizinho, fimVizinho),
            ...lista.slice(fim),
          ];

    /*
     * Filho nunca sobe acima do pai.
     *
     * "Formato" só sabe o que oferecer depois que "Canal" foi respondido — ver
     * `optionsFor`. Invertidos, quem preenche encontra primeiro um seletor
     * vazio, sem nada na tela explicando que falta responder algo mais abaixo.
     * O quadro em produção já teve esse defeito por outro caminho; barrar aqui
     * é impedir que ele volte por este.
     */
    const posicao = new Map(proximo.map((f, i) => [f.key, i]));
    const invertido = proximo.find(
      (f, i) => f.dependsOn && (posicao.get(f.dependsOn) ?? -1) > i
    );
    if (invertido) {
      const pai = proximo.find((f) => f.key === invertido.dependsOn);
      setError(
        `"${invertido.label}" depende de "${pai?.label ?? invertido.dependsOn}" e precisa vir depois dele.`
      );
      return;
    }

    setOrdem(proximo);
    setError(null);
    // Recusada a gravação, a lista volta ao que o servidor tem: deixá-la na
    // ordem nova mostraria um resultado que não existe no banco, e o próximo
    // recarregamento a desfaria sozinho, sem explicação.
    if (!(await send("PUT", { boardId, order: proximo.map((f) => f.id) }))) setOrdem(anterior);
  };

  /*
   * Quem pode ser pai: os SELECT do quadro, menos o que está sendo editado.
   *
   * MULTISELECT fica de fora porque o valor precisa ser UM para servir de chave
   * no mapa — com várias marcas, não há uma lista a escolher.
   */
  const parents: ParentOption[] = fields
    .filter((f) => f.type === "SELECT" && f.id !== editingId)
    .map((f) => ({ key: f.key, label: f.label, values: parseOptions(f.options) }));

  /*
   * Quem pode revelar: qualquer campo de escolha do quadro, menos este.
   *
   * Sem corte por posição. A ordem do formulário é derivada da regra — o campo
   * condicional é colocado sob quem o revela, esteja esse onde estiver (ver
   * `ordenarCampos`) —, então exigir que o revelador já viesse antes só obrigava
   * a arrumar a lista com as setas ANTES de poder escrever a regra, para chegar
   * a uma ordem que o sistema produz sozinho.
   *
   * Ciclo é recusado pelo servidor, que é quem enxerga a cadeia inteira.
   */
  const triggers: TriggerOption[] = fields
    .filter((f) => FIELD_TYPES_AS_TRIGGER.includes(f.type as FieldType) && f.id !== editingId)
    .map((f) => ({ key: f.key, label: f.label, values: universoDeOpcoes(f) }));

  const payload = () => ({
    label: draft.label,
    type: draft.type,
    dependsOn: draft.dependsOn || null,
    /* Revelador sem nenhuma resposta marcada vale como "aparece sempre" — é o
       que a dica ao lado promete, e o servidor recusaria a regra pela metade. */
    showWhenKey: draft.showWhenValues.length ? draft.showWhenKey || null : null,
    showWhenValues: draft.showWhenValues,
    uploadWhenKey: draft.uploadWhenValues.length ? draft.uploadWhenKey || null : null,
    uploadWhenValues: draft.uploadWhenValues,
    // A forma acompanha a dependência: lista sem pai, mapa com pai. É o mesmo
    // par que `normalizeOptions` espera do outro lado.
    options: draft.dependsOn
      ? Object.fromEntries(
          Object.entries(draft.optionsByParent).map(([valor, texto]) => [
            valor,
            splitOptions(texto),
          ])
        )
      : splitOptions(draft.options),
    placeholder: draft.placeholder,
    helpText: draft.helpText,
    required: draft.required,
    showOnCard: draft.showOnCard,
  });

  const create = async () => {
    if (!draft.label.trim()) {
      setError("A pergunta precisa de um nome.");
      return;
    }
    if (await send("POST", { boardId, ...payload() })) {
      setDraft(EMPTY);
      setAdding(false);
    }
  };

  const update = async () => {
    if (!editingId) return;
    if (await send("PUT", { id: editingId, ...payload() })) {
      setDraft(EMPTY);
      setEditingId(null);
    }
  };

  const startEdit = (field: FieldDefinition) => {
    setAdding(false);
    setEditingId(field.id);
    setError(null);
    setDraft({
      label: field.label,
      type: field.type as FieldType,
      options: field.dependsOn ? "" : parseOptions(field.options).join("\n"),
      dependsOn: field.dependsOn || "",
      optionsByParent: Object.fromEntries(
        Object.entries(parseOptionsMap(field.options)).map(([valor, lista]) => [
          valor,
          lista.join("\n"),
        ])
      ),
      showWhenKey: field.showWhenKey || "",
      showWhenValues: parseShowWhenValues(field.showWhenValues),
      uploadWhenKey: field.uploadWhenKey || "",
      uploadWhenValues: parseShowWhenValues(field.uploadWhenValues),
      placeholder: field.placeholder || "",
      helpText: field.helpText || "",
      required: field.required,
      showOnCard: field.showOnCard,
    });
  };

  return (
    <>
      {/*
        O que muda aqui vale na hora, sem passar pelo Salvar do rodapé.
        
        É a única aba assim, e por um motivo: criar e apagar pergunta são ATOS,
        com botão próprio e confirmação; não são preferências de exibição, que é
        o que as outras abas ajustam. Guardá-los num rascunho faria o "Criar
        campo" recém-clicado esperar por um segundo botão para existir.
      */}
      <span className="field-hint">
        O que você mudar aqui vale imediatamente.
      </span>

      {/*
        As de fábrica primeiro, e na ordem em que o formulário as mostra: é essa
        a ordem em que quem preenche as encontra, e a tela que decide sobre elas
        deveria se parecer com a que elas produzem.

        O título nunca entra na lista. Uma demanda sem título é uma linha em
        branco no quadro — não há configuração que torne isso útil.
      */}
      <span className="field-label">Perguntas de fábrica</span>
      <span className="field-hint" style={{ marginTop: "-0.4rem" }}>
        Vêm com o quadro. Desligue a que este time já pergunta do jeito dele — o que
        já foi respondido continua nos cards.
      </span>

      {FORM_BUILTINS.map((pergunta) => {
        const ligada = perguntas.includes(pergunta.key);
        return (
          <div
            key={pergunta.key}
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
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
              <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>
                {pergunta.label}
              </span>
              <span className="field-hint">{pergunta.hint}</span>
            </div>

            <button
              type="button"
              className="btn btn-toggle"
              aria-pressed={ligada}
              disabled={busy}
              title={
                ligada
                  ? `Parar de perguntar "${pergunta.label}" neste quadro`
                  : `Voltar a perguntar "${pergunta.label}"`
              }
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)", flexShrink: 0 }}
              onClick={() => alternarPergunta(pergunta.key)}
            >
              {ligada ? "Pergunta" : "Não pergunta"}
            </button>
          </div>
        );
      })}

      <span className="field-label" style={{ marginTop: "0.4rem" }}>
        Perguntas deste quadro
      </span>

      {fields.length === 0 && !adding && (
        <span className="field-hint">
          Nenhuma ainda — este quadro só faz as perguntas de fábrica.
        </span>
      )}

      {/*
        A lista é a DERIVADA, não a ordem crua: cada condicional aparece
        exatamente sob quem o revela, do mesmo jeito que aparecerá no
        formulário. Esta tela decide o que a demanda pergunta — mostrar aqui uma
        ordem que o formulário não usa seria descrever outro quadro.
      */}
      {ordenarCampos(ordem).map((field, index, lista) =>
        editingId === field.id ? (
          <DraftForm
            key={field.id}
            draft={draft}
            setDraft={setDraft}
            onSubmit={update}
            onCancel={() => {
              setEditingId(null);
              setDraft(EMPTY);
            }}
            submitLabel="Salvar campo"
            busy={busy}
            parents={parents}
            triggers={triggers}
          />
        ) : (
          <div
            key={field.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.6rem 0.75rem",
              borderRadius: "var(--radius-block)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--surface-sunken-border)",
              /* Recuado sob quem o revela — a mesma leitura de uma lista
                 aninhada. Sem isto, "logo abaixo" é só coincidência de ordem, e
                 quem lê a tela não tem como saber que a pergunta pertence à de
                 cima. */
              ...(field.showWhenKey ? { marginLeft: "1.25rem" } : {}),
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
              <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>
                {field.label}
                {field.required && (
                  <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }} aria-hidden="true">
                    *
                  </span>
                )}
              </span>
              <span className="field-hint">
                {FIELD_TYPE_LABEL[field.type as FieldType] ?? field.type}
                {field.showOnCard ? " · visível no card" : ""}
                {/* A condição na própria linha: sem ela, a lista mostra uma
                    pergunta obrigatória que quem preenche às vezes não vê, e a
                    única explicação estaria escondida atrás de "Editar". */}
                {field.showWhenKey && (
                  <>
                    {" · só quando "}
                    {fields.find((f) => f.key === field.showWhenKey)?.label ?? field.showWhenKey}
                    {" = "}
                    {parseShowWhenValues(field.showWhenValues).join(" ou ")}
                  </>
                )}
                {field.uploadWhenKey && (
                  <>
                    {" · envio só com "}
                    {fields.find((f) => f.key === field.uploadWhenKey)?.label ?? field.uploadWhenKey}
                    {" = "}
                    {parseShowWhenValues(field.uploadWhenValues).join(" ou ")}
                  </>
                )}
              </span>
            </div>

            {/* As setas antes de "Editar": reordenar é o ajuste de um clique, e
                fica na borda por onde o olho desce a lista. */}
            <span style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-icon"
                title={`Subir "${field.label}"`}
                aria-label={`Subir ${field.label}`}
                disabled={busy || irmaoVizinho(lista, index, -1) === null}
                style={{ padding: "0.1rem 0.3rem" }}
                onClick={() => mover(index, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                title={`Descer "${field.label}"`}
                aria-label={`Descer ${field.label}`}
                disabled={busy || irmaoVizinho(lista, index, 1) === null}
                style={{ padding: "0.1rem 0.3rem" }}
                onClick={() => mover(index, 1)}
              >
                <ChevronDown size={14} />
              </button>
            </span>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "0.3rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => startEdit(field)}
            >
              Editar
            </button>

            <button
              type="button"
              className="btn btn-icon"
              title={`Remover "${field.label}"`}
              aria-label={`Remover ${field.label}`}
              disabled={busy}
              onClick={() => {
                /*
                 * As respostas já dadas continuam gravadas no card — ver a rota
                 * de campos. Dizer isso aqui evita a leitura de que remover a
                 * pergunta apaga o histórico de quem já respondeu.
                 */
                if (confirm(`Remover "${field.label}" do formulário?\n\nAs respostas já enviadas continuam guardadas nos cards.`)) {
                  /*
                   * A linha some antes da resposta do servidor.
                   *
                   * A recarga do quadro leva alguns segundos, e até ela chegar
                   * a lixeira do campo recém-apagado continuava clicável —
                   * clicá-la de novo pedia ao banco que apagasse o que já não
                   * existe. O servidor passou a tratar isso como sucesso, mas o
                   * certo é não oferecer o botão: a lista mostra o que há.
                   */
                  setOrdem((atual) => atual.filter((f) => f.id !== field.id));
                  // Recusada a remoção, a linha volta: escondê-la de vez
                  // mostraria um formulário que não é o que está gravado.
                  send("DELETE", { id: field.id }).then((ok) => {
                    if (!ok) setOrdem(fields);
                  });
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )
      )}

      {adding ? (
        <DraftForm
          draft={draft}
          setDraft={setDraft}
          onSubmit={create}
          onCancel={() => {
            setAdding(false);
            setDraft(EMPTY);
          }}
          submitLabel="Criar campo"
          busy={busy}
          parents={parents}
          triggers={triggers}
        />
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setEditingId(null);
            setDraft(EMPTY);
            setError(null);
            setAdding(true);
          }}
        >
          <Plus size={15} />
          Novo campo
        </button>
      )}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </>
  );
}

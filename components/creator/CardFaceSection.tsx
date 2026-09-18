"use client";

import React, { useState } from "react";
import { Clock, Link2 } from "lucide-react";
import { type FieldDefinition } from "./FieldInput";
import { useRascunho, type SecaoHandle } from "./useRascunho";
import {
  CARD_BADGES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  fonteDoBadge,
  type CardBadgeKey,
  type FormBuiltinKey,
} from "@/lib/kanban";

/**
 * O que o card mostra na frente — tudo, num lugar só.
 *
 * Antes a resposta estava repartida em três: os atributos de nascença aqui, as
 * respostas do formulário na tela de campos, e briefing, peças de copy, link e
 * anexos em lugar nenhum — eram decisão cravada no componente do quadro. Quem
 * quisesse enxugar o card precisava saber qual das três mandava em quê, e a
 * terceira não mandava: era código.
 *
 * São duas origens de dado, e por isso duas listas — mas uma tela só, porque a
 * pergunta de quem abre esta janela é uma só: o que aparece no card?
 *
 * Fica ao lado de "Campos" e "Etapas", e não em Configurações, pelo mesmo
 * motivo que aquelas duas: quem decide o que precisa ver no quadro é quem olha
 * o quadro todo dia, não quem administra a plataforma.
 */
const CardFaceSection = React.forwardRef<
  SecaoHandle,
  {
    open: boolean;
    boardId: string;
    badges: CardBadgeKey[];
    /** Os campos do formulário — cada um com o seu próprio `showOnCard`. */
    fields: FieldDefinition[];
    /**
     * As perguntas de nascença que o quadro faz — é o que filtra esta lista.
     *
     * O formulário é a base: selo que vive de uma pergunta desligada sai da
     * tela, porque não há decisão a tomar sobre um valor que o quadro não
     * coleta mais. A escolha gravada continua no banco, e voltar a perguntar
     * devolve a linha como ela estava.
     */
    builtins: FormBuiltinKey[];
    onChanged: () => void;
    /**
     * Avisa o diálogo que contém esta seção que há (ou deixou de haver) algo a
     * salvar. O `ref` entrega o `salvar`, mas não serve para isto: mudar uma
     * ref não renderiza ninguém, e o botão de Salvar do pai ficaria eternamente
     * desabilitado enquanto o rascunho daqui já tinha mudado.
     */
    onSujo?: (sujo: boolean) => void;
    /**
     * O rascunho corrente, para quem quiser desenhá-lo.
     *
     * É o que faz a prévia reagir ao interruptor antes de qualquer gravação:
     * sem isto ela mostraria o estado do servidor, e ligar um selo não mudaria
     * nada na tela até alguém salvar — que é justamente a dúvida que a prévia
     * existe para tirar.
     */
    onDraft?: (d: { badges: CardBadgeKey[]; campos: FieldDefinition[] }) => void;
  }
>(function CardFaceSection(
  { open, boardId, badges, fields, builtins, onChanged, onSujo, onDraft },
  ref
) {
  const { draft, setDraft, sujo, adotar } = useRascunho(open, { badges, campos: fields });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Os selos, separados por de onde vem o valor de cada um.
   *
   * Um selo que vive de pergunta desligada não entra em nenhuma das duas: não
   * há o que decidir sobre um valor que o quadro deixou de coletar, e o
   * interruptor seria uma promessa que os cards novos não cumprem. Ver
   * `fonteDoBadge`.
   */
  const doFormulario = CARD_BADGES.filter((b) => {
    const fonte = fonteDoBadge(b.key);
    return !!fonte && builtins.includes(fonte);
  });
  const doQuadro = CARD_BADGES.filter((b) => !fonteDoBadge(b.key));

  const gravar = async (url: string, body: object) => {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
    return data;
  };

  const toggleBadge = (key: CardBadgeKey) =>
    setDraft({
      ...draft,
      badges: draft.badges.includes(key)
        ? draft.badges.filter((b) => b !== key)
        : [...draft.badges, key],
    });

  /*
   * O campo continua guardando a resposta no PRÓPRIO `showOnCard` — o rascunho
   * é só o lugar onde a escolha espera o Salvar. Uma segunda chave para a mesma
   * pergunta acabaria discordando, e a tela de campos, que mostra "visível no
   * card" ao lado de cada um, passaria a mentir.
   */
  const toggleField = (field: FieldDefinition) =>
    setDraft({
      ...draft,
      campos: draft.campos.map((f) =>
        f.id === field.id ? { ...f, showOnCard: !f.showOnCard } : f
      ),
    });

  /**
   * Um PUT para o quadro, se os badges mudaram, e um por campo alterado.
   *
   * São dois destinos porque são dois donos do dado — o quadro guarda o que ele
   * mesmo mostra, o campo guarda a própria visibilidade —, mas uma pergunta só
   * para quem está olhando, e por isso um botão só.
   */
  const salvar = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      if (JSON.stringify(draft.badges) !== JSON.stringify(badges)) {
        await gravar("/api/creator/boards", { id: boardId, cardBadges: draft.badges });
      }

      for (const campo of draft.campos) {
        const original = fields.find((f) => f.id === campo.id);
        if (original && original.showOnCard !== campo.showOnCard) {
          await gravar("/api/creator/fields", { id: campo.id, showOnCard: campo.showOnCard });
        }
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


  /** O badge como ele sai no card — a prévia usa a mesma pílula, não uma imitação. */
  const preview = (key: CardBadgeKey) => {
    switch (key) {
      case "code":
        return (
          <span
            style={{
              fontSize: "var(--text-eyebrow)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            MKT-42
          </span>
        );
      case "title":
        return (
          <span style={{ fontSize: "var(--text-eyebrow)", fontWeight: 600 }}>
            Campanha de aniversário…
          </span>
        );
      case "priority":
        return (
          <span
            className="card-badge"
            style={{
              color: PRIORITY_COLOR.ALTA,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {PRIORITY_LABEL.ALTA}
          </span>
        );
      case "dueDate":
        return (
          <span className="card-badge">
            <Clock size={10} />
            30/09
          </span>
        );
      case "assignee":
        return <span className="card-badge" style={{ fontWeight: 600, letterSpacing: "0.04em" }}>RM</span>;
      case "stage":
        return (
          <span className="card-badge">
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "var(--radius-pill)",
                background: "var(--info)",
                flexShrink: 0,
              }}
            />
            Em produção
          </span>
        );
      case "origin":
        return <span className="card-badge">Gerador de copy</span>;
      case "briefing":
        return (
          <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)" }}>
            Produto: iPhone 17 · Público: …
          </span>
        );
      case "link":
        return (
          <span
            className="card-badge"
            style={{
              fontWeight: 600,
              color: "#4285F4",
              borderColor: "rgba(66,133,244,0.38)",
              background: "rgba(66,133,244,0.12)",
            }}
          >
            <Link2 size={10} />
            Drive
          </span>
        );
    }
  };

  const linha = (
    titulo: string,
    dica: string,
    amostra: React.ReactNode,
    ligado: boolean,
    alternar: () => void
  ) => (
    <div
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
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-control)", fontWeight: 600 }}>{titulo}</span>
          {amostra}
        </span>
        <span className="field-hint">{dica}</span>
      </div>

      <button
        type="button"
        className="btn btn-toggle"
        aria-pressed={ligado}
        disabled={busy}
        style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)", flexShrink: 0 }}
        onClick={alternar}
      >
        {ligado ? "No card" : "Oculto"}
      </button>
    </div>
  );

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

  React.useEffect(() => {
    onDraft?.({ badges: draft.badges, campos: draft.campos });
  }, [draft, onDraft]);

  return (
    <>
      {/*
        Duas listas, na ordem em que a informação nasce: primeiro o que veio do
        formulário, depois o que o próprio quadro acrescenta.

        Antes a divisão era outra — "do card" para os selos embutidos, "do
        formulário" para as respostas —, e ela contava uma história errada:
        prioridade, prazo e link também vêm do formulário, e apareciam do outro
        lado como se fossem invenção do quadro. Com a divisão certa, a primeira
        lista é exatamente a aba anterior, e a pergunta desligada lá some daqui
        sozinha.
      */}
      <span className="field-label">Do formulário</span>

      {doFormulario.length === 0 && draft.campos.length === 0 ? (
        <span className="field-hint">
          Este quadro não pergunta nada que caiba na frente do card. Ajuste em{" "}
          <strong>Formulário</strong>.
        </span>
      ) : (
        doFormulario.map((badge) => (
          <React.Fragment key={badge.key}>
            {linha(
              badge.label,
              badge.hint,
              preview(badge.key),
              draft.badges.includes(badge.key),
              () => toggleBadge(badge.key)
            )}
          </React.Fragment>
        ))
      )}

      {draft.campos.map((field) => (
        <React.Fragment key={field.id}>
          {linha(
            field.label,
            /*
             * A dica diz o que a pessoa escreveu ali, quando o campo tem uma —
             * é o que distingue dois campos de nome parecido na hora de decidir
             * qual dos dois merece espaço no card.
             */
            field.helpText || `A resposta de "${field.label}" na abertura da demanda.`,
            <span className="card-badge">{exemploDoCampo(field)}</span>,
            field.showOnCard,
            () => toggleField(field)
          )}
        </React.Fragment>
      ))}

      <span className="field-label" style={{ marginTop: "0.4rem" }}>
        Do quadro
      </span>

      <span className="field-hint" style={{ marginTop: "-0.4rem" }}>
        O que o quadro produz sozinho, sem perguntar nada. Vale em qualquer quadro.
      </span>

      {doQuadro.map((badge) => (
        <React.Fragment key={badge.key}>
          {linha(badge.label, badge.hint, preview(badge.key), draft.badges.includes(badge.key), () =>
            toggleBadge(badge.key)
          )}
        </React.Fragment>
      ))}

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

export default CardFaceSection;

/** Uma resposta plausível do campo, para a prévia não ser um retângulo vazio. */
function exemploDoCampo(field: FieldDefinition): string {
  const primeira = (() => {
    if (!field.options) return null;
    try {
      const parsed = JSON.parse(field.options);
      if (Array.isArray(parsed)) return parsed[0] ? String(parsed[0]) : null;
      // Campo dependente: as opções vêm agrupadas pelo valor do campo pai.
      const grupos = Object.values(parsed as Record<string, unknown>);
      const primeiroGrupo = grupos.find(Array.isArray) as unknown[] | undefined;
      return primeiroGrupo?.[0] ? String(primeiroGrupo[0]) : null;
    } catch {
      return null;
    }
  })();

  if (primeira) return primeira;
  if (field.type === "DATE") return "30/09/2026";
  if (field.type === "URL") return "drive.google.com/…";
  if (field.type === "NUMBER" || field.type === "RANGE") return "12";
  return field.placeholder || "texto respondido";
}

/**
 * Um conjunto de respostas plausível para os campos do quadro.
 *
 * A prévia precisa de VALORES, não de rótulos: o card formata data, número e
 * escolha múltipla de jeitos diferentes, e um card de exemplo com tudo em texto
 * mostraria uma formatação que o card de verdade nunca produz.
 */
export function exemploDeRespostas(fields: FieldDefinition[]): Record<string, unknown> {
  const respostas: Record<string, unknown> = {};

  for (const field of fields) {
    switch (field.type) {
      case "DATE":
        respostas[field.key] = "2026-09-30";
        break;
      case "NUMBER":
      case "RANGE":
        respostas[field.key] = 12;
        break;
      case "CHECKBOX":
        respostas[field.key] = true;
        break;
      case "URL":
        respostas[field.key] = "https://drive.google.com/drive/folders/exemplo";
        break;
      case "MULTISELECT":
        respostas[field.key] = [exemploDoCampo(field)];
        break;
      default:
        respostas[field.key] = exemploDoCampo(field);
    }
  }

  return respostas;
}

"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { ClipboardList, Columns3, LayoutGrid, PanelsTopLeft } from "lucide-react";
import Modal from "@/components/Modal";
import ColumnsSection, { type ColumnDefinition } from "./ColumnsSection";
import CardFaceSection, { exemploDeRespostas } from "./CardFaceSection";
import CardPanelSection from "./CardPanelSection";
import FormSection from "./FormSection";
import CardFace, { estiloDoCard } from "./CardFace";
import { type FieldDefinition } from "./FieldInput";
import { type CardData } from "./CardDialog";
import type { PersonOption } from "./DemandDialog";
import { type SecaoHandle } from "./useRascunho";
import {
  type CardBadgeKey,
  type CardPanelKey,
  type FormBuiltinKey,
  type GroupDefinition,
} from "@/lib/kanban";

/**
 * Como este quadro se comporta — o formulário, o card e as etapas, numa janela só.
 *
 * Eram três botões e três diálogos, e a separação não correspondia a nada: quem
 * abre um está ajustando o quadro, e quase sempre abria os outros em seguida.
 * Pior, ela escondia a relação entre eles — a tela dos campos ficava num canto
 * da barra, e nada dizia que era dali que saía tudo o que o card mostra.
 *
 * As abas estão na ordem da dependência, e é essa a ideia central do quadro:
 *
 *   **Formulário** → o que a demanda diz. É a base; sem pergunta não há dado.
 *   **Frente do card** → o que disso cabe de relance, no quadro.
 *   **Card aberto** → o que disso cabe no painel da demanda.
 *   **Etapas** → por onde ela passa.
 *
 * Por isso desligar uma pergunta na primeira aba some com a linha dela nas duas
 * seguintes: elas não inventam informação, apenas escolhem o que fazer com a que
 * existe. O que nasce no próprio quadro — número, etapa, responsável — e o que
 * vem do gerador de copy não dependem de pergunta nenhuma e estão sempre lá.
 *
 * Cada seção continua dona do próprio rascunho e da própria gravação: são
 * destinos diferentes no servidor (a etapa é uma linha de coluna, a cara do card
 * é do quadro e de cada campo). O que se unificou foi a PERGUNTA, e por isso o
 * Salvar é um só — ele grava o que cada seção tiver pendente. A aba do
 * formulário é a exceção, e ela mesma o diz: criar e apagar pergunta são atos,
 * não preferências, e valem no clique.
 *
 * A prévia é o ponto da aba do card. Antes se escolhia o que o card mostra lendo
 * uma lista de nomes de selo e imaginando o resultado; agora o card de exemplo
 * está ao lado e reage ao interruptor antes de qualquer gravação. E é o card DE
 * VERDADE — `CardFace`, o mesmo componente que o quadro desenha —, porque uma
 * imitação envelheceria no primeiro selo novo e passaria a mentir justamente
 * para quem está decidindo olhando para ela.
 */

type Aba = "formulario" | "card" | "painel" | "etapas";

const ABAS: { id: Aba; label: string; icon: typeof Columns3 }[] = [
  { id: "formulario", label: "Formulário", icon: ClipboardList },
  { id: "card", label: "Frente do card", icon: LayoutGrid },
  { id: "painel", label: "Card aberto", icon: PanelsTopLeft },
  { id: "etapas", label: "Etapas", icon: Columns3 },
];

export default function BoardSetupDialog({
  open,
  onClose,
  boardId,
  columns,
  groups,
  badges,
  panel,
  builtins,
  fields,
  people,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  columns: ColumnDefinition[];
  groups?: GroupDefinition[];
  badges: CardBadgeKey[];
  /** As seções do card aberto. Ver `parseCardPanel`. */
  panel: CardPanelKey[];
  /** As perguntas de nascença que o quadro faz. Ver `parseFormBuiltins`. */
  builtins: FormBuiltinKey[];
  fields: FieldDefinition[];
  /** Para o crachá da prévia mostrar gente de verdade, e não um nome inventado. */
  people: PersonOption[];
  onChanged: () => void;
}) {
  const etapas = useRef<SecaoHandle>(null);
  const card = useRef<SecaoHandle>(null);
  const painel = useRef<SecaoHandle>(null);
  const [busy, setBusy] = useState(false);
  /*
   * Abre no formulário, que é a base: quem vem ajustar o quadro quase sempre
   * vem por causa de uma pergunta, e as outras abas só fazem sentido depois
   * dela. Antes abria nas etapas, que é o que menos muda.
   */
  const [aba, setAba] = useState<Aba>("formulario");

  /*
   * O pendente de cada seção vive AQUI, avisado por ela.
   *
   * O estado do rascunho é da seção, e mexer nele não renderiza este
   * componente: ler `etapas.current.sujo` durante a renderização devolveria
   * sempre o valor da renderização anterior, e o botão de Salvar ficaria
   * desabilitado justamente depois da primeira alteração.
   *
   * Os `useCallback` são o que impede o laço: sem identidade estável, o efeito
   * que avisa dispararia a cada renderização do pai, que este aviso causou.
   */
  const [sujoEtapas, setSujoEtapas] = useState(false);
  const [sujoCard, setSujoCard] = useState(false);
  const [sujoPainel, setSujoPainel] = useState(false);
  const [rascunhoCard, setRascunhoCard] = useState<{
    badges: CardBadgeKey[];
    campos: FieldDefinition[];
  }>({ badges, campos: fields });

  /*
   * As perguntas do formulário vivem AQUI enquanto a janela está aberta.
   *
   * É delas que as outras abas derivam: o que o quadro não pergunta não aparece
   * na frente do card nem no card aberto. Lendo direto da propriedade, a
   * derivação só acontecia depois de o quadro inteiro recarregar — alguns
   * segundos —, e quem ligava a prioridade e ia à aba do card aberto na hora
   * não encontrava a linha dela. A configuração estava certa; a tela é que
   * ainda não sabia.
   *
   * A régua da adoção é o CONTEÚDO: a propriedade é recalculada a cada
   * renderização da página, e comparar referências jogaria fora o valor
   * otimista justamente no intervalo que ele existe para cobrir.
   */
  const [perguntas, setPerguntas] = useState<FormBuiltinKey[]>(builtins);
  const doServidor = JSON.stringify(builtins);
  const [vistas, setVistas] = useState(doServidor);
  if (doServidor !== vistas) {
    setVistas(doServidor);
    setPerguntas(builtins);
  }
  const receberPerguntas = useCallback((p: FormBuiltinKey[]) => setPerguntas(p), []);

  const avisarEtapas = useCallback((v: boolean) => setSujoEtapas(v), []);
  const avisarCard = useCallback((v: boolean) => setSujoCard(v), []);
  const avisarPainel = useCallback((v: boolean) => setSujoPainel(v), []);
  const receberRascunho = useCallback(
    (d: { badges: CardBadgeKey[]; campos: FieldDefinition[] }) => setRascunhoCard(d),
    []
  );

  const sujo = sujoEtapas || sujoCard || sujoPainel;

  /*
   * O card de exemplo: preenchido de propósito em TUDO que pode aparecer.
   *
   * Um exemplo sem prazo não mostraria o que o interruptor de prazo faz, e quem
   * o desligasse não veria diferença nenhuma — concluindo, errado, que o
   * interruptor não funciona.
   */
  const exemplo = useMemo<CardData>(
    () => ({
      id: "exemplo",
      code: 42,
      boardId,
      columnId: columns[0]?.id ?? "",
      title: "Campanha de aniversário — 12 peças",
      description:
        "**Produto:** Plano Anual · **Público:** base inativa há 90 dias · **Objetivo:** reativação",
      priority: "ALTA",
      dueDate: "2026-09-30T12:00:00.000Z",
      requesterName: "Equipe de Growth",
      requesterEmail: null,
      assignees: JSON.stringify(people.slice(0, 1).map((p) => p.email)),
      values: JSON.stringify(exemploDeRespostas(rascunhoCard.campos)),
      origin: "COPY",
      copyText: null,
      attachments: JSON.stringify([
        { url: "https://exemplo/arte.png", name: "arte.png", mime: "image/png" },
      ]),
      linkUrl: "https://drive.google.com/drive/folders/exemplo",
      // Preenchido no exemplo para que o selo "Entrega" possa ser
      // visto ao ser ligado — um card de amostra sem entrega deixaria a opção
      // sem efeito visível, e quem configura não saberia o que está ligando.
      deliveryUrl: "https://drive.google.com/drive/folders/exemplo-entrega",
      archived: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [boardId, columns, people, rascunhoCard.campos]
  );

  const salvar = async () => {
    setBusy(true);
    try {
      // Em série, e não em paralelo: as duas escrevem no mesmo quadro, e um erro
      // na primeira deve impedir a segunda de gravar por cima de um estado que
      // já não é o esperado.
      if (sujoEtapas && etapas.current && !(await etapas.current.salvar())) return;
      if (sujoCard && card.current && !(await card.current.salvar())) return;
      if (sujoPainel && painel.current && !(await painel.current.salvar())) return;
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas neste quadro. Fechar e perdê-las?")) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Preferências do quadro"
      description="O que a demanda pergunta, o que o card mostra e por onde ela passa."
      width="min(1040px, 100%)"
      footer={
        <>
          {sujo && (
            <span className="field-hint" style={{ marginRight: "auto" }}>
              As abas com ponto têm alterações pendentes, e são gravadas juntas.
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={fechar} disabled={busy}>
            {sujo ? "Cancelar" : "Fechar"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={salvar}
            disabled={busy || !sujo}
            title={sujo ? "Gravar as alterações" : "Nada alterado"}
          >
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      <div className={`board-setup${aba === "card" ? "" : " board-setup-solo"}`}>
        <div className="board-setup-controls">
          {/*
            Abas, e não as duas listas empilhadas: juntas passavam de mil pixels
            de altura, e a prévia — que é o ponto desta tela — saía da vista
            justamente enquanto se mexia nos interruptores lá embaixo.
          */}
          {/*
            Alternador do design system, e não `role="tab"`.
            
            `.btn-toggle` pinta o ativo por `aria-pressed`, e trocar isso por
            `aria-selected` apagava a aba escolhida. É também o papel certo: sem
            `tabpanel` e `aria-controls`, `role="tab"` seria metade do padrão —
            e meia implementação de acessibilidade confunde mais que nenhuma.
            Mesmo idioma do alternador de visão em `TopBar`.
          */}
          <div
            role="group"
            aria-label="Preferências do quadro"
            style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}
          >
            {ABAS.map((t) => {
              const Icon = t.icon;
              const ativa = aba === t.id;
              const pendente =
                (t.id === "etapas" && sujoEtapas) ||
                (t.id === "card" && sujoCard) ||
                (t.id === "painel" && sujoPainel);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={ativa}
                  onClick={() => setAba(t.id)}
                >
                  <Icon size={14} />
                  {t.label}
                  {/* O ponto diz que há alteração na aba que não está à vista —
                      sem ele, o Salvar gravaria algo que ninguém está vendo. */}
                  {pendente && (
                    <span
                      aria-label="alterações pendentes"
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--primary)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/*
            As duas seções ficam MONTADAS o tempo todo, e a escondida apenas some
            da vista. Desmontar a aba inativa descartaria o rascunho dela — quem
            mexesse nas etapas, fosse ver os selos e voltasse, encontraria o
            trabalho desfeito sem nenhum aviso.
          */}
          {/*
            A aba do formulário NÃO fica montada junto com as outras.

            As três de baixo guardam rascunho, e desmontá-las jogaria fora o que
            alguém digitou ao trocar de aba. Esta grava no clique, então não tem
            o que perder — e tem o que ganhar: montada o tempo todo, ela dispara
            a recarga do quadro (`onChanged`) a partir de uma tela que ninguém
            está vendo, e o formulário de criar campo fica de pé por trás das
            outras abas com o rascunho de quem desistiu.
          */}
          {aba === "formulario" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <FormSection
                boardId={boardId}
                fields={fields}
                builtins={perguntas}
                onBuiltins={receberPerguntas}
                onChanged={onChanged}
              />
            </div>
          )}

          <div
            hidden={aba !== "etapas"}
            /* `display` inline junto do `hidden`: o atributo sozinho é vencido
               por qualquer regra de CSS que declare `display` para a caixa, e o
               sintoma seria as duas listas aparecendo empilhadas de novo. */
            style={{ display: aba === "etapas" ? "flex" : "none", flexDirection: "column", gap: "0.9rem" }}
          >
            <ColumnsSection
              ref={etapas}
              open={open}
              boardId={boardId}
              columns={columns}
              groups={groups}
              onChanged={onChanged}
              onSujo={avisarEtapas}
            />
          </div>

          <div
            hidden={aba !== "card"}
            style={{ display: aba === "card" ? "flex" : "none", flexDirection: "column", gap: "0.9rem" }}
          >
            <CardFaceSection
              ref={card}
              open={open}
              boardId={boardId}
              badges={badges}
              builtins={perguntas}
              fields={fields}
              onChanged={onChanged}
              onSujo={avisarCard}
              onDraft={receberRascunho}
            />
          </div>

          <div
            hidden={aba !== "painel"}
            style={{ display: aba === "painel" ? "flex" : "none", flexDirection: "column", gap: "0.9rem" }}
          >
            <CardPanelSection
              ref={painel}
              open={open}
              boardId={boardId}
              panel={panel}
              builtins={perguntas}
              fields={fields}
              onChanged={onChanged}
              onSujo={avisarPainel}
            />
          </div>
        </div>

        {aba === "card" && (
        <aside className="board-setup-preview" aria-label="Prévia do card">
          <span className="field-label">Prévia</span>

          {/*
            `aria-hidden` porque é ilustração: quem navega por leitor de tela já
            ouviu cada interruptor com o seu nome, e ouvir de novo o card inteiro
            a cada mudança seria ruído, não informação.
          */}
          <div className="board-setup-preview-stage" aria-hidden="true">
            <div style={estiloDoCard("ALTA", { estatico: true })}>
              <CardFace
                card={exemplo}
                column={columns[0] ?? { name: "A fazer", color: "var(--muted)" }}
                people={people}
                fields={rascunhoCard.campos}
                badges={rascunhoCard.badges}
                builtins={perguntas}
                pecas={12}
              />
            </div>
          </div>

          <span className="field-hint">
            Um card de exemplo, desenhado pelo mesmo componente do quadro. Ele responde
            aos interruptores na hora — o que aparece aqui é o que vai aparecer lá.
          </span>
        </aside>
        )}
      </div>
    </Modal>
  );
}

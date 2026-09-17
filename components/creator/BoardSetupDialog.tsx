"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Columns3, LayoutGrid } from "lucide-react";
import Modal from "@/components/Modal";
import ColumnsSection, { type ColumnDefinition } from "./ColumnsSection";
import CardFaceSection, { exemploDeRespostas } from "./CardFaceSection";
import CardFace, { estiloDoCard } from "./CardFace";
import { type FieldDefinition } from "./FieldInput";
import { type CardData } from "./CardDialog";
import type { PersonOption } from "./DemandDialog";
import { type SecaoHandle } from "./useRascunho";
import { type CardBadgeKey, type GroupDefinition } from "@/lib/kanban";

/**
 * Como este quadro se comporta — as etapas e a cara do card, numa janela só.
 *
 * Eram dois botões e dois diálogos, e a separação não correspondia a nada: quem
 * abre um está ajustando o quadro, e quase sempre abria o outro em seguida —
 * criar uma etapa e decidir o que o card mostra nela são o mesmo ato de
 * arrumação, feito em duas janelas porque o código estava em dois arquivos.
 *
 * Cada seção continua dona do próprio rascunho e da própria gravação: são
 * destinos diferentes no servidor (a etapa é uma linha de coluna, a cara do card
 * é do quadro e de cada campo). O que se unificou foi a PERGUNTA, e por isso o
 * Salvar é um só — ele grava o que cada seção tiver pendente.
 *
 * A prévia é o ponto da tela. Antes se escolhia o que o card mostra lendo uma
 * lista de nomes de selo e imaginando o resultado; agora o card de exemplo está
 * ao lado e reage ao interruptor antes de qualquer gravação. E é o card DE
 * VERDADE — `CardFace`, o mesmo componente que o quadro desenha —, porque uma
 * imitação envelheceria no primeiro selo novo e passaria a mentir justamente
 * para quem está decidindo olhando para ela.
 */

type Aba = "etapas" | "card";

const ABAS: { id: Aba; label: string; icon: typeof Columns3 }[] = [
  { id: "etapas", label: "Etapas", icon: Columns3 },
  { id: "card", label: "O que o card mostra", icon: LayoutGrid },
];

export default function BoardSetupDialog({
  open,
  onClose,
  boardId,
  columns,
  groups,
  badges,
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
  fields: FieldDefinition[];
  /** Para o crachá da prévia mostrar gente de verdade, e não um nome inventado. */
  people: PersonOption[];
  onChanged: () => void;
}) {
  const etapas = useRef<SecaoHandle>(null);
  const card = useRef<SecaoHandle>(null);
  const [busy, setBusy] = useState(false);
  const [aba, setAba] = useState<Aba>("etapas");

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
  const [rascunhoCard, setRascunhoCard] = useState<{
    badges: CardBadgeKey[];
    campos: FieldDefinition[];
  }>({ badges, campos: fields });

  const avisarEtapas = useCallback((v: boolean) => setSujoEtapas(v), []);
  const avisarCard = useCallback((v: boolean) => setSujoCard(v), []);
  const receberRascunho = useCallback(
    (d: { badges: CardBadgeKey[]; campos: FieldDefinition[] }) => setRascunhoCard(d),
    []
  );

  const sujo = sujoEtapas || sujoCard;

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
      title="Etapas e cards"
      description="Por onde a demanda passa, e o que o card mostra sem precisar ser aberto."
      width="min(1040px, 100%)"
      footer={
        <>
          {sujo && (
            <span className="field-hint" style={{ marginRight: "auto" }}>
              Alterações pendentes nas duas abas são gravadas juntas.
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
      <div className="board-setup">
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
              const pendente = t.id === "etapas" ? sujoEtapas : sujoCard;
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
              fields={fields}
              onChanged={onChanged}
              onSujo={avisarCard}
              onDraft={receberRascunho}
            />
          </div>
        </div>

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
                pecas={12}
              />
            </div>
          </div>

          <span className="field-hint">
            Um card de exemplo, desenhado pelo mesmo componente do quadro. Ele responde
            aos interruptores na hora — o que aparece aqui é o que vai aparecer lá.
          </span>
        </aside>
      </div>
    </Modal>
  );
}

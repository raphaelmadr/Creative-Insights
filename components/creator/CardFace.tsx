"use client";

import React, { useMemo } from "react";
import { Clock, Link2, PackageCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type CardData } from "./CardDialog";
import type { PersonOption } from "./DemandDialog";
import {
  parseValues,
  plainSummary,
  clampText,
  isOverdue,
  ordenarCampos,
  parseAssignees,
  fonteDoBadge,
  origemDoCard,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  type CardBadgeKey,
  type FormBuiltinKey,
  type Priority,
  formatCardCode,
  unidadeDoCampo,
} from "@/lib/kanban";
import { titleShowsPieceCount } from "@/lib/copy-options";
import { parseAttachments } from "@/lib/attachments";
import { describeCardLink } from "@/lib/card-link";
import AttachmentGallery from "./AttachmentGallery";

/**
 * A FRENTE de um card, e nada mais.
 *
 * Saiu de dentro do quadro para poder ser desenhada em dois lugares: na coluna,
 * arrastável, e na prévia do diálogo de preferências, onde alguém decide o que
 * o card mostra.
 *
 * A prévia tinha que ser o card DE VERDADE, e não uma imitação. Uma cópia do
 * desenho numa tela de configuração envelhece no primeiro selo novo — e passa a
 * mentir exatamente para quem está tentando decidir, olhando para ela, o que
 * ligar e o que desligar.
 *
 * Por isso aqui não há arrasto, clique nem seleção: o que é comportamento do
 * quadro fica no quadro, e o que é aparência fica aqui, igual nos dois.
 */

/** A moldura do card. Exportada para a prévia usar a mesma, sem copiá-la. */
export function estiloDoCard(
  priority: Priority,
  opcoes: { arrastando?: boolean; estatico?: boolean } = {}
): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    padding: "0.5rem 0.55rem",
    borderRadius: "var(--radius-block)",
    background: "var(--surface-sunken)",
    border: "1px solid var(--surface-sunken-border)",
    borderLeft: `3px solid ${PRIORITY_COLOR[priority]}`,
    cursor: opcoes.estatico ? "default" : "grab",
    opacity: opcoes.arrastando ? 0.5 : 1,
    transition: "opacity 0.2s ease, border-color 0.2s ease",
  };
}

/** O texto corrido do card: duas linhas, com reticência no corte. */
const TEXTO_DO_CARD: React.CSSProperties = {
  fontSize: "var(--text-eyebrow)",
  color: "var(--muted)",
  lineHeight: 1.4,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

export default function CardFace({
  card,
  column,
  people,
  fields,
  badges,
  builtins,
  pecas,
}: {
  card: CardData;
  /** A etapa onde o card está — o selo de etapa mostra o nome e a cor dela. */
  column: { name: string; color?: string | null };
  people: PersonOption[];
  /** Todos os campos do quadro; só os marcados como visíveis são desenhados. */
  fields: FieldDefinition[];
  badges: CardBadgeKey[];
  /** As perguntas de nascença que o quadro faz. Ver `parseFormBuiltins`. */
  builtins: FormBuiltinKey[];
  /** Quantas variações de copy há dentro — 0 quando não é card do gerador. */
  pecas: number;
}) {
  /*
   * O que o quadro escolheu mostrar, menos o que ele deixou de perguntar.
   *
   * O filtro mora AQUI, e não só na tela de preferências, porque os dois
   * precisam concordar. Filtrando só lá, um selo ligado antes de a pergunta ser
   * desligada sumiria da lista e continuaria no card — visível, e sem nenhum
   * interruptor no sistema capaz de apagá-lo.
   *
   * O que está gravado continua gravado: voltar a fazer a pergunta devolve o
   * selo exatamente como ele estava.
   */
  const shows = useMemo(() => {
    const perguntadas = new Set(builtins);
    return new Set(
      badges.filter((b) => {
        const fonte = fonteDoBadge(b);
        return !fonte || perguntadas.has(fonte);
      })
    );
  }, [badges, builtins]);

  /*
   * Texto e pílula se separam porque ocupam lugares diferentes: o escrito à
   * mão vai em linha própria, e o de valor fechado entra na fileira de selos.
   */
  /* Ordenados como o formulário os pergunta — um condicional marcado para
     aparecer na frente do card fica junto da pergunta que o revela, e não
     solto no fim, onde a posição gravada o deixaria. */
  const frontFields = useMemo(
    () => ordenarCampos(fields).filter((f) => f.showOnCard),
    [fields]
  );
  const camposDeTexto = useMemo(
    () => frontFields.filter((f) => f.type === "TEXT" || f.type === "TEXTAREA"),
    [frontFields]
  );
  const camposEmPilula = useMemo(
    () => frontFields.filter((f) => f.type !== "TEXT" && f.type !== "TEXTAREA"),
    [frontFields]
  );

  const values = parseValues(card.values);
  /*
    Vários responsáveis: no backlog a demanda é do time inteiro, e
    só vira de uma pessoa quando alguém a puxa para produção.
  */
  const donos = parseAssignees(card.assignees).map(
    (e) => people.find((c) => c.email === e) ?? { email: e, name: e, avatarUrl: null }
  );
  const resumo = clampText(plainSummary(card.description));
  const priority = (card.priority as Priority) || "MEDIA";
  
  // Um prazo vencido precisa saltar aos olhos no quadro, não só
  // dentro do card — é a informação que muda o que se faz agora.
  const due = card.dueDate ? new Date(card.dueDate) : null;
  const late = !card.completedAt && isOverdue(card.dueDate);
  const anexos = parseAttachments(card.attachments);
  const origem = origemDoCard(card.origin);
  const link = describeCardLink(card.linkUrl);
  const entrega = describeCardLink(card.deliveryUrl);

  return (
    <>
      {/* O número antes do título, e numa linha própria: é por ele
          que a demanda é citada no Slack, na notificação e na
          conversa, então precisa ser lido sem competir com o texto
          que descreve o trabalho. */}
      {shows.has("code") && formatCardCode(card.code) && (
        <span
          style={{
            fontSize: "var(--text-eyebrow)",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatCardCode(card.code)}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem" }}>
        {/*
          Sem marca de origem na FRENTE do card.
          
          Havia uma varinha para o card do gerador de copy, e ela custava mais
          do que rendia: um símbolo azul sem legenda, que só quem já conhecia o
          gerador sabia ler, ocupando o começo da linha do título em todo card
          vindo dele. A origem continua dita onde ela ajuda a interpretar o que
          se está lendo — a linha de procedência do card aberto. Ver
          `ORIGIN_LABEL`.
        */}
        {shows.has("title") ? (
          <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-control)", fontWeight: 600, lineHeight: 1.35 }}>
            {card.title}
          </span>
        ) : (
          // Segura a largura para o selo de peças continuar à direita, como
          // faz o rodapé quando só um dos dois lados está ligado.
          <span style={{ flex: 1, minWidth: 0 }} />
        )}

        {/* Quantas peças de texto há para produzir ali dentro — a
            diferença entre uma demanda e doze não deveria exigir
            abrir o card.

            Sem interruptor: isto não vem de pergunta nenhuma, vem do gerador
            de copy, e um card que não nasceu dele nunca o mostra. Os cards
            criados pelo gerador já dizem a contagem no título ("… • 12
            Peças"); o selo é para os de antes do formato, e não aparece duas
            vezes no mesmo card. */}
        {pecas > 1 && !titleShowsPieceCount(card.title, pecas) && (
          <span
            title={`${pecas} variações de copy`}
            style={{
              flexShrink: 0,
              fontSize: "var(--text-eyebrow)",
              fontWeight: 600,
              padding: "0.1rem 0.4rem",
              borderRadius: "var(--radius-pill)",
              background: "var(--primary-glow)",
              color: "var(--primary)",
            }}
          >
            {pecas}×
          </span>
        )}
      </div>

      {/*
        O briefing, encurtado a duas linhas.

        Card não é lugar de ler briefing — é lugar de reconhecer a
        demanda. Duas linhas bastam para saber se é aquela que se
        procura; o resto está a um clique. Por isso vem desligado por
        padrão: ligado sem querer, ele triplica a altura de todos os
        cards de uma vez.
      */}
      {shows.has("briefing") && resumo && (
        <span style={TEXTO_DO_CARD}>{resumo}</span>
      )}

      {/*
        As respostas escritas à mão, como texto.

        Com o rótulo do campo à frente em negrito: sem ele, dois
        campos de texto seguidos viram um parágrafo só, e não há como
        saber onde um termina e o outro começa.
      */}
      {camposDeTexto.map((field) => {
        const value = values[field.key];
        if (value === undefined || value === null || value === "") return null;
        return (
          <span key={field.id} style={TEXTO_DO_CARD}>
            <strong style={{ fontWeight: 600 }}>{field.label}:</strong>{" "}
            {clampText(String(value))}
          </span>
        );
      })}

      {/*
        A fila de mini-badges.

        Os quatro atributos embutidos — urgência, prazo, responsável
        e etapa — saem da configuração do quadro, e as respostas do
        formulário, do `showOnCard` de cada campo. Numa linha só, e
        não uma por grupo: a diferença entre um card de três linhas e
        um de cinco é quantos cabem na tela sem rolar.
      */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.2rem",
        }}
      >
        {shows.has("dueDate") && due && (
          <span
            className="card-badge"
            title={
              late
                ? `Prazo vencido em ${due.toLocaleDateString("pt-BR")}`
                : `Prazo: ${due.toLocaleDateString("pt-BR")}`
            }
            // O prazo vencido também pinta a borda: entre doze cards
            // cinzas, texto vermelho de 0,65rem passa batido.
            style={
              late
                ? { color: "var(--danger)", borderColor: "var(--danger)", fontWeight: 600 }
                : undefined
            }
          >
            <Clock size={10} />
            {due.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        )}

        {shows.has("stage") && (
          <span className="card-badge" title={`Etapa: ${column.name}`}>
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "var(--radius-pill)",
                background: column.color || "var(--muted)",
                flexShrink: 0,
              }}
            />
            {column.name}
          </span>
        )}

        {/*
          Quem escreveu o que está no card: uma pessoa ou a máquina.

          Antes havia uma varinha azul nos cards do gerador e nada nos demais —
          símbolo sem legenda, e a ausência dele não dizia nada. Como selo
          escrito, a distinção se lê sem decorar ícone; e como selo, ela é
          escolha de quem configura o quadro, não do código.

          Duas respostas, não três: o link público é um formulário. Ver
          `ORIGIN_LABEL`.
        */}
        {shows.has("origin") && origem && (
          <span className="card-badge" title={`Origem: ${origem}`}>
            {origem}
          </span>
        )}

        {/*
          O link não é um badge como os outros: os demais informam, e
          este leva a algum lugar. Por isso é uma âncora de verdade —
          abre em aba nova, aparece no menu de contexto, dá para
          copiar — e não um `span` com `onClick`. Na cor da marca,
          lavada, para se distinguir da fileira cinza sem gritar.
        */}
        {shows.has("link") && link && card.linkUrl && (
          <a
            href={card.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="card-badge"
            title={`Abrir ${link.label}${link.detail ? ` · ${link.detail}` : ""}`}
            // O card inteiro é um botão que abre o painel da demanda:
            // sem parar o clique aqui, abrir a pasta abriria as duas
            // coisas ao mesmo tempo.
            onClick={(e) => e.stopPropagation()}
            style={{
              fontWeight: 600,
              color: link.isDrive ? "#4285F4" : "var(--primary)",
              borderColor: link.isDrive ? "rgba(66,133,244,0.38)" : "var(--primary)",
              background: link.isDrive ? "rgba(66,133,244,0.12)" : "var(--primary-glow)",
            }}
          >
            <Link2 size={10} />
            {link.isDrive ? "Drive" : link.label}
          </a>
        )}

        {/*
          O que foi entregue nesta demanda.

          Vem depois do link de referência, e verde e não azul, porque a
          leitura do card vai do insumo ao resultado: o azul é o que entrou
          com o pedido, o verde é o que saiu do trabalho. Antes os dois
          disputavam a mesma coluna do banco e o mesmo selo, e a entrega
          apagava a referência ao ser concluída.

          Âncora de verdade pelo mesmo motivo do vizinho: leva a algum lugar,
          e o clique não pode abrir o painel do card junto.
        */}
        {shows.has("delivery") && entrega && card.deliveryUrl && (
          <a
            href={card.deliveryUrl}
            target="_blank"
            rel="noreferrer"
            className="card-badge"
            title="Abrir o que foi entregue nesta demanda"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontWeight: 600,
              color: "var(--primary)",
              borderColor: "var(--primary)",
              background: "var(--primary-glow)",
            }}
          >
            <PackageCheck size={10} />
            Entrega
          </a>
        )}

        {/* O clipe, pelo mesmo motivo do selo de peças: o anexo chega pelo
            gerador de copy, não por pergunta de formulário. `AttachmentGallery`
            já devolve nada quando a lista está vazia — o card de uma demanda
            comum não desenha clipe nenhum. */}
        <AttachmentGallery attachments={anexos} variant="badge" />

        {/*
          As respostas de valor fechado, como pílula.

          Uma escolha múltipla vira uma pílula por escolha, e não uma
          pílula com "Feed 1:1, Story/Reels 9:16" dentro: a lista
          colada não cabe na largura da coluna, e o que se perde no
          corte é justamente a segunda escolha.

          Escolha e link se explicam sozinhos — "Meta Ads" é "Meta
          Ads". Data, número e sim/não não: "12" não diz nada sem o
          nome do campo na frente.
        */}
        {camposEmPilula.flatMap((field) => {
          const value = values[field.key];
          if (value === undefined || value === null || value === "") return [];

          if (field.type === "MULTISELECT" && Array.isArray(value)) {
            return value.filter(Boolean).map((escolha, i) => (
              <span
                key={`${field.id}-${i}`}
                className="card-badge"
                title={`${field.label}: ${String(escolha)}`}
              >
                {String(escolha)}
              </span>
            ));
          }

          if (field.type === "URL") {
            const destino = describeCardLink(String(value));
            return [
              <a
                key={field.id}
                href={String(value)}
                target="_blank"
                rel="noreferrer"
                className="card-badge"
                title={`${field.label}: ${value}`}
                // O card inteiro abre o painel da demanda: sem parar
                // o clique aqui, os dois aconteceriam juntos.
                onClick={(e) => e.stopPropagation()}
                style={{ fontWeight: 600, color: "var(--primary)" }}
              >
                <Link2 size={10} />
                {destino?.label ?? field.label}
              </a>,
            ];
          }

          /*
            Quantidade vira "9 peças", e não "Número de peças: 9".

            O selo é lido de relance numa coluna estreita: com o rótulo inteiro
            na frente, "Número de peças" ocupa a pílula e empurra o algarismo —
            a única parte que muda de card para card — para o corte. E a unidade
            concorda com o número, senão o card de uma peça diria "1 peças".
          */
          if (field.type === "RANGE") {
            const n = Number(value);
            return [
              <span
                key={field.id}
                className="card-badge"
                title={`${field.label}: ${formatFieldValue(field, value)}`}
              >
                {formatFieldValue(field, value)} {unidadeDoCampo(field.label, n)}
              </span>,
            ];
          }

          const precisaDoRotulo =
            field.type === "DATE" || field.type === "NUMBER" || field.type === "CHECKBOX";

          return [
            <span
              key={field.id}
              className="card-badge"
              title={`${field.label}: ${formatFieldValue(field, value)}`}
            >
              {precisaDoRotulo ? `${field.label}: ` : ""}
              {formatFieldValue(field, value)}
            </span>,
          ];
        })}
      </div>

      {/*
        Quem assumiu fica sempre no mesmo canto — embaixo, à direita.

        Antes o crachá vinha no meio da fileira que quebra linha, e a
        posição dele mudava de card para card conforme o que viesse
        antes: com prazo e link, descia; sem eles, subia. Procurar
        "o que é meu" numa coluna virava ler card por card. Num lugar
        fixo, a mesma varredura é uma olhada na borda direita.
      */}
      {/*
        O rodapé do card: urgência à esquerda, responsável à direita.

        A urgência vinha na fileira que quebra linha, e a posição dela mudava de
        card para card conforme o que viesse antes — num quadro de doze cards, a
        pergunta "o que é urgente aqui?" virava ler card a card. Num canto fixo,
        a mesma varredura é uma olhada na borda esquerda.

        E destacada, não só colorida: entre selos cinzas de contorno, texto
        colorido de 0,65rem some. É o mesmo motivo pelo qual o prazo vencido
        também pinta a borda.

        O realce é fundo LAVADO com o texto na própria cor, e não fundo cheio
        com texto branco: branco sobre `--warning` (#F59E0B) dá contraste de
        ~2:1, e "ALTA" — a urgência que mais precisa ser lida — seria justamente
        a menos legível. Assim a cor mantém o contraste que ela já tem hoje
        como texto, e o fundo só a destaca. Mesmo idioma de `--primary-glow`.

        O rodapé existe se qualquer um dos dois estiver ligado — com um só, ele
        vai para o seu canto e o outro lado fica vazio, que é o comportamento
        certo de `space-between`.
      */}
      {(shows.has("priority") || shows.has("assignee")) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.4rem",
            marginTop: "0.1rem",
          }}
        >
          {shows.has("priority") ? (
            <span
              title={`Prioridade ${PRIORITY_LABEL[priority]}`}
              style={{
                flexShrink: 0,
                fontSize: "var(--text-eyebrow)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                padding: "0.12rem 0.45rem",
                borderRadius: "var(--radius-pill)",
                // `color-mix` cai para transparente onde não houver suporte, e
                // o resultado é o selo de hoje — degrada sem quebrar.
                background: `color-mix(in srgb, ${PRIORITY_COLOR[priority]} 16%, transparent)`,
                border: `1px solid ${PRIORITY_COLOR[priority]}`,
                color: PRIORITY_COLOR[priority],
                lineHeight: 1.5,
              }}
            >
              {PRIORITY_LABEL[priority]}
            </span>
          ) : (
            // Ocupa o lugar para o responsável continuar à direita.
            <span />
          )}

          {shows.has("assignee") &&
            (donos.length ? (
            /*
              Até três crachás; acima disso, um contador.

              Seis nomes num card de 280px empurram o resto para fora
              da vista — e "todo o time da Criação" se lê melhor como
              "+3" do que como uma parede de avatares. O `title` traz
              a lista inteira.
            */
            <span
              className="card-badge"
              title={donos.map((d) => d.name).join(", ")}
              style={{ paddingLeft: "0.15rem", fontWeight: 600, gap: "0.2rem" }}
            >
              {donos.slice(0, 3).map((d) => (
                <Avatar
                  key={d.email}
                  name={d.name}
                  src={d.avatarUrl ?? undefined}
                  size="xs"
                />
              ))}
              {donos.length === 1
                ? donos[0].name.split(" ")[0]
                : donos.length > 3
                  ? `+${donos.length - 3}`
                  : null}
            </span>
            ) : (
              <span className="card-badge" title="Ninguém assumiu esta demanda">
                sem dono
              </span>
            ))}
        </div>
      )}
    </>
  );
}

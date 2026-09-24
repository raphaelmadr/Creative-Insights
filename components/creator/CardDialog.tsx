"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Trash2, Send, History, Copy as CopyIcon, Check, ChevronsDownUp, ChevronsUpDown, ArchiveRestore, Archive, PackageCheck, ChevronDown } from "lucide-react";
import Modal from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import FieldInput, { type FieldDefinition, formatFieldValue } from "./FieldInput";
import { type ColumnDefinition } from "./ColumnsSection";
import VariationCard from "./VariationCard";
import AttachmentGallery from "./AttachmentGallery";
import CardLinkField from "./CardLinkField";
import DeliveryUploadPanel from "./DeliveryUploadPanel";
import { parseCopyVariations } from "@/lib/copy-parse";
import { parseAttachments } from "@/lib/attachments";
import DatePicker from "@/components/DatePicker";
import { parseRawVideos, type RawVideo } from "@/lib/raw-videos";
import { RawVideoList } from "./RawVideoField";
import { describeCardLink } from "@/lib/card-link";
import { mencaoEmCurso, separarMencoes, sugestoesDeMencao } from "@/lib/mentions";
import type { PersonOption } from "./DemandDialog";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  camposVisiveis,
  limparRespostasOcultas,
  parseValues,
  parseAssignees,
  stageCandidates,
  ownershipOf,
  fonteDaSecao,
  origemDoCard,
  type CardPanelKey,
  type FormBuiltinKey,
  type GroupDefinition,
  formatCardCode,
} from "@/lib/kanban";

export interface CardData {
  id: string;
  /**
   * O número da demanda — "MKT-42" depois de `formatCardCode`.
   *
   * Nulo só nas demandas abertas antes da coluna existir; a tela desenha o selo
   * apenas quando há número, em vez de inventar um traço no lugar.
   */
  code: number | null;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  assignees: string | null;
  values: string | null;
  origin: string;
  copyText: string | null;
  /** JSON dos anexos — cru, como está no banco. Ver `parseAttachments`. */
  attachments: string | null;
  /** JSON dos vídeos brutos que subiram para o Drive. Ver `parseRawVideos`. */
  rawVideos: string | null;
  /** O link de referência — o material de apoio do pedido. Ver `lib/card-link.ts`. */
  linkUrl: string | null;
  /** O endereço do que foi entregue: a pasta criada pela automação, ou um
   *  link informado à mão. Nulo enquanto nada foi entregue. Ver
   *  `BoardCard.deliveryUrl`. */
  deliveryUrl: string | null;
  /**
   * A posição gravada dentro da etapa.
   *
   * Não é mais a ordem que se vê: a coluna ordena pelo critério dela (ver
   * `ordenarCardsDaEtapa`). Continua sendo o DESEMPATE — duas demandas com o
   * mesmo prazo precisam de uma ordem estável entre si, ou a lista embaralha
   * sozinha a cada renderização.
   */
  position: number;
  /** Fora do quadro: arquivada à mão ou pela regra de fim de mês. */
  archived: boolean;
  completedAt: string | null;
  createdAt: string;
  /** Última alteração. Num card arquivado, é quando ele saiu do quadro. */
  updatedAt: string;
}

interface Activity {
  id: string;
  type: string;
  message: string;
  authorName: string | null;
  createdAt: string;
}

/**
 * O verso do card: o briefing inteiro, a copy quando houver, e o histórico.
 *
 * O histórico é o que responde "por que isto demorou" sem ninguém precisar
 * lembrar: as idas e vindas entre etapas ficam registradas, e o comentário vive
 * ao lado delas na mesma linha do tempo — não numa aba separada, onde o que foi
 * dito perderia a relação com o que aconteceu.
 */
export default function CardDialog({
  card,
  fields,
  columns,
  groups,
  people,
  panel,
  builtins,
  onClose,
  onChanged,
}: {
  card: CardData | null;
  fields: FieldDefinition[];
  columns: ColumnDefinition[];
  /** As fases — é nelas que a equipe mora. Ver `ownershipOf`. */
  /*
   * Obrigatórias, sem valor padrão, e de propósito.
   *
   * `groups` já tinha um `= []` e a página nunca o passava: o painel oferecia
   * TODA a lista de pessoas em vez da equipe do grupo, e a dica que diz de quem
   * é a etapa nunca aparecia — sem erro, sem aviso, sem nada na tela indicando
   * que faltava informação. Um valor padrão aqui compra silêncio no lugar de um
   * erro de compilação, e o silêncio é mais caro.
   */
  groups: GroupDefinition[];
  people: PersonOption[];
  /**
   * Quais seções este quadro mostra no painel. Ver `parseCardPanel`.
   *
   * Sem valor padrão, pelo mesmo motivo de `groups` logo acima: um `= DEFAULT`
   * aqui faria a tela que esqueceu de passar a configuração mostrar tudo, em
   * silêncio, e o defeito só apareceria para quem tivesse desligado alguma
   * coisa — que é justamente quem pediu o contrário.
   */
  panel: CardPanelKey[];
  /** As perguntas de nascença do quadro — ver `mostra`. */
  builtins: FormBuiltinKey[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  /** O histórico começa fechado — ver o comentário na seção. */
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [comment, setComment] = useState("");

  /*
   * A menção em curso no campo de comentário.
   *
   * O que decide se a lista aparece é o texto ANTES do cursor — daí guardar a
   * posição dele: escrever "@ana" no meio de uma frase já escrita tem de abrir
   * a lista igual, e sem a posição o campo só saberia o fim do texto.
   *
   * `mencaoDispensada` é o Esc: fecha a lista sem apagar o que foi digitado, e
   * some sozinho na próxima arroba.
   */
  const campoDeComentario = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const [mencaoDispensada, setMencaoDispensada] = useState(false);
  const [sugestaoAtiva, setSugestaoAtiva] = useState(0);

  const mencaoAberta = mencaoDispensada ? null : mencaoEmCurso(comment, cursor);
  const sugestoes = mencaoAberta ? sugestoesDeMencao(mencaoAberta.termo, people) : [];

  /** Troca o `@parcial` pelo nome inteiro e deixa o cursor depois dele. */
  const inserirMencao = (pessoa: PersonOption) => {
    if (!mencaoAberta) return;
    const antes = comment.slice(0, mencaoAberta.inicio);
    const depois = comment.slice(cursor);
    const novoCursor = antes.length + pessoa.name.length + 2; // "@" + nome + espaço

    setComment(`${antes}@${pessoa.name} ${depois}`);
    setSugestaoAtiva(0);

    /*
     * O cursor é reposicionado depois que o React reescreve o valor do campo —
     * antes disso ele salta para o fim do texto, e quem mencionou alguém no
     * meio da frase continuaria digitando lá no final.
     */
    requestAnimationFrame(() => {
      const campo = campoDeComentario.current;
      if (!campo) return;
      campo.focus();
      campo.setSelectionRange(novoCursor, novoCursor);
      setCursor(novoCursor);
    });
  };

  /**
   * As respostas em edição — o rascunho de quem está FAZENDO a demanda.
   *
   * O painel mostrava o que foi respondido como texto cru, e isso tratava a
   * abertura como palavra final: na prática a data escorrega, a quantidade de
   * peças muda depois da primeira conversa, e quem descobre isso é quem está
   * produzindo — não quem abriu o pedido e já foi cuidar de outra coisa. Sem
   * onde corrigir, o card passava a mentir, e a correção virava um comentário
   * no acompanhamento que ninguém relê.
   *
   * Rascunho e não gravação a cada tecla: um campo de texto longo mandaria uma
   * requisição por letra digitada. O `Salvar` aparece quando há o que salvar.
   */
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});

  /*
   * Os vídeos brutos têm estado local porque a lista muda sem o card recarregar:
   * subir um vídeo é uma requisição própria, e esperar o quadro inteiro voltar
   * do servidor deixaria o painel dizendo "nenhum vídeo" logo depois de um
   * envio que a pessoa acabou de acompanhar até 100%.
   */
  const [videos, setVideos] = useState<RawVideo[]>(() => parseRawVideos(card?.rawVideos));
  const vistoRawVideos = useRef(card?.rawVideos);
  if (vistoRawVideos.current !== card?.rawVideos) {
    vistoRawVideos.current = card?.rawVideos;
    setVideos(parseRawVideos(card?.rawVideos));
  }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Quais variações estão abertas, por índice.
   *
   * Todas recolhidas no início: o painel do card já carrega contexto, briefing e
   * acompanhamento, e doze variações abertas empurrariam o histórico para dois
   * mil pixels abaixo. Recolhido, cada linha ainda mostra ângulo e headline —
   * dá para achar a que interessa sem abrir uma por uma.
   */
  const [openVariations, setOpenVariations] = useState<Set<number>>(new Set());

  /*
   * Um BOOLEANO, e não a lista, porque ele entra nas dependências do
   * `useCallback` logo abaixo.
   *
   * `panel` chega como array novo a cada renderização da página — é o resultado
   * de `parseCardPanel`, refeito toda vez. Nas dependências, ele recriaria
   * `loadActivities` sempre, e o efeito que a chama recarregaria o histórico em
   * laço, apagando o comentário meio escrito a cada volta.
   */
  const mostraHistorico = panel.includes("activity");

  const loadActivities = React.useCallback(async () => {
    if (!card) return;
    // Quadro sem acompanhamento não busca histórico: seria uma requisição por
    // card aberto para preencher uma seção que não vai ao ar.
    if (!mostraHistorico) return;
    try {
      const res = await fetch(`/api/creator/cards?cardId=${card.id}`);
      const data = await res.json();
      if (res.ok) setActivities(data.activities || []);
    } catch {
      // O histórico é complemento: se não carregar, o briefing ainda se lê.
      setActivities([]);
    }
  }, [card, mostraHistorico]);

  useEffect(() => {
    setComment("");
    setError(null);
    setCopied(false);
    setOpenVariations(new Set());
    loadActivities();
  }, [loadActivities]);

  /*
   * O rascunho parte do que está gravado, e volta a partir dele a cada recarga.
   *
   * Ajuste na RENDERIZAÇÃO, e não num efeito — mesmo idioma de `useRascunho`:
   * num efeito, o painel apareceria uma vez com as respostas velhas e as
   * corrigiria no quadro seguinte, o que se vê como um piscar depois de salvar.
   *
   * A régua é a identidade do card, e ela serve porque `openCard` é estado da
   * página: só troca quando o card é aberto ou quando a recarga traz uma versão
   * nova dele. Não atropela quem está digitando — a página suspende a
   * conferência periódica enquanto há diálogo aberto, então a troca só acontece
   * depois de uma gravação, que é quando o servidor passa a ser a verdade.
   */
  const [cardVisto, setCardVisto] = useState(card);
  if (card !== cardVisto) {
    setCardVisto(card);
    setRespostas(card ? parseValues(card.values) : {});
  }

  if (!card) return null;

  const values = parseValues(card.values);

  /**
   * Se este quadro mostra esta seção do painel.
   *
   * Duas condições, e a segunda é a regra do módulo: a seção precisa estar
   * ligada E ter de onde tirar valor. O formulário é a base — o que o quadro
   * não pergunta, o card não tem o que mostrar —, e a tela de preferências
   * omite a linha da seção sem fonte. Sem a segunda condição aqui, uma seção
   * ligada antes de a pergunta ser desligada continuaria no painel sem
   * interruptor nenhum capaz de tirá-la.
   *
   * Cada seção continua sumindo sozinha quando não há o que pôr nela: um card
   * sem copy não abre a seção de copy só porque o quadro a tem ligada.
   */
  const mostra = (secao: CardPanelKey) => {
    if (!panel.includes(secao)) return false;
    const fonte = fonteDaSecao(secao);
    return !fonte || builtins.includes(fonte);
  };

  /*
   * A etapa ATUAL do card é de produção? Não é resposta de formulário — é
   * uma marca da etapa, lida na coluna que a demanda ocupa agora. `card` só
   * carrega o `columnId`; a marca vem de `columns`, que o quadro já entrega
   * como prop própria — buscar aqui, na hora de desenhar, fica sempre certo
   * mesmo logo depois de um arrasto, sem precisar duplicar a informação no
   * card.
   */
  const emProducao = columns.find((c) => c.id === card.columnId)?.isProduction === true;

  /*
   * A entrega já está FECHADA?
   *
   * Em produção, o bloco da entrega é informação: o painel de envio está logo
   * abaixo e o trabalho ainda acontece. Fora dela, a demanda já saiu — e quem
   * abre o card precisa ver isso antes de ler qualquer outra coisa, em vez de
   * deduzir pela etapa em que o card está.
   */
  const entregaFechada = !!card.deliveryUrl && !emProducao;
  /** Para onde a entrega aponta — Drive, Figma, um domínio qualquer. */
  const destinoDaEntrega = card.deliveryUrl ? describeCardLink(card.deliveryUrl) : null;

  /*
   * Os dois lados do bloco de briefing, cada um com o seu interruptor.
   *
   * Um só fazia os dois trabalhos, e desligá-lo levava junto todas as respostas
   * do formulário — sem que o nome dele ("Briefing") desse qualquer pista de
   * que era isso que ia acontecer.
   */
  const textoDoBriefing = mostra("briefing") && !!card.description;
  const respostasDoFormulario = mostra("answers") && fields.length > 0;

  /*
   * O que mudou no rascunho, e só isso.
   *
   * Manda o diff, e não o conjunto inteiro: o servidor funde o recebido com o
   * que já está gravado (ver a rota de cards), e mandar tudo reescreveria
   * respostas que ninguém tocou — inclusive as de um campo que outra pessoa
   * acabou de alterar na aba dela.
   */
  const alteradas = Object.fromEntries(
    Object.entries(respostas).filter(
      ([chave, valor]) => JSON.stringify(valor) !== JSON.stringify(values[chave])
    )
  );
  const temAlteracao = Object.keys(alteradas).length > 0;

  /**
   * Muda uma resposta no rascunho — e zera os filhos dela.
   *
   * A mesma regra do formulário de abertura: trocar "Canal" tem de limpar
   * "Formato", senão fica gravada uma combinação que o novo canal não aceita —
   * invisível na tela, porque a opção nem aparece mais, e recusada só lá no fim
   * pelo servidor.
   */
  const responder = (field: FieldDefinition, valor: unknown) =>
    setRespostas((atual) => {
      const proximo = { ...atual, [field.key]: valor };
      for (const outro of fields) {
        if (outro.dependsOn === field.key) delete proximo[outro.key];
      }
      /*
       * E some do rascunho o que esta resposta escondeu.
       *
       * Some só da TELA: o diff daqui não sabe dizer "apague isto", e quem
       * apaga de verdade é o servidor, que ao gravar percorre apenas os campos
       * visíveis (ver `validateValues`). São os dois lados da mesma regra — a
       * tela para de perguntar, o banco para de guardar.
       */
      return limparRespostasOcultas(fields, proximo);
    });

  /*
   * A copy do card, quebrada em variações. Vazio quando o texto não segue o
   * formato — copy escrita à mão, ou saída de um provedor que respondeu fora do
   * padrão. Nesse caso o markdown continua sendo renderizado como antes, em vez
   * de a copy sumir da tela.
   */
  const variations = card.copyText ? parseCopyVariations(card.copyText) : [];
  const anexos = parseAttachments(card.attachments);

  /*
   * O mesmo painel serve ao card do quadro e ao card arquivado — um segundo
   * visualizador só para o arquivo divergiria do primeiro na primeira mudança, e
   * quem abre um card arquivado quer ver exatamente o que via antes: briefing,
   * copy, referências e histórico. O que muda é que nada disso se edita, e o
   * botão de arquivar dá lugar ao de tirar do arquivo.
   */
  const arquivado = card.archived;
  const travado = busy || arquivado;

  /*
   * A etapa onde o card está — é ela que diz quem pode assumi-lo.
   *
   * Quem já é dono entra na lista mesmo estando fora da equipe: pode ter
   * assumido antes de a regra existir, ou ter mudado de time depois. Sem isso o
   * seletor mostraria "A definir" num card que tem responsável, e salvar
   * qualquer outro campo o apagaria sem ninguém pedir.
   */
  const etapaAtual = columns.find((c) => c.id === card.columnId) ?? null;
  // A equipe vem da FASE da etapa, não da etapa. Ver `ownershipOf`.
  const equipeDaFase = ownershipOf(etapaAtual, groups);
  const daEtapa = stageCandidates(equipeDaFase, people);
  /*
   * O dono atual entra na lista mesmo se a etapa não o aceitaria.
   *
   * Sem isso, abrir um card cuja etapa mudou de equipe mostraria o seletor
   * vazio — e salvar qualquer outro campo apagaria o responsável sem ninguém
   * ter pedido.
   */
  const donos = parseAssignees(card.assignees);

  /*
   * Quem já responde pela demanda entra na lista mesmo se a fase não o
   * aceitaria hoje. Sem isso, abrir um card cuja fase trocou de equipe
   * esconderia os responsáveis atuais — e qualquer clique os apagaria.
   */
  const foraDaEquipe = people.filter(
    (c) => donos.includes(c.email) && !daEtapa.some((d) => d.email === c.email)
  );
  const candidatos = [...foraDaEquipe, ...daEtapa];
  const allOpen = variations.length > 0 && openVariations.size === variations.length;

  const patch = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/creator/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível salvar.");
        return false;
      }
      onChanged();
      loadActivities();
      return true;
    } catch {
      setError("Falha de conexão.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const block: React.CSSProperties = {
    padding: "var(--pad-card)",
    borderRadius: "var(--radius-block)",
    background: "var(--surface-sunken)",
    border: "1px solid var(--surface-sunken-border)",
  };

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      title={card.title}
      // O número abre a linha porque é o que se copia para citar a demanda
      // em outro lugar; a procedência vem depois dele.
      /*
        A procedência inteira numa linha: número, quem pediu, quando e POR ONDE.
        
        A origem faltava, e ela muda como se lê o resto: um briefing montado
        pelo gerador de copy não foi escrito por ninguém, e um pedido que entrou
        pelo link aberto traz um e-mail declarado, não verificado. Estava
        gravada desde sempre e não era dita em lugar nenhum. Ver `ORIGIN_LABEL`.
      */
      description={
        mostra("requester")
          ? [
              formatCardCode(card.code),
              card.requesterName
                ? `Aberta por ${card.requesterName} em ${stamp(card.createdAt)}`
                : `Aberta em ${stamp(card.createdAt)}`,
              origemDoCard(card.origin),
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      width="min(980px, 100%)"
      footer={
        <>
          {arquivado ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                if (await patch({ restore: { cardId: card.id } })) onClose();
              }}
            >
              <ArchiveRestore size={14} />
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Arquivar esta demanda?\n\nEla sai do quadro, mas continua no arquivo — com briefing, copy e histórico.")) return;
                setBusy(true);
                const res = await fetch("/api/creator/cards", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: card.id }),
                });
                setBusy(false);
                if (res.ok) {
                  onChanged();
                  onClose();
                }
              }}
            >
              <Trash2 size={14} />
              Arquivar
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      {/*
        Uma coluna só, na largura inteira do diálogo.

        Eram duas: a demanda à esquerda e "Acompanhamento" fixo numa faixa de
        260px à direita. A faixa custava essa largura em TODA demanda — o
        briefing, as respostas, a copy e o painel de entrega espremidos para
        manter à vista um histórico que quase nunca se está lendo. O
        acompanhamento desceu para o fim, recolhido, e o que sobrou de espaço
        voltou para o conteúdo.
      */}
      {/* Etapa, prioridade e responsável: o que muda com mais frequência fica
          no topo, editável sem abrir outra tela.

          A grade só existe se houver o que pôr nela: com as duas desligadas,
          ela deixaria um vão de 0,9rem entre o título e o resto. */}
      {(mostra("stage") || mostra("assignee")) && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.9rem" }}>
        {mostra("stage") && (
        <div className="field">
          <label className="field-label" htmlFor="card-etapa">
            Etapa
          </label>
          <select
            id="card-etapa"
            className="field-input"
            value={card.columnId}
            disabled={travado}
            onChange={(e) => patch({ id: card.id, columnId: e.target.value })}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        )}

        {mostra("assignee") && (
        <>
        {/*
          O responsável sai da equipe da etapa em que o card está.

          Oferecer o quadro inteiro aqui e recusar a escolha no servidor seria
          ensinar a regra pelo erro. A pessoa que já é dona aparece mesmo fora
          da equipe: ela está no card, e some-la do seletor faria a caixa
          mostrar "A definir" para um card que tem dono.
        */}
        <div className="field">
          <label className="field-label" htmlFor="card-responsavel">
            Responsável
          </label>
          {/*
            Vários responsáveis, marcáveis um a um.

            Uma demanda no backlog é do time inteiro; em produção, de quem a
            puxou. As duas coisas são a mesma lista em momentos diferentes, e um
            `<select>` de escolha única não sabe representar a primeira.
          */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {candidatos.map((c) => {
              const dentro = donos.includes(c.email);
              return (
                <button
                  key={c.email}
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={dentro}
                  title={dentro ? `Tirar ${c.name} desta demanda` : `${c.name} passa a responder por esta demanda`}
                  style={{ padding: "0.25rem 0.55rem", fontSize: "var(--text-caption)", gap: "0.35rem" }}
                  onClick={() =>
                    patch({
                      id: card.id,
                      assignees: dentro ? donos.filter((e) => e !== c.email) : [...donos, c.email],
                    })
                  }
                >
                  <Avatar name={c.name} src={c.avatarUrl} size="xs" />
                  {c.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          {parseAssignees(equipeDaFase.assignees).length > 0 && (
            <span className="field-hint">
              Quem responde pela fase de &quot;{etapaAtual?.name}&quot;.
              {/* O nome, não o e-mail: a dica é para ler, e um endereço no meio
                  da frase obriga a decifrar quem é. */}
              {equipeDaFase.defaultAssignee
                ? ` Por padrão, ${people.find((p) => p.email === equipeDaFase.defaultAssignee)?.name ?? equipeDaFase.defaultAssignee}.`
                : ""}
            </span>
          )}
        </div>
        </>
        )}
      </div>
      )}

      {/*
        O prazo, editável aqui — e não só na abertura.

        A data combinada na abertura é a primeira a mudar: a peça volta da
        revisão, a campanha adia, o pedido cresce. Sem este campo, a única
        saída era abrir outra demanda ou deixar o card vencido no quadro
        mentindo a data — e é o prazo que pinta o card de vermelho.
        `parseDueDate`, do outro lado, ancora a data ao meio-dia local, então
        `slice(0, 10)` devolve o mesmo dia civil que a pessoa escolheu.
      */}
      {mostra("dueDate") && (
      <div className="field" style={{ maxWidth: "240px" }}>
        <label className="field-label" htmlFor="card-prazo">
          Prazo
        </label>
        <DatePicker
          id="card-prazo"
          value={card.dueDate ? card.dueDate.slice(0, 10) : ""}
          disabled={travado}
          /* Vazio é "sem prazo", e o servidor entende: `parseDueDate` devolve
             nulo, o selo some do card e ele deixa de vencer. */
          onChange={(valor) => patch({ id: card.id, dueDate: valor || null })}
          placeholder="Sem prazo"
        />
      </div>
      )}

      {mostra("priority") && (
      <div className="field">
        <span className="field-label">Prioridade</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-toggle"
              aria-pressed={card.priority === p}
              disabled={travado}
              style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
              onClick={() => patch({ id: card.id, priority: p })}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      )}

      {arquivado && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.6rem 0.7rem",
            borderRadius: "var(--radius-block)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--surface-sunken-border)",
            fontSize: "var(--text-control)",
            color: "var(--muted)",
          }}
        >
          <Archive size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Esta demanda está no arquivo. Tudo continua aqui; para voltar a mexer nela, restaure.
          </span>
        </div>
      )}

      {/*
        O link fica no topo, junto do que muda todo dia, e não lá embaixo com o
        briefing: quem abre o card de uma demanda em produção quase sempre está
        atrás de uma coisa só — onde estão os arquivos.

        A `key` amarra o estado do campo ao card: sem ela, abrir outro card
        reaproveitaria o rascunho do anterior, já que o diálogo é o mesmo.
      */}
      {/*
        A pasta que a AUTOMAÇÃO criou, quando existe.

        Só de leitura, e por isso não é um `CardLinkField`: este endereço não
        se digita — ele nasce do upload e some junto com ele. Um campo editável
        aqui convidaria a colar outra coisa por cima do que a automação gravou.

        Seção própria nas preferências (`deliveryLink`), e não dentro da do
        link de referência: aquela depende da pergunta do formulário, e num
        quadro que não pede link a pasta da entrega desaparecia junto. Aqui
        quem decide é só o interruptor — a pasta não é resposta de ninguém.

        Independente do painel de upload, que só aparece nas etapas de
        produção: uma demanda que já passou delas ficaria sem nenhum caminho
        até os próprios arquivos. Onde estão as artes é o que mais se procura
        ao abrir um card entregue, e na passagem de bastão é o que a próxima
        pessoa precisa antes de qualquer outra coisa.
      */}
      {mostra("deliveryLink") && card.deliveryUrl && (
        <div className={`cd-entrega${entregaFechada ? " cd-entrega--feita" : ""}`}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "var(--primary)",
              fontWeight: 700,
              fontSize: "var(--text-control)",
            }}
          >
            <PackageCheck size={16} />
            {/* "Entrega" e não "artes": o que sai desta demanda pode ser um
                vídeo, um banner, uma landing page ou um arquivo hospedado
                fora. O meio é detalhe do link, não do rótulo. */}
            {entregaFechada ? "Demanda entregue" : "Entrega registrada"}
          </span>

          <a
            href={card.deliveryUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ marginLeft: "auto", padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)", textDecoration: "none" }}
          >
            {destinoDaEntrega?.isDrive ? "Abrir no Drive" : "Abrir entrega"}
          </a>

          <span className="field-hint" style={{ flexBasis: "100%" }}>
            {destinoDaEntrega?.isDrive
              ? "A pasta foi criada e nomeada pela automação ao fim do envio — o endereço não se edita à mão."
              : "Endereço registrado na entrega, fora do Drive — uma página, um material hospedado em outro lugar."}
          </span>
        </div>
      )}

      {mostra("link") && (
        <CardLinkField
          key={card.id}
          id="card-link"
          /* Era "Link da Entrega", nome que passou a mentir quando a entrega
             ganhou campo próprio: este aqui é o que veio COM o pedido, e o
             mesmo nome que o quadro usa no selo. */
          label="Link de referência"
          value={card.linkUrl}
          busy={travado}
          hint="O material de apoio do pedido — a pasta ou o arquivo que veio junto com a demanda."
          onSave={(url) => patch({ id: card.id, linkUrl: url })}
        />
      )}

      {/* As referências ficam acima do briefing: elas são a parte do pedido que
          se entende antes de ler qualquer coisa. Clicar abre a imagem inteira no
          mesmo popup que abre a arte de um criativo. */}
      {mostra("attachments") && anexos.length > 0 && (
        <div className="field">
          <span className="field-label">Referências</span>
          <AttachmentGallery attachments={anexos} />
        </div>
      )}

      {/*
        Os vídeos brutos ficam JUNTO das referências, e não dentro do campo que
        os subiu: quem abre a demanda para ver o que ela tem procura os arquivos
        onde estão os outros arquivos.
        
        Sem interruptor na tela de configuração, ao contrário das referências:
        não vêm de pergunta nenhuma — são arquivos que a automação pôs no Drive,
        e um card que não tem nenhum simplesmente não mostra a seção. É o mesmo
        critério do selo de peças na frente do card.

        Arquivado não remove: um card fora do quadro é registro, e registro não
        se edita. Baixar e abrir continuam valendo.
      */}
      {videos.length > 0 && (
        <div className="field">
          <span className="field-label">Vídeos brutos</span>
          <RawVideoList
            videos={videos}
            cardId={arquivado ? null : card.id}
            onVideos={arquivado ? undefined : setVideos}
          />
        </div>
      )}

      {/*
        Briefing: o texto corrido e as respostas, num bloco só.
        
        Eram dois — "Contexto" com o que foi escrito à mão, "Briefing" com o que
        foi respondido —, e a divisão não correspondia a nada que quem lê
        distinga: os dois dizem o que a peça precisa ser. Com nomes diferentes
        para a mesma coisa, o quadro que criava a própria pergunta de briefing
        passava a ter as duas caixas, e quem preenchia escolhia uma ao acaso.

        São DUAS condições porque são dois interruptores, um por origem — ver
        `CARD_PANEL_SECTIONS`. O bloco aparece se qualquer um dos lados tiver o
        que mostrar, e cada lado responde só por si.
      */}
      {(textoDoBriefing || respostasDoFormulario) && (
        <div className="field">
          <span className="field-label">Briefing</span>
          <div style={{ ...block, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {textoDoBriefing && (
              <div style={{ fontSize: "var(--text-body)", lineHeight: 1.55 }}>
                <ReactMarkdown>{card.description}</ReactMarkdown>
              </div>
            )}

            {/*
              Editável para quem está FAZENDO, e o mesmo controle do formulário.

              Não é uma segunda versão do campo: `FieldInput` é o que desenha a
              pergunta na abertura, e uma cópia aqui divergiria dele no primeiro
              tipo novo — o deslizante viraria caixa de texto, o campo
              dependente perderia o pai. Quem produz a peça vê exatamente o
              controle que quem pediu viu, com a resposta dentro.

              Arquivada, volta a ser texto: um card fora do quadro é registro,
              e registro não se edita.
            */}
            {respostasDoFormulario &&
              camposVisiveis(fields, arquivado ? values : respostas).map((field) =>
                arquivado ? (
                  <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                    <span
                      style={{
                        fontSize: "var(--text-eyebrow)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color: "var(--muted)",
                      }}
                    >
                      {field.label}
                    </span>
                    <span style={{ fontSize: "var(--text-control)" }}>
                      {formatFieldValue(field, values[field.key])}
                    </span>
                  </div>
                ) : (
                  <FieldInput
                    key={field.id}
                    field={field}
                    value={respostas[field.key]}
                    values={respostas}
                    parentLabel={fields.find((f) => f.key === field.dependsOn)?.label}
                    upload={{ cardId: card.id, fields, videos, onVideos: setVideos }}
                    onChange={(v) => responder(field, v)}
                  />
                )
              )}

            {/*
              O Salvar só existe quando há o que salvar.
              
              Gravar a cada tecla mandaria uma requisição por letra num campo de
              texto longo; gravar ao fechar perderia a alteração de quem fecha
              no Esc. Com o botão aparecendo, a gravação é um ato — e o card
              continua legível enquanto ninguém mexe em nada.
            */}
            {temAlteracao && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={travado}
                  style={{ padding: "0.35rem 0.8rem", fontSize: "var(--text-caption)" }}
                  onClick={() => patch({ id: card.id, values: alteradas })}
                >
                  <Check size={14} />
                  Salvar respostas
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={travado}
                  style={{ padding: "0.35rem 0.8rem", fontSize: "var(--text-caption)" }}
                  onClick={() => setRespostas(values)}
                >
                  Descartar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {mostra("copy") && card.copyText && (
        <div className="field">
          <span className="field-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <span>
              Copy gerada
              {variations.length > 1 && (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  {" "}· {variations.length} variações
                </span>
              )}
            </span>

            <span style={{ display: "flex", gap: "0.25rem" }}>
              {/* Abrir tudo de uma vez é para quem veio comparar as variações;
                  recolher tudo, para quem já achou a que queria. */}
              {variations.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "var(--text-caption)" }}
                  onClick={() =>
                    setOpenVariations(
                      allOpen ? new Set() : new Set(variations.map((_, i) => i))
                    )
                  }
                >
                  {allOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                  {allOpen ? "Recolher" : "Expandir"}
                </button>
              )}

              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.25rem 0.6rem", fontSize: "var(--text-caption)" }}
                onClick={() => {
                  navigator.clipboard?.writeText(card.copyText || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={13} /> : <CopyIcon size={13} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </span>
          </span>

          {variations.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {variations.map((v, i) => (
                <VariationCard
                  key={v.id}
                  variation={v}
                  index={i}
                  readOnly
                  collapsible
                  open={openVariations.has(i)}
                  onToggle={() =>
                    setOpenVariations((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div style={{ ...block, fontSize: "var(--text-body)", lineHeight: 1.55 }}>
              <ReactMarkdown>{card.copyText}</ReactMarkdown>
            </div>
          )}
        </div>
      )}


      {/* Perto do fim e em largura cheia, por ser a última etapa antes de a
          demanda seguir pra revisão e subida dos anúncios — um destaque de
          "fim de linha", não mais um campo entre outros. Só o acompanhamento
          vem depois, e ele é consulta. */}
      {mostra("delivery") && (
        <DeliveryUploadPanel
          key={card.id}
          cardId={card.id}
          code={card.code}
          assignees={card.assignees}
          values={values}
          people={people}
          emProducao={emProducao}
          onUploaded={onChanged}
        />
      )}

      {/*
        O acompanhamento fecha o card, e recolhido.

        Morava numa coluna fixa à direita, e pagava caro por isso: 260px de
        largura tirados de TODA a demanda — briefing, respostas, copy e o
        painel de entrega espremidos a vida inteira para manter à vista um
        histórico que quase sempre não se está lendo. Agora ele é a última
        seção, em largura cheia, e quem quer o histórico o abre.

        Recolhido por padrão pelo mesmo motivo: o card aberto é sobre A
        DEMANDA; o que já aconteceu com ela é consulta, não leitura de todo
        dia. A contagem no cabeçalho avisa quando há o que ler.
      */}
      {mostra("activity") && (
      <div className="field cd-historico">
        {/*
          O cabeçalho é um botão de verdade, e não um rótulo com `onClick`:
          recolher e expandir é uma ação, e como botão ela vem com teclado,
          foco e o `aria-expanded` que diz a um leitor de tela se o conteúdo
          está aberto.
        */}
        <button
          type="button"
          className="cd-historico-toggle"
          aria-expanded={historicoAberto}
          onClick={() => setHistoricoAberto((v) => !v)}
        >
          <History size={14} />
          Acompanhamento
          {/* A contagem no cabeçalho é o que justifica abrir: recolhido, sem
              ela, não há como saber se há uma atualização nova ou nenhuma. */}
          {activities.length > 0 && (
            <span className="cd-historico-contador">{activities.length}</span>
          )}
          <ChevronDown
            size={14}
            aria-hidden="true"
            style={{
              marginLeft: "auto",
              transition: "transform 0.2s ease",
              transform: historicoAberto ? "rotate(180deg)" : "none",
            }}
          />
        </button>

        {historicoAberto && (
          <>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {/* A lista sobe, e não desce: o campo de comentário fica no pé do
                diálogo, e para baixo ela nasceria fora da área visível. */}
            {sugestoes.length > 0 && (
              <div
                role="listbox"
                aria-label="Pessoas para mencionar"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 0.35rem)",
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-block)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                  overflow: "hidden",
                }}
              >
                {sugestoes.map((pessoa, i) => (
                  <button
                    key={pessoa.email}
                    type="button"
                    role="option"
                    aria-selected={i === sugestaoAtiva}
                    /* `onMouseDown`, e não `onClick`: o clique tira o foco do
                       campo antes de disparar, e a lista fecharia no caminho. */
                    onMouseDown={(e) => { e.preventDefault(); inserirMencao(pessoa); }}
                    onMouseEnter={() => setSugestaoAtiva(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      width: "100%",
                      padding: "0.4rem 0.6rem",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "var(--text-control)",
                      color: "var(--foreground)",
                      background: i === sugestaoAtiva ? "var(--card-border)" : "transparent",
                    }}
                  >
                    <Avatar name={pessoa.name} src={pessoa.avatarUrl} size="xs" />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pessoa.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <input
              ref={campoDeComentario}
              className="field-input"
              style={{ width: "100%", minWidth: 0 }}
              value={comment}
              disabled={travado}
              placeholder={arquivado ? "Arquivada — sem novas atualizações." : "Escreva uma atualização… use @ para mencionar"}
              aria-label="Novo comentário"
              onChange={(e) => {
                setComment(e.target.value);
                setCursor(e.target.selectionStart ?? e.target.value.length);
                setMencaoDispensada(false);
                setSugestaoAtiva(0);
              }}
              /* Cobre o cursor movido por clique ou seta, que não passa pelo
                 `onChange` — sem isto a lista não abre ao voltar para um `@`
                 escrito antes. */
              onSelect={(e) => setCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
              onKeyDown={async (e) => {
                if (sugestoes.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSugestaoAtiva((i) => (i + 1) % sugestoes.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSugestaoAtiva((i) => (i - 1 + sugestoes.length) % sugestoes.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    inserirMencao(sugestoes[sugestaoAtiva] ?? sugestoes[0]);
                    return;
                  }
                  if (e.key === "Escape") {
                    /* Fecha só a lista. Sem segurar o evento, o Esc chegaria ao
                       diálogo e fecharia o card inteiro, levando junto o
                       comentário pela metade. */
                    e.preventDefault();
                    e.stopPropagation();
                    setMencaoDispensada(true);
                    return;
                  }
                }
                if (e.key === "Enter" && comment.trim()) {
                  if (await patch({ comment: { cardId: card.id, text: comment } })) {
                    setComment("");
                    setCursor(0);
                  }
                }
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={travado || !comment.trim()}
            onClick={async () => {
              if (await patch({ comment: { cardId: card.id, text: comment } })) {
                setComment("");
                setCursor(0);
              }
            }}
          >
            <Send size={14} />
            Enviar
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
          {activities.length === 0 ? (
            <span className="field-hint">Nenhum registro ainda.</span>
          ) : (
            activities.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                <Avatar name={a.authorName || "?"} size="xs" />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <span style={{ fontSize: "var(--text-caption)", lineHeight: 1.45 }}>
                    <strong>{a.authorName || "Alguém"}</strong>{" "}
                    {a.type === "COMMENT" ? (
                      <span style={{ color: "var(--muted)" }}>comentou:</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>{a.message}</span>
                    )}
                  </span>
                  {a.type === "COMMENT" && (
                    /* As menções saem destacadas — pela MESMA regra que decidiu
                       quem foi avisado, em `lib/mentions.ts`. Se a tela usasse
                       outra, um nome apareceria aceso sem ter notificado
                       ninguém. */
                    <span style={{ fontSize: "var(--text-body)", lineHeight: 1.5 }}>
                      {separarMencoes(a.message, people).map((parte, i) =>
                        parte.mencao ? (
                          <strong key={i} style={{ color: "var(--primary)", fontWeight: 600 }}>
                            {parte.texto}
                          </strong>
                        ) : (
                          <React.Fragment key={i}>{parte.texto}</React.Fragment>
                        )
                      )}
                    </span>
                  )}
                  <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)" }}>
                    {stamp(a.createdAt)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
          </>
        )}
      </div>
      )}

      {error && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </Modal>
  );
}

"use client";

/**
 * Entrega de demanda — solta o lote inteiro, o sistema nomeia, casa por
 * proporção (Feed/Story) e sobe pro Drive, sozinho.
 *
 * Porta a experiência do ad-naming-tool (Pedro Pimenta) pra dentro do card:
 * lá a pessoa digitava quantidade, frente, responsável e ID à mão — aqui vêm
 * do próprio card (`values`, `assignees`, `code`). O que sobra pra escolher
 * na tela é só o que o card não sabe de antemão: qual formato é este envio
 * (vídeo e animação usam a mesma extensão, não dá pra adivinhar) e quantas
 * peças têm.
 *
 * "Quantidade" parte da mesma resposta que já conta pro ranking de entregas
 * (`campoVolumetria`, a versão sem banco de `volumetriaDoCard` em
 * `lib/kanban-deliveries.ts`) — é o que já foi definido na abertura da
 * demanda, então pedir de novo aqui seria a mesma pergunta duas vezes. Fica
 * editável porque a quantidade real pode mudar entre a abertura e a entrega
 * (o card aberto já permite essa correção há um tempo), não porque as duas
 * perguntas sejam independentes.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud, X, Loader2, CheckCircle2, ImageIcon, Video, PackageOpen, Link2 } from "lucide-react";
import type { FieldDefinition } from "./FieldInput";
import type { PersonOption } from "./DemandDialog";
import { formatCardCode, parseAssignees, campoVolumetria } from "@/lib/kanban";
import { normalizeCardLink } from "@/lib/card-link";
import {
  type DeliveryFormat,
  type ArquivoParaCasar,
  type CasamentoPeca,
  REGRA,
  validarFrentes,
  montarNomeArquivo,
  casarArquivos,
  formatoTemPosicoes,
  campoDeFrentes,
  frentesDoCard,
  nomeResponsavelDoEmail,
} from "@/lib/delivery-naming";

const FORMATOS: { key: DeliveryFormat; label: string; icone: typeof ImageIcon }[] = [
  { key: "estatico", label: "Estático", icone: ImageIcon },
  { key: "video", label: "Vídeo", icone: Video },
  { key: "animacao", label: "Animação", icone: Video },
  { key: "unboxing", label: "Unboxing", icone: PackageOpen },
];

/*
 * URL é uma ABA, e não um quinto formato.
 *
 * Os quatro de cima são formatos de arquivo: cada um carrega regra de
 * nomenclatura, pasta no Drive e extensão esperada (ver `REGRA` em
 * `lib/delivery-naming.ts`). Um link não tem nada disso — não se renomeia, não
 * se organiza em Feed e Story, não tem extensão. Enfiá-lo em `DeliveryFormat`
 * obrigaria a inventar um prefixo de pasta e uma extensão que nunca seriam
 * usados, e todo código que percorre os formatos passaria a precisar de uma
 * exceção para ele.
 *
 * Aqui ele é o que é: o outro jeito de entregar. A entrega que já vive em
 * outro lugar — uma landing page, um material hospedado fora — e que só
 * precisa ser apontada.
 */

const EXTENSOES_IMAGEM = /\.(png|jpe?g|webp)$/i;
const EXTENSOES_VIDEO = /\.(mp4|mov|webm)$/i;

interface ArquivoLocal extends ArquivoParaCasar {
  file: File;
}

/** Mede a proporção de uma imagem/vídeo no navegador — só isto é DOM; o resto de `lib/delivery-naming.ts` é puro. */
function medirArquivo(file: File): Promise<{ w: number | null; h: number | null; ratio: number | null }> {
  const isImg = EXTENSOES_IMAGEM.test(file.name);
  const isVid = EXTENSOES_VIDEO.test(file.name);
  if (!isImg && !isVid) return Promise.resolve({ w: null, h: null, ratio: null });

  return new Promise((resolve) => {
    let feito = false;
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve({ w: null, h: null, ratio: null });
      return;
    }
    const acabar = (w: number | null, h: number | null) => {
      if (feito) return;
      feito = true;
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* já revogada */
      }
      resolve({ w, h, ratio: w && h ? w / h : null });
    };
    if (isImg) {
      const img = new Image();
      img.onload = () => acabar(img.naturalWidth, img.naturalHeight);
      img.onerror = () => acabar(null, null);
      img.src = url;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => acabar(video.videoWidth, video.videoHeight);
      video.onerror = () => acabar(null, null);
      video.src = url;
    }
    setTimeout(() => acabar(null, null), 8000);
  });
}

const CHUNK_BYTES = 4 * 1024 * 1024;

async function subirArquivo(params: {
  file: File;
  parentId: string;
  filename: string;
  onProgresso: (pct: number) => void;
}): Promise<void> {
  const sessaoRes = await fetch("/api/creator/cards/delivery/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId: params.parentId, filename: params.filename, mimeType: params.file.type }),
  });
  const sessao = await sessaoRes.json();
  if (!sessaoRes.ok) throw new Error(sessao.error || "Erro ao iniciar o upload.");

  let offset = 0;
  const total = params.file.size;
  while (offset < total) {
    const fim = Math.min(offset + CHUNK_BYTES, total);
    const pedaco = await params.file.slice(offset, fim).arrayBuffer();
    const url =
      `/api/creator/cards/delivery/chunk?uploadUrl=${encodeURIComponent(sessao.uploadUrl)}` +
      `&offset=${offset}&total=${total}`;
    const res = await fetch(url, { method: "POST", body: pedaco });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao enviar um pedaço do arquivo.");
    offset = fim;
    params.onProgresso(Math.round((offset / total) * 100));
    if (data.concluido) break;
  }
}

export default function DeliveryUploadPanel({
  cardId,
  code,
  assignees,
  values,
  fields,
  people,
  emProducao,
  onUploaded,
}: {
  cardId: string;
  code: number | null;
  assignees: string | null;
  values: Record<string, unknown>;
  fields: FieldDefinition[];
  /** Pra resolver a sigla do responsável (`rm`, `ez`...) — mesma lista que o seletor de responsável já usa. */
  people: PersonOption[];
  /** A etapa ATUAL do card é de produção? Ver `BoardColumn.isProduction`. */
  emProducao: boolean;
  onUploaded: () => void;
}) {
  const [driveOk, setDriveOk] = useState<boolean | null>(null);
  const [formato, setFormato] = useState<DeliveryFormat>("estatico");
  /** A aba de URL está aberta? Ver o comentário em `FORMATOS`. */
  const [modoUrl, setModoUrl] = useState(false);
  const [urlEntrega, setUrlEntrega] = useState("");
  const [salvandoUrl, setSalvandoUrl] = useState(false);
  /*
   * Parte da resposta real de quantidade de peças, não de 1 fixo — o
   * componente inteiro remonta a cada card (`key={card.id}` em
   * `CardDialog`), então o inicializador do `useState` roda de novo pra cada
   * demanda aberta.
   */
  const [quantidade, setQuantidade] = useState(() => {
    const chave = campoVolumetria(fields);
    const bruto = chave ? values[chave] : undefined;
    const n = typeof bruto === "number" ? bruto : Number(String(bruto ?? "").trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  });
  const [pool, setPool] = useState<ArquivoLocal[]>([]);
  /** Escolha manual por posição (`"0:feed"`, `"1:video"`...), por cima da sugestão automática. */
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<Record<number, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  /* Um formato só para os dois caminhos: o que se diz e para onde se vai. O
     upload preenche com a trilha de pastas, o link com o próprio endereço. */
  const [concluido, setConcluido] = useState<{ descricao: string; url: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const proximoIndice = useRef(0);

  useEffect(() => {
    fetch("/api/settings/summary")
      .then((r) => r.json())
      .then((data) => {
        const drive = (data.integrations || []).find((i: { id: string }) => i.id === "GOOGLE_DRIVE");
        setDriveOk(!!drive?.configured);
      })
      .catch(() => setDriveOk(false));
  }, []);

  const idCard = formatCardCode(code);

  /*
   * O campo da frente é achado pelo CONTEÚDO — ver `campoDeFrentes`.
   *
   * Era procurado pela chave `frente`, e foi assim que a entrega passou a
   * nomear com `reels-9-16` no lugar de `influ`: a chave não muda quando
   * alguém renomeia o campo, então ela ficou no campo que hoje se chama
   * "Formato". Procurando por quem OFERECE as frentes, renomear deixa de
   * quebrar o nome do arquivo.
   */
  const frenteField = campoDeFrentes(fields);
  const frentes = frentesDoCard(fields, values);
  const validacaoFrentes = frenteField ? validarFrentes(frentes) : { ok: true as const };
  /*
   * Mensagem específica pro caso mais comum: card sem resposta de "frente"
   * ainda (de antes do campo existir, ou aberto sem responder). A mensagem
   * genérica de `validarFrentes` ("escolha ao menos uma") não diz ONDE — quem
   * não sabe que "frente" é uma pergunta do formulário fica sem pista do que
   * fazer. Usada tanto no aviso passivo quanto no bloqueio de `enviarTudo`,
   * pra não dizer uma coisa na tela e outra no clique.
   */
  const mensagemFrenteInvalida =
    frentes.length === 0
      ? 'Este card não tem resposta para "Frente" — responda essa pergunta em "Respostas do formulário", no topo do card, e salve antes de enviar a entrega.'
      : validacaoFrentes.ok
        ? null
        : validacaoFrentes.erro || "Frente inválida.";

  /*
   * A sigla do responsável — mesma convenção do Pedro (`rm`, `ez`, `pp`...),
   * conferido no dropdown "responsável" da ferramenta dele: o valor gravado
   * no nome do arquivo é literalmente a sigla, não o nome nem o e-mail.
   *
   * Nem todo mundo no quadro tem ficha de criador (mídia paga, revisão não
   * desenham peça — `lib/kanban.ts` é explícito sobre isso), então sem sigla
   * cai pro nome cadastrado, e só na ausência dos dois pro e-mail. A sigla
   * ganha de qualquer jeito quando existe: é a única das três que aparece nos
   * nomes de arquivo e de anúncio já em uso pelo time.
   */
  const responsavel = useMemo(() => {
    const emails = parseAssignees(assignees);
    const primeiro = emails[0];
    if (!primeiro) return "";
    const pessoa = people.find((p) => p.email.toLowerCase() === primeiro.toLowerCase());
    return pessoa?.acronym || pessoa?.name || nomeResponsavelDoEmail(primeiro);
  }, [assignees, people]);

  const casamento: CasamentoPeca[] = useMemo(() => {
    if (!idCard) return [];
    return casarArquivos({
      pool,
      quantidade,
      formato,
      extensaoEsperada: REGRA[formato].ext === "mp4" ? "mp4" : REGRA[formato].ext,
      nomeEsperadoPorIndice: (indice) =>
        montarNomeArquivo({ formato, indice, frentes, responsavel, idCard, data: new Date() }),
    });
  }, [pool, quantidade, formato, frentes, responsavel, idCard]);

  /*
   * O casamento automático é sugestão, não decisão — cada posição (Feed,
   * Story, ou o arquivo único do vídeo) é clicável na tela e aceita escolha
   * manual, que vence a sugestão. Sem isto, uma proporção mal medida ou um
   * lote fora do padrão não tinha como ser corrigido: a peça simplesmente
   * ficava "sem arquivo" e não existia jeito de apontar qual era.
   */
  const casamentoFinal: CasamentoPeca[] = useMemo(() => {
    return Array.from({ length: quantidade }, (_, indice) => {
      const auto = casamento[indice] ?? { confiancas: {} };
      const feed = overrides[`${indice}:feed`] ?? auto.feed;
      const story = overrides[`${indice}:story`] ?? auto.story;
      const video = overrides[`${indice}:video`] ?? auto.video;
      return {
        feed,
        story,
        video,
        confiancas: {
          ...auto.confiancas,
          ...(overrides[`${indice}:feed`] != null ? { feed: true } : {}),
          ...(overrides[`${indice}:story`] != null ? { story: true } : {}),
          ...(overrides[`${indice}:video`] != null ? { video: true } : {}),
        },
      };
    });
  }, [casamento, overrides, quantidade]);

  /** Mede o arquivo escolhido na hora, adiciona ao lote e amarra à posição clicada. */
  const escolherManual = async (indice: number, slot: "feed" | "story" | "video", file: File) => {
    const { ratio } = await medirArquivo(file);
    const dot = file.name.lastIndexOf(".");
    const poolIndex = proximoIndice.current++;
    const novo: ArquivoLocal = {
      poolIndex,
      base: dot > -1 ? file.name.slice(0, dot) : file.name,
      extensao: dot > -1 ? file.name.slice(dot + 1) : "",
      ratio,
      file,
    };
    setPool((atual) => [...atual, novo]);
    setOverrides((atual) => ({ ...atual, [`${indice}:${slot}`]: poolIndex }));
    setConcluido(null);
  };

  /** Volta a posição pra sugestão automática (ou pra "sem arquivo", se não houver sugestão). */
  const limparPosicao = (indice: number, slot: "feed" | "story" | "video") => {
    setOverrides((atual) => {
      const { [`${indice}:${slot}`]: _removido, ...resto } = atual;
      return resto;
    });
  };

  const trocarFormato = (novo: DeliveryFormat) => {
    setFormato(novo);
    setPool([]);
    setOverrides({});
    setErro(null);
    setConcluido(null);
  };

  const adicionarArquivos = async (fileList: FileList) => {
    // Estático só aceita imagem; vídeo/animação aceitam os dois — a mesma
    // extensão .mp4 vale pra ambos, e imagem entra porque alguns lotes de
    // animação exportam quadro de capa junto.
    const regexOk = formato === "estatico" ? EXTENSOES_IMAGEM : /\.(mp4|mov|webm|png|jpe?g|webp)$/i;
    const arquivos = Array.from(fileList).filter((f) => regexOk.test(f.name));
    if (!arquivos.length) return;

    const medidos = await Promise.all(
      arquivos.map(async (file) => {
        const { ratio } = await medirArquivo(file);
        const dot = file.name.lastIndexOf(".");
        const base = dot > -1 ? file.name.slice(0, dot) : file.name;
        const extensao = dot > -1 ? file.name.slice(dot + 1) : "";
        const poolIndex = proximoIndice.current++;
        return { poolIndex, base, extensao, ratio, file } satisfies ArquivoLocal;
      })
    );

    setPool((atual) => [...atual, ...medidos]);
    setConcluido(null);
  };

  const limpar = () => {
    setPool([]);
    setOverrides({});
    proximoIndice.current = 0;
    setErro(null);
    setConcluido(null);
  };

  const enviarTudo = async () => {
    if (!idCard) {
      setErro("Este card não tem um código (MKT-XXXX) — não é possível nomear a entrega.");
      return;
    }
    if (mensagemFrenteInvalida) {
      setErro(mensagemFrenteInvalida);
      return;
    }

    setEnviando(true);
    setErro(null);
    setProgresso({});

    try {
      const folderRes = await fetch("/api/creator/cards/delivery/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, formato }),
      });
      const pasta = await folderRes.json();
      if (!folderRes.ok) throw new Error(pasta.error || "Erro ao resolver a pasta de destino.");

      let totalEnviados = 0;
      /*
       * PEÇAS, não arquivos — é isto que a volumetria conta.
       *
       * Um estático é feed + story: dois arquivos para uma peça só. Mandar a
       * contagem de arquivos dobraria o número de quem entrega em formato com
       * posição, e deixaria intacto o de quem entrega vídeo. Conta-se a peça
       * que recebeu ao menos um arquivo.
       */
      let pecasEntregues = 0;
      const temPosicoes = formatoTemPosicoes(formato);

      for (let indice = 0; indice < quantidade; indice++) {
        const peca = casamentoFinal[indice];
        if (!peca) continue;

        const slots: { chave: "feed" | "story" | "video"; poolIndex: number | null | undefined; parentId: string }[] = temPosicoes
          ? [
              { chave: "feed", poolIndex: peca.feed, parentId: pasta.feedId },
              { chave: "story", poolIndex: peca.story, parentId: pasta.storyId },
            ]
          : [{ chave: "video", poolIndex: peca.video, parentId: pasta.id }];

        let subiuAlgoNestaPeca = false;

        for (const slot of slots) {
          if (slot.poolIndex == null) continue;
          const arquivo = pool.find((p) => p.poolIndex === slot.poolIndex);
          if (!arquivo) continue;

          const nomePeca =
            formato === "video" ? undefined : REGRA[formato].nome ? arquivo.base : undefined;
          const nomeBase = montarNomeArquivo({
            formato,
            indice: indice + 1,
            frentes,
            responsavel,
            idCard,
            nomePeca,
          });
          const filename = `${nomeBase}.${arquivo.extensao || "bin"}`;

          await subirArquivo({
            file: arquivo.file,
            parentId: slot.parentId,
            filename,
            onProgresso: (pct) => setProgresso((p) => ({ ...p, [arquivo.poolIndex]: pct })),
          });
          totalEnviados++;
          subiuAlgoNestaPeca = true;
        }

        if (subiuAlgoNestaPeca) pecasEntregues++;
      }

      const completeRes = await fetch("/api/creator/cards/delivery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          folderId: pasta.id,
          totalArquivos: totalEnviados,
          pecas: pecasEntregues,
        }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) throw new Error(completeData.error || "Erro ao concluir a entrega.");

      setConcluido({
        descricao: pasta.trilha,
        url: `https://drive.google.com/drive/folders/${pasta.id}`,
      });
      setPool([]);
      onUploaded();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar a entrega.");
    } finally {
      setEnviando(false);
    }
  };

  /*
   * A entrega por link.
   *
   * Passa pela MESMA rota que fecha a entrega de arquivos, e não por uma
   * gravação direta no card: é lá que o link vira `deliveryUrl` e que o
   * histórico ganha a linha dizendo que houve entrega. Duas portas para o
   * mesmo fato dariam dois históricos diferentes para a mesma demanda.
   */
  const salvarUrl = async () => {
    const limpo = normalizeCardLink(urlEntrega);
    if (!limpo) {
      setErro("Endereço inválido — precisa começar com http:// ou https://.");
      return;
    }

    setSalvandoUrl(true);
    setErro(null);
    try {
      const res = await fetch("/api/creator/cards/delivery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Um link é uma peça. Ver `creditarEntregaDoModulo`.
        body: JSON.stringify({ cardId, url: limpo, pecas: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar o link.");

      setConcluido({ descricao: "link registrado", url: data.deliveryUrl || limpo });
      setUrlEntrega("");
      onUploaded();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar o link.");
    } finally {
      setSalvandoUrl(false);
    }
  };

  if (driveOk === null) return null; // carregando — evita o "não configurado" piscar antes da resposta

  /*
   * Sem a etapa certa, sem envio — de propósito. É a garantia pedida: ninguém
   * sobe arquivo de entrega antes de a demanda estar numa etapa de produção
   * (`BoardColumn.isProduction`, marcada em Preferências › Etapas). A seção
   * continua visível, com o motivo escrito, em vez de simplesmente sumir —
   * quem abre o card precisa entender por que não pode enviar ainda, não só
   * notar a ausência do botão.
   */
  if (!emProducao) {
    return (
      <div className="field">
        <span className="field-label">Entrega de demanda</span>
        <span className="field-hint">
          Esta demanda ainda não está numa etapa de produção — mova o card para lá antes de
          enviar os arquivos da entrega.
        </span>
      </div>
    );
  }

  const totalSlots = casamentoFinal.reduce(
    (acc, peca) => acc + (formatoTemPosicoes(formato) ? (peca.feed != null ? 1 : 0) + (peca.story != null ? 1 : 0) : peca.video != null ? 1 : 0),
    0
  );
  const totalEsperado = formatoTemPosicoes(formato) ? quantidade * 2 : quantidade;

  return (
    <div className="field" style={{ gap: "0.7rem" }}>
      <span className="field-label">Entrega de demanda</span>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {FORMATOS.map(({ key, label, icone: Icone }) => (
          <button
            key={key}
            type="button"
            className="btn btn-secondary"
            disabled={enviando}
            onClick={() => {
              setModoUrl(false);
              trocarFormato(key);
            }}
            style={{
              opacity: !modoUrl && formato === key ? 1 : 0.6,
              borderColor: !modoUrl && formato === key ? "var(--primary)" : "var(--card-border)",
            }}
          >
            <Icone size={14} />
            {label}
          </button>
        ))}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={enviando}
          onClick={() => {
            setModoUrl(true);
            setErro(null);
          }}
          title="Entregar apontando um endereço, sem subir arquivo"
          style={{
            opacity: modoUrl ? 1 : 0.6,
            borderColor: modoUrl ? "var(--primary)" : "var(--card-border)",
          }}
        >
          <Link2 size={14} />
          URL
        </button>

        {/* Quantidade é conversa de arquivo: um link é um só. */}
        {!modoUrl && (
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginLeft: "auto", fontSize: "var(--text-control)" }}>
            Peças
            <input
              type="number"
              min={1}
              max={30}
              value={quantidade}
              disabled={enviando}
              onChange={(e) => setQuantidade(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)))}
              className="field-input"
              style={{ width: "4rem" }}
            />
          </label>
        )}
      </div>

      {/*
        O aviso do Drive vive AQUI dentro, e não mais barrando o painel
        inteiro: sem Drive configurado a entrega por link continua possível, e
        era justamente o caso que o portão antigo impedia.
      */}
      {!modoUrl && !driveOk && (
        <span className="field-hint" role="alert" style={{ color: "var(--warning, #b45309)" }}>
          Google Drive não configurado — preencha a Service Account e a pasta raiz em{" "}
          <strong>Configurações › Sistema</strong> para habilitar o envio de arquivos. A aba
          URL não depende dele.
        </span>
      )}

      {!modoUrl && driveOk && (
        <>
        {!frenteField && (
          <span className="field-hint" style={{ color: "var(--warning, #b45309)" }}>
            Nenhuma pergunta deste quadro oferece as frentes (Interno, Influenciadores,
            Embaixadores…) — a entrega sai sem essa parte no nome.
          </span>
        )}
        {frenteField && mensagemFrenteInvalida && (
          <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
            {mensagemFrenteInvalida}
          </span>
        )}

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!enviando) adicionarArquivos(e.dataTransfer.files);
          }}
          onClick={() => !enviando && input.current?.click()}
          style={{
            border: "1px dashed var(--card-border)",
            borderRadius: "10px",
            padding: "1.4rem",
            textAlign: "center",
            cursor: enviando ? "default" : "pointer",
            opacity: enviando ? 0.6 : 1,
            fontSize: "var(--text-control)",
            color: "var(--muted)",
          }}
        >
          <UploadCloud size={20} style={{ marginBottom: "0.3rem" }} />
          <div>Solta aqui todo o lote de uma vez, ou clica pra escolher</div>
          <div style={{ fontSize: "var(--text-caption)", opacity: 0.8 }}>
            {formato === "estatico" ? "Imagens (.png, .jpg, .webp)" : "Vídeos e/ou imagens do lote"}
          </div>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) adicionarArquivos(e.target.files);
              if (input.current) input.current.value = "";
            }}
          />
        </div>

        {/*
          As posições aparecem sempre, mesmo sem nenhum arquivo ainda — cada
          uma é clicável e abre um seletor pra ESSA posição específica. Antes
          elas só existiam depois de soltar algo na caixa de cima, e mesmo
          assim eram só texto: mostravam o casamento automático sem nenhum
          jeito de escolher ou corrigir manualmente qual arquivo ia em qual
          posição.
        */}
        {idCard && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {Array.from({ length: quantidade }, (_, indice) => {
                const peca = casamentoFinal[indice];
                const temPosicoes = formatoTemPosicoes(formato);
                const slots = temPosicoes
                  ? ([
                      ["Feed", "feed", peca?.feed, peca?.confiancas.feed] as const,
                      ["Story", "story", peca?.story, peca?.confiancas.story] as const,
                    ])
                  : ([["Arquivo", "video", peca?.video, peca?.confiancas.video] as const]);

                return (
                  <div
                    key={indice}
                    style={{
                      display: "flex", flexDirection: "column", gap: "0.3rem",
                      padding: "0.6rem 0.8rem", borderRadius: "8px",
                      border: "1px solid var(--card-border)", fontSize: "var(--text-caption)",
                    }}
                  >
                    <strong>Peça {indice + 1}</strong>
                    {slots.map(([rotulo, slotKey, poolIndex, autoDetectado]) => {
                      const arquivo = poolIndex != null ? pool.find((p) => p.poolIndex === poolIndex) : null;
                      return (
                        <div key={rotulo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                          <span style={{ color: "var(--muted)", flexShrink: 0 }}>{rotulo}:</span>
                          <label
                            style={{
                              flex: 1, minWidth: 0, cursor: enviando ? "default" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.4rem",
                              padding: "0.2rem 0.4rem", borderRadius: "6px",
                              border: `1px dashed ${arquivo ? "transparent" : "var(--card-border)"}`,
                              color: arquivo ? "var(--foreground)" : "var(--muted)",
                            }}
                            title={arquivo ? "Clique pra trocar o arquivo desta posição" : "Clique pra escolher o arquivo desta posição"}
                          >
                            <input
                              type="file"
                              accept={formato === "estatico" ? "image/png,image/jpeg,image/webp" : "video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"}
                              hidden
                              disabled={enviando}
                              onChange={(e) => {
                                const escolhido = e.target.files?.[0];
                                if (escolhido) escolherManual(indice, slotKey, escolhido);
                                e.target.value = "";
                              }}
                            />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {arquivo ? (
                                <>
                                  {arquivo.base}.{arquivo.extensao}
                                  {autoDetectado === false && <em style={{ opacity: 0.7 }}> (por proporção — confira)</em>}
                                  {progresso[arquivo.poolIndex] != null && enviando && ` — ${progresso[arquivo.poolIndex]}%`}
                                </>
                              ) : (
                                "clique pra escolher"
                              )}
                            </span>
                          </label>
                          {arquivo && !enviando && (
                            <button
                              type="button"
                              className="btn btn-icon"
                              title="Voltar pra sugestão automática"
                              onClick={() => limparPosicao(indice, slotKey)}
                              style={{ flexShrink: 0, width: "1.4rem", height: "1.4rem" }}
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" disabled={enviando || totalSlots === 0} onClick={enviarTudo}>
                {enviando ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
                {enviando ? "Enviando…" : "Enviar entrega"}
              </button>
              {(pool.length > 0 || Object.keys(overrides).length > 0) && (
                <button type="button" className="btn btn-secondary" disabled={enviando} onClick={limpar}>
                  <X size={14} />
                  Limpar
                </button>
              )}
              <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)" }}>
                {totalSlots} de {totalEsperado} posições identificadas
              </span>
            </div>
          </>
        )}
        </>
      )}

      {/*
        A entrega que não sobe para o Drive.
        
        Uma landing page, um material hospedado fora, um arquivo que já tem
        endereço. O link vai para o MESMO lugar em que a automação grava a
        pasta (`BoardCard.deliveryUrl`), então o card mostra o selo de entrega
        e o aviso do Slack leva até ele, igual a qualquer outra entrega.
      */}
      {modoUrl && (
        <>
          <div className="field">
            <label className="field-label" htmlFor="entrega-url">
              Endereço da entrega
            </label>
            <input
              id="entrega-url"
              type="url"
              className="field-input"
              value={urlEntrega}
              placeholder="https://…"
              disabled={salvandoUrl}
              onChange={(e) => setUrlEntrega(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !salvandoUrl && urlEntrega.trim()) {
                  e.preventDefault();
                  salvarUrl();
                }
              }}
            />
            <span className="field-hint">
              Para o que não vira arquivo no Drive — uma landing page, um material
              hospedado fora, um link que o time já recebeu pronto.
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvandoUrl || !urlEntrega.trim()}
              onClick={salvarUrl}
            >
              {salvandoUrl ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
              {salvandoUrl ? "Registrando…" : "Registrar entrega"}
            </button>
            {/* O que já está gravado, para quem abre o card e quer conferir
                antes de substituir. */}
            {!concluido && (
              <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)" }}>
                Substitui o endereço da entrega gravado no card.
              </span>
            )}
          </div>
        </>
      )}

      {erro && (
        <span className="field-hint" role="alert" style={{ color: "var(--danger)" }}>
          {erro}
        </span>
      )}

      {concluido && (
        <span className="field-hint" style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", color: "var(--success, #16a34a)" }}>
          <CheckCircle2 size={14} />
          Entrega registrada — {concluido.descricao}. O link já está no card.
          {/* O caminho mais curto até conferir o que foi entregue: quem acabou
              de enviar quer ver, não procurar o selo no quadro. */}
          <a
            href={concluido.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontWeight: 600, color: "var(--primary)" }}
          >
            Abrir
          </a>
        </span>
      )}
    </div>
  );
}

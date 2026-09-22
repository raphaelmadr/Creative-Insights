/**
 * Nomenclatura e casamento de arquivos da entrega de criativos.
 *
 * Porta a lógica do ad-naming-tool (Pedro Pimenta, `public/index.html` do
 * handoff) para dentro do board: o nome do arquivo, a árvore de pastas do
 * Drive e a proporção que separa Feed de Story são as mesmas regras de lá.
 * A diferença é de onde vêm os dados — lá a pessoa digitava tudo (quantidade,
 * frente, responsável, ID); aqui já está no card.
 *
 * Módulo puro: sem Prisma, sem `fetch`, sem DOM. A extração de largura/altura
 * de cada arquivo (`Image`/`video`) só existe no navegador e mora no
 * componente que soube ler essas dimensões (`DeliveryUploadPanel.tsx`) — este
 * módulo só recebe a proporção já calculada. Mesma divisão de
 * `lib/attachments.ts` e `lib/card-link.ts`: a UI e a rota do servidor
 * precisam concordar sobre a mesma regra, sem duplicá-la.
 */

export type DeliveryFormat = "estatico" | "video" | "animacao" | "unboxing";

export interface FormatoRegra {
  /** Formato tem "nome da peça" no arquivo final? Só vídeo, animação e unboxing. */
  nome: boolean;
  /** Nome do LOTE (não por peça) — só vídeo. */
  nomeLote: boolean;
  prefixoPasta: string;
  /** Extensão principal aceita. */
  ext: string;
}

/** Espelha `REGRA` de `public/index.html:707-717`. */
export const REGRA: Record<DeliveryFormat, FormatoRegra> = {
  estatico: { nome: false, nomeLote: false, prefixoPasta: "Estáticos", ext: "png" },
  video: { nome: true, nomeLote: true, prefixoPasta: "Vídeos", ext: "mp4" },
  animacao: { nome: true, nomeLote: false, prefixoPasta: "Animações", ext: "mp4" },
  /*
   * Novo formato, sem equivalente na ferramenta do Pedro. Sem posição
   * (Feed/Story) — ver `formatoTemPosicoes` — porque não é peça de anúncio
   * pareada, é o vídeo do unboxing em si: um slot por peça, na mesma proporção
   * da quantidade respondida no card, exatamente como vídeo já funciona.
   * `nome: true` segue o padrão de animação — o nome vem do próprio arquivo
   * enviado (`arquivo.base`), sem pedir um "nome do lote" à parte.
   */
  unboxing: { nome: true, nomeLote: false, prefixoPasta: "Unboxing", ext: "mp4" },
};

/**
 * As frentes do board, com o código curto usado no nome do arquivo — mesmos
 * códigos do Pedro (`int`, `influ`, `emb`, `unb`), preservados porque já
 * existem anos de arquivos nomeados assim. "Externo" é opção nova do
 * Creative Insights (o Pedro não tinha) — código `ext` escolhido para seguir
 * o mesmo padrão de três-a-cinco letras dos demais; ajuste aqui se a equipe
 * já usa outra abreviação em algum lugar.
 */
export const FRENTE_CODIGOS: Record<string, string> = {
  Interno: "int",
  Externo: "ext",
  Influenciadores: "influ",
  Embaixadores: "emb",
  Unboxing: "unb",
};

/**
 * Qual campo do quadro responde por "frente" — pelo CONTEÚDO, não pela chave.
 *
 * Procurava-se a chave `frente`, e isso quebrou de um jeito que não dá sinal
 * nenhum: a chave não muda quando alguém renomeia o campo (é o que preserva as
 * respostas já dadas), então o campo que um dia se chamou "Frente" virou
 * "Formato" e ficou com a chave `frente`. Um "Frente" novo nasceu com a chave
 * `frente_2`. A entrega continuou lendo `frente`, agora cheio de "Reels
 * (9:16)" — e como isso não está em `FRENTE_CODIGOS`, o nome saiu com
 * `reels-9-16` no lugar de `influ`. Sem erro em lugar nenhum: só arquivos
 * nomeados errado, indefinidamente.
 *
 * A régua passa a ser o que o campo OFERECE: vence quem tiver mais opções
 * reconhecidas como frente. É a única pergunta que não depende de nome nenhum
 * — nem de chave, nem de rótulo —, e por isso sobrevive a renomeação, a
 * duplicação e à ordem dos campos.
 *
 * Empate ou nenhum reconhecido devolve nulo, e quem chama segue sem frente no
 * nome, como já fazia quando o campo não existia.
 */
export function campoDeFrentes<T extends { key: string; options?: string | null }>(
  fields: T[]
): T | null {
  let melhor: T | null = null;
  let melhorPlacar = 0;

  for (const campo of fields) {
    let placar = 0;
    try {
      const parsed = JSON.parse(campo.options || "[]");
      const valores: string[] = Array.isArray(parsed)
        ? parsed.filter((o): o is string => typeof o === "string")
        : Object.values(parsed as Record<string, unknown>)
            .flat()
            .filter((o): o is string => typeof o === "string");
      placar = valores.filter((v) => v in FRENTE_CODIGOS).length;
    } catch {
      placar = 0;
    }

    if (placar > melhorPlacar) {
      melhorPlacar = placar;
      melhor = campo;
    }
  }

  return melhor;
}

/**
 * As frentes respondidas neste card, prontas para `montarNomeArquivo`.
 *
 * Uma função, e não a mesma leitura escrita em cada lugar: a entrega e o vídeo
 * bruto precisam concordar sobre qual campo é a frente, e foi justamente por
 * lerem coisas diferentes que um saía com `influ` e o outro com `reels-9-16`.
 */
export function frentesDoCard<T extends { key: string; options?: string | null }>(
  fields: T[],
  values: Record<string, unknown>
): string[] {
  const campo = campoDeFrentes(fields);
  if (!campo) return [];

  const resposta = values[campo.key];
  if (Array.isArray(resposta)) return resposta.filter((v): v is string => typeof v === "string");
  return typeof resposta === "string" && resposta ? [resposta] : [];
}

export interface ValidacaoFrentes {
  ok: boolean;
  erro?: string;
}

/**
 * Confere a combinação de frentes escolhida no card.
 *
 * A regra do Pedro (`toggleFrente`, `index.html:800-808`) — no máximo duas
 * frentes, e a segunda só permitida se uma delas fosse "Unboxing" — está
 * SUSPENSA por decisão da Raphael: a validação travava entregas reais com
 * mensagem que não explicava onde corrigir, e o time ainda vai alinhar quais
 * combinações valem antes de qualquer restrição voltar. `montarNomeArquivo`
 * não depende desta regra — ele concatena os códigos de quantas frentes
 * vierem, na ordem escolhida, então religar a checagem aqui não muda nada na
 * nomenclatura já gerada sem ela.
 *
 * Só o mínimo continua valendo: sem nenhuma frente escolhida não há o que
 * nomear.
 */
export function validarFrentes(frentes: string[]): ValidacaoFrentes {
  if (frentes.length === 0) return { ok: false, erro: "Escolha ao menos uma frente." };
  return { ok: true };
}

/** Remove acentos — mesma função em `public/index.html:733` e `lib/drive.js:27`. */
export function stripAcc(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const MAXNOME = 50;

/** Espaço vira hífen, acento e cedilha caem, tudo minúsculo — `slugNome` de `index.html:734-736`. */
export function slugNome(s: string): string {
  return stripAcc(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAXNOME)
    .replace(/-+$/, "");
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Nome de exibição a partir do e-mail — o card guarda `assignees` como
 * e-mails (`lib/kanban.ts`), e o Pedro digitava um nome de responsável à mão.
 * Usa a parte antes do `@`, pontos viram espaço, pra ficar "raphael
 * madureira" em vez de "raphael.madureira" antes de `slugNome`.
 */
export function nomeResponsavelDoEmail(email: string | null | undefined): string {
  const local = (email || "").split("@")[0] || "";
  return local.replace(/[._]+/g, " ").trim();
}

export interface MontarNomeInput {
  formato: DeliveryFormat;
  /** Posição da peça dentro do lote (1-based) — sempre presente, mesmo lote de 1. */
  indice: number;
  /** Rótulos do board, na ordem em que foram escolhidos (ex.: ["Unboxing", "Influenciadores"]). */
  frentes: string[];
  responsavel: string;
  /** "MKT-42" — sempre o código do próprio card, para todo formato (decisão do board: sem CAP-XXXX). */
  idCard: string;
  /** Nome da peça (estático não usa; vídeo usa o nome do LOTE, animação o da peça). */
  nomePeca?: string;
  data?: Date;
}

/**
 * Monta o nome final, sem extensão — mesma ordem de `parts()`
 * (`index.html:755-769`): índice-frente(s)-responsável-formato-(nome)-mês-ID.
 */
export function montarNomeArquivo(input: MontarNomeInput): string {
  const partes: string[] = [String(input.indice)];

  for (const frente of input.frentes) {
    partes.push(FRENTE_CODIGOS[frente] ?? slugNome(frente));
  }

  partes.push(slugNome(input.responsavel) || "sem-responsavel", input.formato);

  const regra = REGRA[input.formato];
  if (regra.nome) {
    partes.push(slugNome(input.nomePeca ?? "") || "sem-nome");
  }

  const mes = MESES[(input.data ?? new Date()).getMonth()];
  partes.push(mes, input.idCard);

  return partes.join("-");
}

/* ---------------------------------------------------------------------- */
/* Vídeo bruto de parceria                                                 */
/* ---------------------------------------------------------------------- */

/**
 * O "contexto" do nome de um vídeo bruto: `bruto` colado ao nome do parceiro.
 *
 * Sem separador nenhum entre as duas partes, e sem hífen dentro do nome —
 * `brutojoaosilva`, não `bruto-joao-silva`. É decisão da equipe, e tem uma
 * razão de leitura: todo o resto do nome já é separado por hífen, então um
 * hífen aqui faria "bruto" e "joão" parecerem dois campos do padrão em vez de
 * um só. Colado, o olho lê um bloco e sabe que aquilo é o contexto.
 *
 * Por isso NÃO usa `slugNome`, que hifeniza: acento cai, maiúscula desce, e
 * tudo que não for letra ou número simplesmente some.
 */
export function contextoBruto(nomeInfluenciador: string | null | undefined): string {
  const limpo = stripAcc(nomeInfluenciador || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // Sem nome do parceiro o contexto ainda precisa existir, senão o nome do
  // arquivo perde uma parte e deixa de casar com o padrão. "bruto" sozinho diz
  // o que é e denuncia que o card não respondeu quem é o parceiro.
  return `bruto${limpo}`;
}

export interface MontarNomeBrutoInput {
  /** Posição do vídeo no envio (1-based). */
  indice: number;
  /** As frentes do card, como rótulos — `FRENTE_CODIGOS` traduz. */
  frentes: string[];
  /** Quem está subindo o vídeo — decisão da equipe: o autor do upload, não o responsável do card. */
  responsavel: string;
  /** "MKT-2000". */
  idCard: string;
  /** O que o card respondeu em "Nome do influenciador/Embaixador". */
  nomeInfluenciador: string | null | undefined;
  data?: Date;
}

/**
 * O nome de um vídeo bruto, sem extensão.
 *
 * Passa pelo MESMO `montarNomeArquivo` da entrega, com `formato: "video"` e o
 * contexto ocupando a casa do nome da peça — que em vídeo já é o slot do nome
 * do lote. Escrito assim, bruto e entrega saem com a mesma ordem de campos
 * (índice, frentes, responsável, formato, nome, mês, ID), que foi a decisão
 * tomada: o padrão do time é um só, e a única diferença entre um bruto e uma
 * entrega de vídeo é o que está escrito na casa do nome.
 *
 * Fazer um montador separado teria produzido duas ordens divergindo com o
 * tempo — é exatamente o defeito que este módulo existe para não ter.
 */
export function montarNomeBruto(input: MontarNomeBrutoInput): string {
  return montarNomeArquivo({
    formato: "video",
    indice: input.indice,
    frentes: input.frentes,
    responsavel: input.responsavel,
    idCard: input.idCard,
    nomePeca: contextoBruto(input.nomeInfluenciador),
    data: input.data,
  });
}

/* ---------------------------------------------------------------------- */
/* Casamento de arquivos por proporção — porta de UPLOAD_SPEC/             */
/* recomputarMatches (`index.html:1060-1170`).                            */
/* ---------------------------------------------------------------------- */

export type Posicao = "feed" | "story";

/** Proporção alvo (largura/altura) de cada posição, com a mesma tolerância do Pedro. */
export const POSICAO_RATIO: Record<Posicao, number> = { feed: 0.8, story: 0.5625 };
const TOLERANCIA_RATIO = 0.07;

/** Estático e animação esperam o par Feed+Story; vídeo e unboxing são peça avulsa (sem posição). */
export function formatoTemPosicoes(formato: DeliveryFormat): boolean {
  return formato === "estatico" || formato === "animacao";
}

export interface ArquivoParaCasar {
  /** Índice de `pool` de onde este arquivo veio — devolvido no resultado para religar ao arquivo original. */
  poolIndex: number;
  /** Nome do arquivo sem extensão, como veio da exportação. */
  base: string;
  extensao: string;
  /** largura/altura, quando foi possível medir (imagem/vídeo reconhecido). `null` sem leitura. */
  ratio: number | null;
}

export interface CasamentoPeca {
  /** Para formatos com posição: um arquivo por slot. Para vídeo: até um arquivo, sem slot. */
  feed?: number | null;
  story?: number | null;
  video?: number | null;
  /** `true` quando o casamento veio de nome exato (alta confiança); `false` quando foi só por proporção/sobra. */
  confiancas: Record<string, boolean>;
}

/**
 * Sugere, para cada peça (1..quantidade) do lote, qual arquivo do `pool` vai
 * em qual posição — três passadas, na mesma ordem do Pedro:
 *
 * A) nome do arquivo já bate exatamente com o nome que este módulo geraria;
 * B) proporção mais próxima do alvo (tolerância 0,07), em ordem alfabética
 *    como desempate;
 * C) sobras, em ordem alfabética, para peça ainda sem arquivo nenhum.
 *
 * Não decide sozinho: devolve a sugestão, e quem chama (a UI) mostra pra
 * confirmar antes de subir — igual ao Pedro, que também deixava revisar.
 */
export function casarArquivos(params: {
  pool: ArquivoParaCasar[];
  quantidade: number;
  formato: DeliveryFormat;
  extensaoEsperada: string;
  /** Nome que cada peça teria, pré-calculado com `montarNomeArquivo` — usado só na passada A. */
  nomeEsperadoPorIndice: (indice: number) => string;
}): CasamentoPeca[] {
  const { pool, quantidade, formato, extensaoEsperada, nomeEsperadoPorIndice } = params;
  const usados = new Set<number>();
  const resultado: CasamentoPeca[] = Array.from({ length: quantidade }, () => ({ confiancas: {} }));
  const combinaExtensao = (p: ArquivoParaCasar) => p.extensao.toLowerCase() === extensaoEsperada.toLowerCase();

  const comPosicao = formatoTemPosicoes(formato);
  const slots: Posicao[] = comPosicao ? ["feed", "story"] : [];

  // Passo A — nome exato.
  for (let i = 0; i < quantidade; i++) {
    const alvo = slugNome(nomeEsperadoPorIndice(i + 1));
    for (const p of pool) {
      if (usados.has(p.poolIndex) || !combinaExtensao(p)) continue;
      if (slugNome(p.base) !== alvo) continue;
      usados.add(p.poolIndex);
      if (comPosicao) {
        // Sem posição no nome exato: cai no primeiro slot livre desta peça.
        const slotLivre = slots.find((s) => resultado[i][s] == null);
        if (slotLivre) {
          resultado[i][slotLivre] = p.poolIndex;
          resultado[i].confiancas[slotLivre] = true;
        }
      } else {
        resultado[i].video = p.poolIndex;
        resultado[i].confiancas.video = true;
      }
      break;
    }
  }

  if (comPosicao) {
    // Passo B — proporção mais próxima, ordem alfabética como desempate.
    for (const slot of slots) {
      const alvoRatio = POSICAO_RATIO[slot];
      const candidatos = pool
        .filter((p) => !usados.has(p.poolIndex) && combinaExtensao(p) && p.ratio != null)
        .filter((p) => Math.abs((p.ratio as number) - alvoRatio) < TOLERANCIA_RATIO)
        .sort((a, b) => a.base.localeCompare(b.base));

      let c = 0;
      for (let i = 0; i < quantidade; i++) {
        if (resultado[i][slot] != null) continue;
        if (c >= candidatos.length) break;
        const p = candidatos[c++];
        usados.add(p.poolIndex);
        resultado[i][slot] = p.poolIndex;
        resultado[i].confiancas[slot] = false;
      }
    }
  } else {
    // Vídeo — passo B: nome da peça contido no nome do arquivo; passo C: sobra alfabética.
    const sobras = pool
      .filter((p) => !usados.has(p.poolIndex) && combinaExtensao(p))
      .sort((a, b) => a.base.localeCompare(b.base));

    let s = 0;
    for (let i = 0; i < quantidade; i++) {
      if (resultado[i].video != null) continue;
      if (s >= sobras.length) break;
      const p = sobras[s++];
      usados.add(p.poolIndex);
      resultado[i].video = p.poolIndex;
      resultado[i].confiancas.video = false;
    }
  }

  return resultado;
}

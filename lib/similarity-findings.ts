/**
 * O achado de um grupo de similaridade: o diagnóstico, o porquê e a ação.
 *
 * A página listava grupos rotulados por sintoma — "Concorrência Alta",
 * "Anúncios Muito Parecidos" — sem dizer o que estava acontecendo, por que o
 * algoritmo fez aquilo, nem o que a equipe de criação deveria fazer a respeito.
 * Quem lia recebia um bolo de cartões e métricas e tinha que inferir tudo.
 *
 * O achado é calculado dos próprios números, sem IA: aparece na hora, em todo
 * grupo, sem custo de token. A análise da IA continua existindo para
 * aprofundar — ela lê as artes; esta função só lê a distribuição.
 */

import { concentratingCreatives } from "./similarity";

export type FindingKind = "same-art" | "cannibalized" | "split";

export interface FindingCreative {
  id: string;
  adName: string;
  spend: number;
  purchases?: number;
  categoryName?: string | null;
}

export interface FindingGroup {
  reason: string;
  platform?: string | null;
  totalSpend: number;
  cannibalizationRate: number;
  creatives: FindingCreative[];
}

export interface Finding {
  kind: FindingKind;
  /** Grave o suficiente para exigir ação hoje. */
  urgent: boolean;
  /** O que está acontecendo, em uma frase, com os números. */
  headline: string;
  /** Por que o algoritmo do canal se comportou assim. */
  why: string;
  /** O que a equipe de criação faz a respeito. */
  action: string;
  /** Verba fragmentada fora da peça líder — a base do ranqueamento. */
  fragmentedSpend: number;
  /** A peça que ficou com a maior fatia. */
  leader: FindingCreative;
  /** As peças concorrentes que ficaram para trás. */
  trailing: FindingCreative[];
}

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

/** Acima disso, uma peça tomou a verba do grupo para si. */
const DOMINANT_SHARE = 0.75;

/**
 * O porquê, por canal.
 *
 * O texto do Meta sai do material do time sobre o Andromeda — o criativo é a
 * segmentação, então duas peças que comunicam o mesmo pedem a mesma audiência.
 * O do TikTok é deliberadamente mais contido: não há material registrado sobre
 * aquele algoritmo, e afirmar mecanismo que ninguém verificou seria inventar.
 */
function whyForPlatform(platform: string | null | undefined, kind: FindingKind): string {
  const key = (platform || "META").toUpperCase();

  if (key === "META") {
    if (kind === "same-art") {
      return "O Andromeda lê a arte para decidir quem a vê. Sendo a mesma arte, os anúncios são candidatos idênticos na recuperação — ele escolhe um e o resto vira redundância que não amplia alcance nenhum.";
    }
    if (kind === "cannibalized") {
      return "O criativo é a segmentação: o Andromeda lê a peça para decidir quem a vê. Comunicando a mesma coisa, estas peças pedem a mesma audiência, e o modelo de ranqueamento concentra a entrega naquela que já pontua melhor. A preterida não perdeu por qualidade — ela nem chegou a ser recuperada.";
    }
    return "Peças que comunicam o mesmo disputam a mesma audiência no Andromeda, e a verba se reparte entre elas. Repartida, nenhuma junta sinal de conversão suficiente para o algoritmo validar a previsão e escalar — é o aprendizado fragmentado entre variações que ele trata como a mesma coisa.";
  }

  if (key === "TIKTOK") {
    if (kind === "same-art") {
      return "São a mesma arte em anúncios diferentes: para qualquer algoritmo de entrega, candidatos idênticos competindo entre si. Não há material registrado do time sobre o algoritmo do TikTok, então trate o mecanismo como hipótese — o fato observável é a divisão da verba.";
    }
    return "A distribuição observada mostra o algoritmo do TikTok concentrando a entrega entre peças parecidas. Não há material registrado do time sobre esse algoritmo, então o mecanismo é hipótese; o número é o fato.";
  }

  return "A verba se repartiu entre peças que o algoritmo do canal tratou como concorrentes.";
}

function actionFor(kind: FindingKind, trailingCount: number): string {
  if (kind === "same-art") {
    return `É a mesma arte em ${trailingCount + 1} anúncios. Mantenha um e pause os demais, ou produza arte nova de verdade para os outros — duplicar o mesmo criativo não amplia alcance, só divide o histórico dele.`;
  }
  if (kind === "cannibalized") {
    return "A preterida não vai escalar competindo com a líder. Ou pause e realoque a verba, ou refaça a peça mudando o que o algoritmo lê como conteúdo: ângulo, cena, pessoa, promessa. Trocar cor, fonte ou legenda não cria uma peça nova para ele.";
  }
  return "Escolha a peça de melhor CPA para concentrar e diferencie as outras de verdade — ângulo, gancho dos primeiros segundos, cenário ou oferta. Enquanto forem variações do mesmo, o algoritmo segue repartindo e nenhuma alcança volume para escalar.";
}

/** Nome curto da peça para a frase do diagnóstico. */
function shortName(creative: FindingCreative): string {
  const name = creative.adName || "(sem nome)";
  return name.length > 44 ? `${name.slice(0, 44)}…` : name;
}

/**
 * O achado do grupo, ou `null` quando não há disputa a relatar.
 *
 * Trabalha só com as peças que concentraram verba — a cauda que o algoritmo não
 * entregou não é parte da disputa, e incluí-la inflaria a "verba fragmentada"
 * com dinheiro que nunca esteve em jogo.
 */
export function buildFinding(group: FindingGroup): Finding | null {
  const competing = concentratingCreatives(group.creatives);
  if (competing.length < 2) return null;

  const [leader, ...trailing] = competing;
  const competingSpend = competing.reduce((acc, c) => acc + c.spend, 0);
  const fragmentedSpend = competingSpend - leader.spend;
  const leaderShare = competingSpend > 0 ? leader.spend / competingSpend : 0;

  const sameArt = group.reason === "Imagens Idênticas";
  const kind: FindingKind = sameArt
    ? "same-art"
    : leaderShare >= DOMINANT_SHARE
      ? "cannibalized"
      : "split";

  const pieces = `${competing.length} peças`;
  const sharePct = `${Math.round(leaderShare * 100)}%`;

  let headline: string;
  if (kind === "same-art") {
    headline = `A mesma arte em ${pieces} concorrentes. "${shortName(leader)}" ficou com ${sharePct} (${brl(leader.spend)}) e as outras dividiram ${brl(fragmentedSpend)}.`;
  } else if (kind === "cannibalized") {
    headline = `${pieces} muito parecidas, e uma tomou a verba: "${shortName(leader)}" com ${sharePct} (${brl(leader.spend)}). As demais somam ${brl(fragmentedSpend)} sem escalar.`;
  } else {
    headline = `${pieces} muito parecidas repartindo a verba — a maior fatia é de apenas ${sharePct}. ${brl(fragmentedSpend)} estão espalhados entre concorrentes que o algoritmo trata como a mesma coisa.`;
  }

  /*
   * Urgência é sobre dinheiro em jogo, não sobre o formato do caso: R$ 400
   * repartidos entre duas peças de teste não tiram ninguém do lugar, e é
   * justamente esse tipo de item que transformava a página num bolo.
   */
  const urgent = fragmentedSpend >= 1000 || (kind === "same-art" && fragmentedSpend >= 300);

  return {
    kind,
    urgent,
    headline,
    why: whyForPlatform(group.platform, kind),
    action: actionFor(kind, trailing.length),
    fragmentedSpend,
    leader,
    trailing,
  };
}

/** Rótulo curto do tipo de achado, para o selo do cabeçalho. */
export const FINDING_LABELS: Record<FindingKind, string> = {
  "same-art": "Mesma arte duplicada",
  cannibalized: "Uma peça tomou a verba",
  split: "Verba repartida, nenhuma escala",
};

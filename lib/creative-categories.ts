/**
 * As categorias de criativo — Prime Winners, Winners, Testando… — e a regra que
 * decide em qual cada peça cai.
 *
 * A regra morava dentro de `app/api/db-ads/route.ts`, o que bastava enquanto só
 * o painel categorizava. Deixou de bastar quando o gerador de copy passou a
 * precisar da mesma resposta: "esta peça é vencedora?" precisa ser respondida
 * igual nos dois lugares, senão o card diz Winner na tela e a IA aprende com
 * outra coisa. É a mesma razão de `lib/creative-metrics.ts` existir — o número
 * que aparece é o número que decide.
 *
 * Módulo puro: recebe os totais já somados e devolve o índice da categoria.
 * Quem lê o banco é quem chama.
 */

import { calculateCpa, referenceRevenue, type CreativeTotals } from "./creative-metrics";

export interface CategoryRule {
  minSpend?: number;
  minReturn?: number;
  maxCpa?: number;
}

export interface CreativeCategory {
  id: string;
  name: string;
  color?: string;
  /** Regras por canal (`META`, `TIKTOK`, `GOOGLE`), com `META` como reserva. */
  rules: Record<string, CategoryRule>;
}

/** O que vale enquanto ninguém configurou categorias em Configurações → Metas. */
export const DEFAULT_CATEGORIES: CreativeCategory[] = [
  {
    id: "cat_super_winners",
    name: "Super Winners",
    color: "var(--success)",
    rules: {
      META: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
      TIKTOK: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
      GOOGLE: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
    },
  },
  {
    id: "cat_winners",
    name: "Winners",
    color: "var(--primary)",
    rules: {
      META: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
      TIKTOK: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
      GOOGLE: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
    },
  },
];

/** Os campos antigos, de quando havia exatamente duas categorias em colunas. */
export interface LegacyCategorySettings {
  creativeCategories?: string | null;
  superWinnerSpend?: number | null;
  superWinnerReturn?: number | null;
  superWinnerCpa?: number | null;
  winnerSpend?: number | null;
  winnerReturn?: number | null;
  winnerCpa?: number | null;
}

/**
 * As categorias configuradas, ou as padrão temperadas pelos campos antigos.
 *
 * JSON inválido cai no padrão em vez de derrubar a leitura: a lista é editada à
 * mão na tela de metas, e uma vírgula sobrando não pode deixar o painel inteiro
 * sem categoria nenhuma.
 */
export function loadCategories(settings: LegacyCategorySettings | null | undefined): CreativeCategory[] {
  if (settings?.creativeCategories) {
    try {
      const parsed = JSON.parse(settings.creativeCategories);
      if (Array.isArray(parsed) && parsed.length) return parsed as CreativeCategory[];
    } catch {
      /* cai no padrão abaixo */
    }
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }

  const categories: CreativeCategory[] = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  if (settings) {
    categories[0].rules.META.minSpend = settings.superWinnerSpend ?? 1000;
    categories[0].rules.META.minReturn = settings.superWinnerReturn ?? 5000;
    categories[0].rules.META.maxCpa = settings.superWinnerCpa ?? 50;
    categories[1].rules.META.minSpend = settings.winnerSpend ?? 500;
    categories[1].rules.META.minReturn = settings.winnerReturn ?? 2000;
    categories[1].rules.META.maxCpa = settings.winnerCpa ?? 60;
  }
  return categories;
}

/**
 * Em qual categoria a peça cai — o índice, ou `-1` para nenhuma.
 *
 * A primeira que servir vence: a lista está em ordem de prioridade, da mais
 * exigente para a menos. Um limite em zero é "sem limite", e não "limite zero" —
 * é como a tela de metas grava um campo deixado em branco.
 */
export function matchCategoryIndex(
  totals: CreativeTotals,
  platform: string | null | undefined,
  categories: CreativeCategory[]
): number {
  const canal = (platform || "META").toUpperCase();
  const cpa = calculateCpa(totals);
  const retorno = referenceRevenue(totals);

  for (let i = 0; i < categories.length; i++) {
    const rules = categories[i].rules?.[canal] || categories[i].rules?.META || {};

    const minSpend = rules.minSpend || 0;
    const minReturn = rules.minReturn || 0;
    const maxCpa = rules.maxCpa || 0;

    const serve =
      (minSpend === 0 || totals.spend >= minSpend) &&
      (minReturn === 0 || retorno >= minReturn) &&
      (maxCpa === 0 || cpa <= maxCpa);

    if (serve) return i;
  }

  return -1;
}

/**
 * A categoria cujas peças servem de modelo para a IA.
 *
 * É "Winners", e só ela — não a mais exigente da lista, o que parece errado e
 * não é. O percurso de um criativo nesta operação é **validar, virar winner,
 * escalar**: o winner é a peça que provou um padrão repetível. Super Winners e
 * Prime Winners são peças fora da curva, e é por isso que estão em categorias
 * separadas — aprender com elas é aprender o acontecimento, não o método.
 * "Validando" e "Testando", na outra ponta, ainda não provaram nada.
 *
 * Reconhecida pelo id antes do nome: `cat_winners` sobreviveu a todas as
 * reconfigurações da tela de metas. O nome exato é a reserva, e ele precisa ser
 * exato — "Super Winners" contém "Winners", e um `includes` traria de volta
 * justamente as duas categorias que esta função existe para deixar de fora.
 */
export function isReferenceCategory(category: Pick<CreativeCategory, "id" | "name">): boolean {
  return category.id === "cat_winners" || /^\s*winners?\s*$/i.test(category.name ?? "");
}

/** O índice da categoria de referência na lista, ou `-1` se ela não existir. */
export function referenceCategoryIndex(categories: CreativeCategory[]): number {
  return categories.findIndex(isReferenceCategory);
}

/**
 * As categorias de performance de um criativo — Winners, Testando, etc.
 *
 * Vive aqui porque duas telas precisam do MESMO veredito: a home agrupa os
 * criativos por categoria, e a análise de similaridade mostra em que categoria
 * cada peça do grupo caiu. Enquanto a regra existia só dentro de `/api/db-ads`,
 * a segunda tela não tinha como concordar com a primeira.
 *
 * A ordem das categorias é a prioridade: vale a primeira que casar.
 */

import { calculateCpa, referenceRevenue, type CreativeTotals } from "./creative-metrics";

export interface CategoryRule {
  minSpend?: number;
  minReturn?: number;
  maxCpa?: number;
  minCpa?: number;
}

export interface CreativeCategory {
  id: string;
  name: string;
  color: string;
  rules: Record<string, CategoryRule>;
}

/** Usado quando o painel ainda não tem categorias salvas. */
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

/**
 * As categorias configuradas no painel, ou o padrão.
 *
 * Recebe o texto cru de `SystemSettings.creativeCategories` — JSON inválido cai
 * no padrão em vez de derrubar a rota.
 */
export function resolveCategories(creativeCategories: string | null | undefined): CreativeCategory[] {
  if (!creativeCategories) return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));

  try {
    const parsed = JSON.parse(creativeCategories);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }
}

/**
 * A categoria do criativo, ou `null` quando nenhuma regra casa.
 *
 * Os totais são os ACUMULADOS de veiculação, não os do período filtrado — é
 * assim que a home decide, e uma peça não deve trocar de categoria porque
 * alguém mudou o filtro de datas.
 */
export function matchCategory(
  totals: CreativeTotals,
  platform: string | null | undefined,
  categories: CreativeCategory[]
): (CreativeCategory & { index: number }) | null {
  const key = (platform || "META").toUpperCase();
  const cpa = calculateCpa(totals);
  const revenue = referenceRevenue(totals);

  for (const [index, category] of categories.entries()) {
    const rule = category.rules?.[key] || category.rules?.META;
    if (!rule) continue;

    const minSpend = rule.minSpend || 0;
    const minReturn = rule.minReturn || 0;
    const maxCpa = rule.maxCpa || 0;

    const matches =
      (minSpend === 0 || totals.spend >= minSpend) &&
      (minReturn === 0 || revenue >= minReturn) &&
      (maxCpa === 0 || cpa <= maxCpa);

    // O índice acompanha a categoria: é a hierarquia declarada no painel, e as
    // telas precisam dela para ordenar do melhor resultado para o teste.
    if (matches) return { ...category, index };
  }

  return null;
}

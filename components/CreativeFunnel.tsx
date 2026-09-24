"use client";

import { useMemo } from "react";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { FbIcon, TikTokIcon } from "@/components/CreativeCardPrimitives";
import { Skeleton } from "@/components/Skeleton";

const CHANNELS: { key: string; label: string; color: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "META", label: "Meta", color: "#1877F2", Icon: FbIcon },
  { key: "TIKTOK", label: "TikTok", color: "#FF0050", Icon: TikTokIcon },
];

function previousMonthRange(fromISO: string): { from: string; to: string } {
  const d = new Date(`${fromISO}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // dia 0 do mês atual = último dia do anterior
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

function mesLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * Quantos anúncios de cada categoria, por canal — os MESMOS predicados de
 * `FunnelsOverview` (`filterByDesigner`/`filterByChannel`/`filterByDate`),
 * para que a contagem aqui seja idêntica, canal a canal, à que já aparece no
 * "?" de cada categoria ali. Duplicado de propósito: são poucas linhas, e
 * importar de um componente de tela para outro acoplaria os dois por um
 * detalhe de exibição.
 */
function contarPorCategoriaECanal(
  categorizedAds: any[],
  { dateFrom, dateTo, hideOldAds, channelFilter, selectedDesigner, creators }: {
    dateFrom: string; dateTo: string; hideOldAds: boolean;
    channelFilter?: string; selectedDesigner: string | null; creators: any[];
  }
): { id: string; label: string; counts: Record<string, number> }[] {
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T23:59:59.999Z`);

  const passaCriador = (ad: any) => {
    if (!selectedDesigner) return true;
    const selecionados = selectedDesigner.split(",").map((s) => s.trim().toUpperCase());
    const acronimosAtivos = creators.flatMap((c) => c.acronym.split(",").map((s: string) => s.trim().toUpperCase()));
    const cDesigner = (ad.designer || "").trim().toUpperCase();
    if (selectedDesigner === "UNKNOWN") return !cDesigner || !acronimosAtivos.includes(cDesigner);
    return selecionados.includes(cDesigner);
  };

  const passaCanal = (ad: any) => {
    if (!channelFilter || channelFilter === "ALL") return true;
    return (ad.platform || "META").toUpperCase() === channelFilter.toUpperCase();
  };

  const passaData = (ad: any) => {
    if (!hideOldAds) return true;
    if (!ad.createdTime) return false;
    const criado = new Date(ad.createdTime);
    return criado >= start && criado <= end;
  };

  return (categorizedAds ?? []).map((cat) => {
    const counts: Record<string, number> = { META: 0, TIKTOK: 0, GOOGLE: 0 };
    for (const ad of cat.ads ?? []) {
      if (!passaCriador(ad) || !passaCanal(ad) || !passaData(ad)) continue;
      const plat = (ad.platform || "META").toUpperCase();
      if (plat in counts) counts[plat]++;
    }
    return { id: cat.id || cat.name, label: cat.name, counts };
  });
}

function percentOf(atual: number, anterior: number | null): number | null {
  if (anterior === null) return null;
  return anterior > 0 ? (atual / anterior) * 100 : 0;
}

/** Verde quando a quebra deste mês bate ou supera a do mês anterior, vermelho quando fica abaixo. */
function corDaQuebra(percent: number | null, ref: number | null): string {
  if (percent === null || ref === null) return "var(--foreground)";
  return percent >= ref ? "var(--success, #10b981)" : "var(--danger, #ef4444)";
}

interface CreativeFunnelProps {
  dateFrom: string;
  dateTo: string;
  statusFilter?: string;
  channelFilter?: string;
  selectedDesigner: string | null;
  creators: any[];
  hideOldAds: boolean;
}

/**
 * O funil de maturidade dos criativos lançados no período — a MESMA
 * categorização e os MESMOS filtros de `FunnelsOverview` (busca de novo em
 * `/api/db-ads`, não reaproveita a resposta em memória, para não acoplar os
 * dois componentes), com a "quebra" (% do estágio anterior na lista de
 * categorias) contra o mesmo cálculo no mês anterior.
 */
export default function CreativeFunnel({
  dateFrom, dateTo, statusFilter, channelFilter, selectedDesigner, creators, hideOldAds,
}: CreativeFunnelProps) {
  const statusParam = statusFilter || "ACTIVE";
  const refRange = useMemo(() => previousMonthRange(dateFrom), [dateFrom]);

  const currentUrl = dateFrom && dateTo ? `/api/db-ads?from=${dateFrom}&to=${dateTo}&status=${statusParam}` : null;
  const refUrl = `/api/db-ads?from=${refRange.from}&to=${refRange.to}&status=${statusParam}`;

  const { data: currentRes, loading } = useCacheFetch<any>(currentUrl);
  const { data: refRes } = useCacheFetch<any>(refUrl);

  const filtros = { dateFrom, dateTo, hideOldAds, channelFilter, selectedDesigner, creators };
  const refFiltros = { ...filtros, dateFrom: refRange.from, dateTo: refRange.to };

  const atual = useMemo(
    () => (currentRes?.success ? contarPorCategoriaECanal(currentRes.data.categorizedAds, filtros) : null),
    [currentRes, dateFrom, dateTo, hideOldAds, channelFilter, selectedDesigner, creators]
  );
  const referencia = useMemo(
    () => (refRes?.success ? contarPorCategoriaECanal(refRes.data.categorizedAds, refFiltros) : null),
    [refRes, refRange.from, refRange.to, hideOldAds, channelFilter, selectedDesigner, creators]
  );

  const presentes = CHANNELS.filter((c) => (atual ?? []).some((cat) => cat.counts[c.key] > 0));

  return (
    <div className="allu-card" style={{ marginTop: "1.5rem" }}>
      <div className="allu-card-label" style={{ marginBottom: "0.25rem" }}>
        ◇ FUNIL DE MATURIDADE DOS CRIATIVOS
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: "var(--text-caption)", color: "var(--muted)" }}>
        Ref. = mesma quebra em {mesLabel(refRange.from)}
      </p>

      {loading && !atual && (
        <div style={{ display: "flex", gap: "1rem" }}>
          <Skeleton height={160} />
          <Skeleton height={160} />
        </div>
      )}

      {!loading && atual && presentes.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: "var(--text-cardtitle)" }}>
          Nenhum criativo lançado neste período ainda.
        </p>
      )}

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        {atual && presentes.map(({ key, label, color, Icon }) => (
          <div key={key} style={{ flex: "1 1 320px", minWidth: "280px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span style={{ color }}>
                <Icon size={16} />
              </span>
              <strong style={{ fontSize: "var(--text-cardtitle)" }}>{label}</strong>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-control)" }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={{ fontWeight: 400, paddingBottom: "0.4rem" }}>Etapa</th>
                  <th style={{ fontWeight: 400, paddingBottom: "0.4rem", textAlign: "right" }}>Qtd.</th>
                  <th style={{ fontWeight: 400, paddingBottom: "0.4rem", textAlign: "right" }}>Quebra</th>
                  <th style={{ fontWeight: 400, paddingBottom: "0.4rem", textAlign: "right" }}>Ref.</th>
                </tr>
              </thead>
              <tbody>
                {atual.map((cat, i) => {
                  const count = cat.counts[key];
                  const anterior = i > 0 ? atual[i - 1].counts[key] : null;
                  const percent = percentOf(count, anterior);

                  const refCat = referencia?.[i];
                  const refAnterior = i > 0 ? referencia?.[i - 1]?.counts[key] ?? null : null;
                  const refPercent = refCat ? percentOf(refCat.counts[key], refAnterior) : null;

                  return (
                    <tr key={cat.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <td style={{ padding: "0.4rem 0" }}>{cat.label}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{count}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: corDaQuebra(percent, refPercent) }}>
                        {percent === null ? "—" : `${percent.toFixed(0)}%`}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--muted)" }}>
                        {refPercent === null ? "—" : `${refPercent.toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

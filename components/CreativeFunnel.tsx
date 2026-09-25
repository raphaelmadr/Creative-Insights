"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import { isAdminRole } from "@/lib/roles";
import { FbIcon, TikTokIcon } from "@/components/CreativeCardPrimitives";
import { Skeleton } from "@/components/Skeleton";
import { useNotifications } from "@/components/NotificationProvider";
import { nomeIndicaOutroMes } from "@/lib/ad-name-month";

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
  { dateFrom, dateTo, hideOldAds, channelFilter, selectedDesigner, creators, novos }: {
    dateFrom: string; dateTo: string; hideOldAds: boolean;
    channelFilter?: string; selectedDesigner: string | null; creators: any[]; novos: boolean;
  }
): { id: string; label: string; counts: Record<string, number>; refs: Record<string, number> | null }[] {
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

  /* Nos novos, lançado no período sempre vale — o botão de ocultar antigos
     não desliga essa regra — e o nome não pode indicar peça de outro mês. */
  const passaData = (ad: any) => {
    if (!hideOldAds && !novos) return true;
    if (!ad.createdTime) return false;
    const criado = new Date(ad.createdTime);
    return criado >= start && criado <= end;
  };

  return (categorizedAds ?? []).map((cat) => {
    const counts: Record<string, number> = { META: 0, TIKTOK: 0, GOOGLE: 0 };
    for (const ad of cat.ads ?? []) {
      if (!passaCriador(ad) || !passaCanal(ad) || !passaData(ad)) continue;
      if (novos && nomeIndicaOutroMes(ad.ad_name, dateFrom, dateTo)) continue;
      const plat = (ad.platform || "META").toUpperCase();
      if (plat in counts) counts[plat]++;
    }
    /* Cada funil lê os próprios alvos — ver `refsNovos` em `lib/creative-categories`. */
    return { id: cat.id || cat.name, label: cat.name, counts, refs: (novos ? cat.refsNovos : cat.refs) ?? null };
  });
}

/**
 * A referência definida para esta etapa e canal — a que se digita na própria
 * tabela do funil.
 *
 * `null` é ausência, e zero é um alvo — "esta etapa não deveria receber nada".
 * São coisas diferentes, e só a ausência manda o funil olhar o mês anterior.
 */
function refEscrita(cat: { refs: Record<string, number> | null }, canal: string): number | null {
  const v = cat.refs?.[canal];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A chave de uma célula editável: etapa e canal. */
const celula = (catId: string, canal: string) => `${catId}|${canal}`;

/**
 * O alvo que vale na tela — o que acabou de ser digitado, se houver, e só
 * depois o que veio do banco.
 *
 * As referências chegam dentro da resposta de `/api/db-ads`, que é pesada e
 * fica em cache de sessão. Reler tudo para ver um número que a própria pessoa
 * acabou de escrever seria caro e lento; o que foi gravado com sucesso passa a
 * valer aqui até a próxima carga da página.
 */
function alvoDe(
  cat: { id: string; refs: Record<string, number> | null },
  canal: string,
  locais: Record<string, number | null>
): number | null {
  const chave = celula(cat.id, canal);
  return chave in locais ? locais[chave] : refEscrita(cat, canal);
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
  /** Só peças feitas no período: lançadas nele e sem data ou mês antigo no nome. */
  novos?: boolean;
}

/**
 * O funil de maturidade dos criativos lançados no período — a MESMA
 * categorização e os MESMOS filtros de `FunnelsOverview` (busca de novo em
 * `/api/db-ads`, não reaproveita a resposta em memória, para não acoplar os
 * dois componentes), com a "quebra" (% do estágio anterior na lista de
 * categorias) contra o alvo que o time define em cada célula da coluna "Ref.".
 *
 * Sem alvo escrito, a referência é a mesma quebra no mês anterior — o que serve
 * enquanto ninguém definiu nada, e só vale se aquele mês estiver inteiro no
 * banco. É por isso que o alvo existe: o mês anterior nem sempre está.
 */
export default function CreativeFunnel({
  dateFrom, dateTo, statusFilter, channelFilter, selectedDesigner, creators, hideOldAds, novos = false,
}: CreativeFunnelProps) {
  const { data: session } = useSession();
  /* O alvo vale para todo mundo que abre o painel, então quem o define é admin
     — a rota recusa o resto de qualquer forma. */
  const podeEditar = isAdminRole(session?.user?.role);

  /** O que foi gravado nesta visita, por célula. `null` é "apagado". */
  const [alvos, setAlvos] = useState<Record<string, number | null>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const statusParam = statusFilter || "ACTIVE";
  const refRange = useMemo(() => previousMonthRange(dateFrom), [dateFrom]);

  const currentUrl = dateFrom && dateTo ? `/api/db-ads?from=${dateFrom}&to=${dateTo}&status=${statusParam}` : null;
  const { data: currentRes, loading, mutate } = useCacheFetch<any>(currentUrl);

  /* Recarrega a cada sincronização, como `FunnelsOverview` — sem isto, as
     categorias acima mostravam os números novos e o funil seguia com os da
     abertura da página. */
  const { syncCounter } = useNotifications();
  useEffect(() => {
    if (syncCounter > 0) mutate();
  }, [syncCounter, mutate]);

  const filtros = { dateFrom, dateTo, hideOldAds, channelFilter, selectedDesigner, creators, novos };

  const atual = useMemo(
    () => (currentRes?.success ? contarPorCategoriaECanal(currentRes.data.categorizedAds, filtros) : null),
    [currentRes, dateFrom, dateTo, hideOldAds, channelFilter, selectedDesigner, creators, novos]
  );

  /*
   * Os canais que aparecem e o que se sabe das referências deles — em uma
   * passada só, porque as três respostas saem da mesma varredura.
   *
   * O mês anterior só é buscado quando falta referência escrita em alguma
   * etapa de algum canal na tela. Com todas preenchidas, é uma volta ao banco a
   * menos por abertura do painel — e, o que importa mais, o número deixa de
   * depender de um mês que pode não estar inteiro sincronizado.
   *
   * A primeira etapa fica de fora: sem etapa acima, não há quebra a comparar.
   */
  const { presentes, faltaReferencia, temEscrita } = useMemo(() => {
    const lista = atual ?? [];
    const canais = CHANNELS.filter((c) => lista.some((cat) => cat.counts[c.key] > 0));
    const definidos = lista.slice(1).flatMap((cat) => canais.map((c) => alvoDe(cat, c.key, alvos)));
    return {
      presentes: canais,
      faltaReferencia: definidos.some((v) => v === null),
      temEscrita: definidos.some((v) => v !== null),
    };
  }, [atual, alvos]);

  const refUrl = faltaReferencia
    ? `/api/db-ads?from=${refRange.from}&to=${refRange.to}&status=${statusParam}`
    : null;
  const { data: refRes } = useCacheFetch<any>(refUrl);

  const refFiltros = { ...filtros, dateFrom: refRange.from, dateTo: refRange.to };
  const referencia = useMemo(
    () => (refRes?.success ? contarPorCategoriaECanal(refRes.data.categorizedAds, refFiltros) : null),
    [refRes, refRange.from, refRange.to, hideOldAds, channelFilter, selectedDesigner, creators, novos]
  );

  /* Só vale distinguir a origem na tela quando as duas convivem. */
  const misturado = temEscrita && faltaReferencia;

  /*
   * Grava uma célula. O número aparece na hora e só depois vai ao servidor —
   * a resposta de `/api/db-ads` é pesada demais para ser relida por causa de um
   * campo. Se a gravação falhar, o valor anterior volta e o erro aparece, para
   * que ninguém saia daqui achando que definiu um alvo que não existe.
   */
  const salvar = async (cat: { id: string; refs: Record<string, number> | null }, canal: string, texto: string) => {
    const chave = celula(cat.id, canal);
    const anterior = alvoDe(cat, canal, alvos);
    const limpo = texto.trim().replace(",", ".");
    const valor = limpo === "" ? null : Number(limpo);

    setEditando(null);
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setErro("A referência precisa ser um número positivo.");
      return;
    }
    if (valor === anterior) return;

    setErro(null);
    setAlvos((atuais) => ({ ...atuais, [chave]: valor }));

    try {
      const res = await fetch("/api/creative-funnel/refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: cat.id, channel: canal, value: valor, funnel: novos ? "novos" : "geral" }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Não foi possível gravar.");
    } catch (e) {
      setAlvos((atuais) => ({ ...atuais, [chave]: anterior }));
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    }
  };

  return (
    /* O título é o cabeçalho numerado da seção, em app/page.tsx — repeti-lo
       aqui dentro daria dois nomes para a mesma coisa. */
    <div className="allu-card">
      <p style={{ margin: "0 0 1rem", fontSize: "var(--text-caption)", color: "var(--muted)" }}>
        {!temEscrita && <>Ref. = mesma quebra em {mesLabel(refRange.from)}</>}
        {temEscrita && !faltaReferencia && <>Ref. = o alvo que vocês definiram</>}
        {misturado && (
          <>
            Ref. = o alvo que vocês definiram; onde não houver,{" "}
            <em>a mesma quebra em {mesLabel(refRange.from)}</em>
          </>
        )}
        {podeEditar && <> · clique em um número para mudar o alvo</>}
      </p>

      {erro && (
        <p style={{ margin: "-0.5rem 0 1rem", fontSize: "var(--text-caption)", color: "var(--danger)" }}>
          {erro}
        </p>
      )}

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

                  /* O alvo escrito ganha do mês anterior — é para isso que ele existe. */
                  const escrita = i > 0 ? alvoDe(cat, key, alvos) : null;
                  const chave = celula(cat.id, key);
                  const refCat = referencia?.[i];
                  const refAnterior = i > 0 ? referencia?.[i - 1]?.counts[key] ?? null : null;
                  const doMesAnterior = refCat ? percentOf(refCat.counts[key], refAnterior) : null;
                  const refPercent = escrita ?? doMesAnterior;

                  return (
                    <tr key={cat.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <td style={{ padding: "0.4rem 0" }}>{cat.label}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{count}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: corDaQuebra(percent, refPercent) }}>
                        {percent === null ? "—" : `${percent.toFixed(0)}%`}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--muted)", padding: "0.15rem 0" }}>
                        {editando === chave ? (
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            step={1}
                            className="field-input"
                            value={rascunho}
                            onChange={(e) => setRascunho(e.target.value)}
                            onBlur={() => salvar(cat, key, rascunho)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") salvar(cat, key, rascunho);
                              /* Esc sai sem gravar — e sem passar pelo `onBlur`,
                                 que gravaria o que a pessoa desistiu de escrever. */
                              if (e.key === "Escape") {
                                setRascunho(escrita === null ? "" : String(escrita));
                                setEditando(null);
                              }
                            }}
                            placeholder={doMesAnterior === null ? "—" : doMesAnterior.toFixed(0)}
                            style={{
                              width: "68px",
                              textAlign: "right",
                              padding: "0.15rem 0.35rem",
                              fontSize: "inherit",
                            }}
                          />
                        ) : podeEditar && i > 0 ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setRascunho(escrita === null ? "" : String(escrita));
                              setEditando(chave);
                            }}
                            title={
                              escrita !== null
                                ? "Alvo definido por vocês — clique para mudar"
                                : `Sem alvo: mostrando a mesma quebra em ${mesLabel(refRange.from)}. Clique para definir.`
                            }
                            style={{
                              padding: "0.15rem 0.45rem",
                              fontWeight: 400,
                              fontSize: "inherit",
                              /* O tracejado é o que diz "isto se edita" sem
                                 encher a tabela de ícones de lápis. */
                              borderBottom: "1px dashed var(--card-border)",
                              borderRadius: 0,
                              fontStyle: misturado && escrita === null ? "italic" : "normal",
                            }}
                          >
                            {refPercent === null ? "—" : `${refPercent.toFixed(0)}%`}
                          </button>
                        ) : (
                          <span
                            style={{ fontStyle: misturado && escrita === null ? "italic" : "normal" }}
                            title={
                              refPercent === null
                                ? undefined
                                : escrita !== null
                                  ? "Alvo definido pelo time"
                                  : `Mesma quebra em ${mesLabel(refRange.from)}`
                            }
                          >
                            {refPercent === null ? "—" : `${refPercent.toFixed(0)}%`}
                          </span>
                        )}
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

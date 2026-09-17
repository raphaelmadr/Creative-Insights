"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import SafeImage from "./SafeImage";
import { Search, CornerDownLeft, EyeOff } from "lucide-react";
import { formatCurrencyCompact } from "./CreativeCardPrimitives";
import { isActiveStatus } from "@/lib/ad-status";

/**
 * Achar uma peça pelo nome, sem saber em que funil ela caiu.
 *
 * A home abre como um índice: as categorias vêm recolhidas e cada uma pode ter
 * centenas de cartões. Para conferir uma peça específica — a que o time citou
 * na reunião, a que acabou de subir — era preciso expandir as seis e procurar
 * com o Ctrl+F do navegador, que só enxerga o que já foi renderizado. Daí a
 * busca varrer os funis TODOS de uma vez e dizer em qual a peça está.
 *
 * O que ela alcança é o mesmo conjunto que a home carregou: os anúncios com
 * veiculação no período selecionado, no recorte de status escolhido. Fora dessa
 * janela o dado não está no navegador, e ir buscá-lo custaria a mesma consulta
 * pesada que a tela inteira — por isso o rodapé diz qual é o alcance em vez de
 * deixar o "nenhum resultado" parecer ausência de cadastro.
 */

export interface SearchGroup {
  /** A mesma chave que a home usa para recolher/expandir a categoria. */
  key: string;
  name: string;
  emoji?: string | null;
  /** Os anúncios da categoria SEM os filtros de tela — ver `hiddenReason`. */
  ads: any[];
}

/** Sem acento e sem caixa: quem procura "video" tem que achar "Vídeo". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const PLATFORM_NAMES: Record<string, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
};

/** Teto de linhas renderizadas: um termo curto casa com milhares de nomes. */
const MAX_RESULTS = 60;

export default function CreativeSearchDialog({
  open,
  onClose,
  groups,
  creators,
  hiddenReason,
  onSelect,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  groups: SearchGroup[];
  creators: any[];
  /** Por que esta peça não está na grade agora — `null` quando está visível. */
  hiddenReason: (ad: any) => string | null;
  onSelect: (groupKey: string, adId: string) => void;
  /** A home ainda está buscando os funis: não há o que varrer, e isso não é
      a mesma coisa que "não encontrei". */
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  /*
   * Termos independentes, e não a frase inteira.
   *
   * A convenção de nomenclatura empilha origem, campanha e assinatura no mesmo
   * nome ("VD_allu_ads_influenciadores_Nando Viana-ez"). Quem procura lembra de
   * dois pedaços soltos — "nando ez" — e quase nunca da ordem exata.
   */
  const terms = useMemo(
    () => fold(query.trim()).split(/\s+/).filter(Boolean),
    [query]
  );

  const results = useMemo(() => {
    if (terms.length === 0) return [];

    const out: { ad: any; group: SearchGroup }[] = [];
    for (const group of groups) {
      for (const ad of group.ads) {
        const name = fold(ad.ad_name || "");
        if (terms.every(t => name.includes(t))) out.push({ ad, group });
      }
    }
    // A ordem é a que a tela já usa: funis de cima para baixo (o de cima exige
    // mais) e, dentro de cada um, o maior resultado primeiro.
    return out;
  }, [groups, terms]);

  const shown = results.slice(0, MAX_RESULTS);

  // A linha ativa pelo teclado tem que continuar à vista enquanto se desce.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-indice="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const creatorName = (ad: any): string | null => {
    const acronym = (ad.designer || "").trim().toUpperCase();
    if (!acronym) return null;
    const match = creators.find(c =>
      String(c.acronym || "")
        .split(",")
        .map((s: string) => s.trim().toUpperCase())
        .includes(acronym)
    );
    return match?.name || acronym;
  };

  /* Fechar limpa a caixa: reabri-la depois deve começar do zero, e fazer isso
     aqui (e no `fechar` abaixo) cobre todas as saídas sem um efeito de abertura
     que rodava a cada renderização do pai. */
  const limpar = () => {
    setQuery("");
    setActive(0);
  };

  const fechar = () => {
    limpar();
    onClose();
  };

  const escolher = (item: { ad: any; group: SearchGroup }) => {
    if (hiddenReason(item.ad)) return;
    limpar();
    onSelect(item.group.key, item.ad.id);
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (shown.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(i => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(shown[active]);
    }
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Buscar criativo"
      description="Procura pelo nome do anúncio em todos os funis, entre os que tiveram veiculação no período selecionado."
      width="min(860px, 100%)"
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search
          size={15}
          style={{ position: "absolute", left: "0.65rem", color: "var(--muted)", pointerEvents: "none" }}
        />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={aoTeclar}
          placeholder="Nome do anúncio — pedaços soltos servem, em qualquer ordem"
          className="field-input"
          style={{ width: "100%", paddingLeft: "2.1rem" }}
        />
      </div>

      {terms.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.6 }}>
          Digite parte do nome. A busca ignora acentos e maiúsculas, e cada
          pedaço vale por si: <strong style={{ color: "var(--foreground)" }}>nando ez</strong> acha
          “VD_allu_ads_influenciadores_Nando Viana-ez”.
        </p>
      ) : loading ? (
        <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.6 }}>
          Carregando os anúncios do período…
        </p>
      ) : results.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.6 }}>
          Nenhum anúncio com esse nome nos funis do período. Se a peça é mais
          antiga, amplie o intervalo de datas; se está desativada, troque o
          filtro de status para incluir os desativados. Peças que não atingem
          critério de categoria nenhum ficam em <strong style={{ color: "var(--foreground)" }}>Testes</strong>,
          na página de Anúncios, e não aparecem aqui.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.75rem" }}>
            <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)" }}>
              {results.length} {results.length === 1 ? "anúncio encontrado" : "anúncios encontrados"}
              {results.length > shown.length && ` — mostrando os ${shown.length} primeiros`}
            </span>
            <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.3rem", whiteSpace: "nowrap" }}>
              <CornerDownLeft size={12} /> abre no funil
            </span>
          </div>

          <div
            ref={listRef}
            style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "52vh", overflowY: "auto", margin: "0 -0.2rem", padding: "0 0.2rem" }}
          >
            {shown.map((item, indice) => {
              const { ad, group } = item;
              const escondido = hiddenReason(ad);
              const ativo = indice === active;
              const capa = ad.thumbnail_url || ad.image_url;
              const autor = creatorName(ad);
              const plataforma = PLATFORM_NAMES[(ad.platform || "META").toUpperCase()] || ad.platform;

              return (
                <button
                  key={ad.id}
                  data-indice={indice}
                  type="button"
                  onClick={() => escolher(item)}
                  onMouseEnter={() => setActive(indice)}
                  title={escondido ? `Está no funil ${group.name}, mas o ${escondido} o esconde da grade.` : `Ver em ${group.name}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.7rem", width: "100%", textAlign: "left",
                    padding: "0.5rem 0.6rem", borderRadius: "10px", font: "inherit", color: "var(--foreground)",
                    background: ativo ? "var(--surface-sunken)" : "transparent",
                    border: `1px solid ${ativo ? "var(--surface-sunken-border)" : "transparent"}`,
                    cursor: escondido ? "default" : "pointer",
                    opacity: escondido ? 0.65 : 1,
                  }}
                >
                  <div style={{ width: "40px", height: "40px", flexShrink: 0, borderRadius: "8px", overflow: "hidden", background: "var(--surface-sunken)" }}>
                    {capa && (
                      <SafeImage src={capa} alt={ad.ad_name || ""} style={{ width: "40px", height: "40px", objectFit: "cover" }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    {/* O nome inteiro, quebrando: é o que se veio conferir, e
                        cortá-lo com reticências esconde justamente a assinatura
                        do designer, que a convenção põe no fim. */}
                    <span style={{ fontSize: "var(--text-control)", fontWeight: 600, lineHeight: 1.35, wordBreak: "break-word" }}>
                      {ad.ad_name}
                    </span>
                    <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                      <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>
                        {group.emoji || "📁"} {group.name}
                      </strong>
                      <span>·</span>
                      <span>{plataforma}</span>
                      {autor && (<><span>·</span><span>{autor}</span></>)}
                      <span>·</span>
                      <span>{isActiveStatus(ad.status) ? "ativo" : "desativado"}</span>
                      {escondido && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--warning)" }}>
                          <EyeOff size={11} /> oculto pelo {escondido}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Os números de veiculação, no mesmo vocabulário do cartão. */}
                  <div style={{ flexShrink: 0, display: "flex", gap: "0.9rem", fontSize: "var(--text-eyebrow)", textAlign: "right" }}>
                    {[
                      { rotulo: "Gasto", valor: formatCurrencyCompact(parseFloat(ad.spend) || 0) },
                      { rotulo: "Aprovado", valor: formatCurrencyCompact(parseFloat(ad.riskApprovedValue) || 0) },
                      { rotulo: "CPA", valor: formatCurrencyCompact(parseFloat(ad.cpa) || 0) },
                    ].map(m => (
                      <span key={m.rotulo} style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                        <span style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{m.rotulo}</span>
                        <strong style={{ fontSize: "var(--text-caption)" }}>{m.valor}</strong>
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

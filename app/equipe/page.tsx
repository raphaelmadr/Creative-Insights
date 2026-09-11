"use client";

import TopBar from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Skeleton, SkeletonCircle } from "@/components/Skeleton";
import { useCacheFetch } from "@/hooks/useCacheFetch";
import {
  MetricMiniCard,
  formatCurrencyCompact,
  formatCurrencyFull,
  type MetricTone,
} from "@/components/CreativeCardPrimitives";
import {
  Users, Target, RefreshCw, Info, Layers, TrendingUp,
  Activity, ChevronDown, ChevronRight, CalendarDays, HelpCircle,
} from "lucide-react";

/**
 * Dashboard da equipe.
 *
 * A escala de tipo e de espaço vive aqui em cima em vez de espalhada pelo JSX:
 * cada rótulo, cada valor e cada nota de rodapé sai de uma destas constantes,
 * que é o que mantém os cartões alinhados entre si e com o resto da plataforma
 * (`.allu-card-label` usa exatamente os mesmos 0.65rem em maiúsculas).
 */
/*
 * O que sobrou de escala local.
 *
 * Rótulo e valor saíram daqui: agora são `.allu-card-label` e
 * `.allu-card-value`, as mesmas classes do dashboard criativo. Havia duas
 * definições do mesmo papel, e o valor da equipe acabou menor que o da home sem
 * que ninguém tivesse decidido isso.
 */
const T = {
  name: { fontSize: "var(--text-cardtitle)", fontWeight: 700, lineHeight: 1.25 },
  foot: { fontSize: "var(--text-caption)", fontWeight: 400, lineHeight: 1.4 },
} as const;

const S = {
  cardPadding: "1.25rem",
  cardGap: "0.85rem",
  blockPadding: "0.85rem",
  radius: "8px",
} as const;

const sunken = {
  background: "var(--surface-sunken)",
  border: "1px solid var(--surface-sunken-border)",
  borderRadius: S.radius,
  padding: S.blockPadding,
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const LAUNCH_YEAR = 2026;
const LAUNCH_MONTH = 8;

const roasTone = (roas: number): MetricTone => (roas >= 2 ? "good" : roas >= 1 ? "watch" : "bad");

/** O chip de filtro do dashboard criativo, para as duas telas filtrarem igual. */
function FilterChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.5rem",
      background: "var(--card-bg)", padding: "0.4rem 0.75rem", borderRadius: S.radius,
      border: "1px solid var(--card-border)", boxShadow: "var(--card-shadow)",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <span style={{ display: "flex", alignItems: "center", color: "var(--foreground)", opacity: 0.8 }}>{icon}</span>
      <span style={{ display: "flex", alignItems: "center" }}>
        {children}
        <ChevronDown size={14} style={{ marginLeft: "-1rem", pointerEvents: "none", opacity: 0.6, flexShrink: 0 }} />
      </span>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: "none", background: "transparent", fontSize: "var(--text-control)", fontWeight: 600,
  cursor: "pointer", color: "var(--foreground)", outline: "none",
  appearance: "none", paddingRight: "1.2rem",
};

/**
 * Uma meta com barra.
 *
 * O rodapé diz o que falta em vez de repetir "atingido x meta": o valor
 * alcançado já está grande logo acima, e a distância até a meta é o que a
 * pessoa não consegue calcular de cabeça.
 */
function GoalBlock({
  icon, label, hint, value, goal, format, accent, showGoal,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: number;
  goal: number;
  format: (n: number) => string;
  accent: string;
  showGoal: boolean;
}) {
  const percent = goal > 0 ? (value / goal) * 100 : 0;
  const remaining = Math.max(goal - value, 0);
  const reached = goal > 0 && value >= goal;
  const barColor = reached ? "var(--success)" : accent;

  return (
    <div style={{ ...sunken, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <span className="allu-card-label" style={{ color: accent, gap: "0.35rem" }}>
          {icon} {label}
          {hint && (
            <span title={hint} style={{ cursor: "help", opacity: 0.6, display: "flex" }}>
              <Info size={11} />
            </span>
          )}
        </span>
        {showGoal && goal > 0 && (
          <span style={{ ...T.foot, opacity: 0.55, whiteSpace: "nowrap" }}>meta {format(goal)}</span>
        )}
      </div>

      <span className="allu-card-value" style={{ color: accent }}>
        {format === formatCurrencyFull
          ? <AnimatedNumber value={value} prefix="R$ " decimals={2} />
          : <AnimatedNumber value={value} decimals={0} />}
      </span>

      {showGoal && goal > 0 && (
        <>
          <div style={{ width: "100%", height: "5px", background: "var(--card-border)", borderRadius: "100px", overflow: "hidden", marginTop: "0.15rem" }}>
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: `${Math.min(percent, 100)}%` }}
              transition={{ type: "spring", stiffness: 50, damping: 20 }}
              style={{ height: "100%", background: barColor, borderRadius: "100px" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", ...T.foot }}>
            <span style={{ color: barColor, fontVariantNumeric: "tabular-nums" }}>{percent.toFixed(1)}%</span>
            <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
              {reached ? "meta batida" : `faltam ${format(remaining)}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Soma as métricas de um time.
 *
 * Receita, gasto e anúncios somam. ROAS e CPA **não**: são razões, e a média
 * das razões de cada pessoa não é a razão do time — quem gastou R$ 10 com ROAS
 * 8 pesaria igual a quem gastou R$ 50.000 com ROAS 1,2. Os dois são
 * recalculados a partir dos totais.
 *
 * Peças entregues somam: a meta de volume é de cada pessoa, mas o total
 * produzido pelo time é leitura direta.
 */
function aggregate(members: any[]) {
  const sum = (key: string) => members.reduce((acc, m) => acc + (Number(m[key]) || 0), 0);

  const spend = sum("spend");
  const grossValue = sum("grossValue");
  const netOrders = sum("netOrders");

  return {
    net: sum("riskApprovedValue"),
    grossValue,
    spend,
    activeAds: sum("activeAdsCount"),
    pieces: sum("totalPieces"),
    roas: spend > 0 ? grossValue / spend : 0,
    cpa: netOrders > 0 ? spend / netOrders : 0,
  };
}

/**
 * O consolidado do time, no mesmo cartão de métrica da página inicial.
 *
 * Mesmas classes do dashboard criativo — `.allu-card` com rótulo, valor e
 * subtexto — para que um número do time se leia igual a um número global. O
 * que muda é a cor: o tom do time entra na borda e no rótulo, como
 * `.allu-card-highlight` já faz com o verde, para o consolidado não se
 * confundir com os cartões das pessoas logo abaixo.
 *
 * O prefixo é o mesmo da home: `▶` no cartão em destaque, `◇` nos demais.
 */
function TeamMetricsBar({ members, tint }: { members: any[]; tint: "interno" | "externo" }) {
  const t = aggregate(members);

  const items: {
    label: string;
    value: React.ReactNode;
    subtext: string;
    title: string;
    highlight?: boolean;
  }[] = [
    {
      label: "Receita líquida",
      value: <AnimatedNumber value={t.net} prefix="R$ " decimals={2} />,
      subtext: "liquidado · risk_approved_cc",
      title: "Vendas aprovadas na análise de risco dos anúncios criados no mês",
      highlight: true,
    },
    {
      label: "CPA",
      value: <AnimatedNumber value={t.cpa} prefix="R$ " decimals={2} />,
      subtext: "investido ÷ pedidos líquidos",
      title: "Custo por pedido líquido do time",
    },
    {
      label: "ROAS",
      value: `${t.roas.toFixed(2)}x`,
      subtext: "bruta ÷ investimento",
      title: "Retorno sobre o investimento do time",
    },
    {
      label: "Receita bruta",
      value: <AnimatedNumber value={t.grossValue} prefix="R$ " decimals={2} />,
      subtext: "faturado · payment_approved_cc",
      title: "Pagamentos aprovados, incluindo o que ainda pode cair na análise de risco",
    },
    {
      label: "Anúncios ativos",
      value: <AnimatedNumber value={t.activeAds} decimals={0} />,
      subtext: "criados no mês, ainda ativos",
      title: "Anúncios lançados no mês que seguem ativos agora",
    },
    {
      label: "Peças entregues",
      value: <AnimatedNumber value={t.pieces} decimals={0} />,
      subtext: "lidas do canal do Slack",
      title: "Soma das peças entregues pelos membros deste time",
    },
  ];

  return (
    <motion.div
      className="team-metrics-row"
      initial="hidden" animate="show"
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          title={item.title}
          className={`allu-card team-metric tint-${tint}${item.highlight ? " team-metric-highlight" : ""}`}
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}
        >
          <div className="allu-card-label">
            {item.highlight ? "▶" : "◇"} {item.label}
          </div>
          <div className="allu-card-value">{item.value}</div>
          <div className="allu-card-subtext">{item.subtext}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * O cartão de um membro.
 *
 * Fora do `map` porque agora as duas equipes — interna e externa — desenham o
 * mesmo cartão, e a posição no ranking passou a ser relativa à própria equipe.
 */
function MemberCard({ stat, rank }: { stat: any; rank: number }) {
  const isUnknown = stat.acronym.includes("UNKNOWN");
  const accent = isUnknown ? "#EAB308" : "var(--success)";
  // `??` preserva o zero: meta zerada faz a barra sumir (ver GoalBlock).
  const volumeGoal = stat.monthlyVolumeGoal ?? 0;

  return (
    <motion.div
            key={stat.acronym}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 22 } } }}
            style={{
              background: isUnknown ? "rgba(234, 179, 8, 0.04)" : "var(--card-bg)",
              borderRadius: "12px",
              border: `1px solid ${isUnknown ? "rgba(234, 179, 8, 0.35)" : "var(--card-border)"}`,
              padding: S.cardPadding, display: "flex", flexDirection: "column", gap: S.cardGap,
              boxShadow: "var(--card-shadow)",
            }}
          >
            {/* Cabeçalho do membro */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
              {!isUnknown && (
                <span style={{
                  ...T.foot, flexShrink: 0, width: "22px", height: "22px", borderRadius: "100px",
                  background: "var(--surface-sunken)", border: "1px solid var(--surface-sunken-border)",
                  display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.75,
                  fontVariantNumeric: "tabular-nums",
                }} title={`${rank}º em receita líquida`}>
                  {rank}
                </span>
              )}

              <Avatar src={stat.avatarUrl} name={isUnknown ? "?" : stat.name} size="md" isActive={!isUnknown} />

              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ ...T.name, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {stat.name}
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.2rem", ...T.foot, opacity: 0.6 }}>
                  {!isUnknown && (
                    <span style={{
                      padding: "0.05rem 0.35rem", borderRadius: "4px",
                      background: "var(--surface-sunken)", border: "1px solid var(--surface-sunken-border)",
                      letterSpacing: "0.04em",
                    }}>
                      {stat.acronym.split(",")[0].trim()}
                    </span>
                  )}
                  <span
                    title="Anúncios lançados neste mês que continuam ativos agora."
                    style={{ display: "flex", alignItems: "center", gap: "0.25rem", cursor: "help", fontVariantNumeric: "tabular-nums" }}
                  >
                    {stat.activeAdsCount} ativos <Info size={11} />
                  </span>
                  {stat.isSaved && <span style={{ opacity: 0.7 }}>· fechado</span>}
                </div>
              </div>
            </div>

            {isUnknown && (
              <p style={{ ...T.foot, opacity: 0.75, margin: 0 }}>
                Reúne anúncios e entregas sem nenhuma das siglas cadastradas. Serve para ver
                para onde a produção está indo quando a nomenclatura falha.
              </p>
            )}

            <GoalBlock
              icon={<TrendingUp size={13} />}
              label="Receita líquida"
              hint="Faturamento liquidado dos anúncios criados no mês selecionado."
              value={stat.riskApprovedValue}
              goal={stat.monthlyGoal}
              format={formatCurrencyFull}
              accent={accent}
              showGoal={!isUnknown}
            />

            {/* Financeiro primeiro; a volumetria fecha o cartão. */}
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <MetricMiniCard label="CPA" value={stat.cpa > 0 ? formatCurrencyCompact(stat.cpa) : "—"} tone="neutral" title={stat.cpa > 0 ? `Custo por pedido líquido: ${formatCurrencyFull(stat.cpa)}` : "Sem pedidos líquidos no mês"} />
              <MetricMiniCard label="ROAS" value={`${stat.roas.toFixed(2)}x`} tone={roasTone(stat.roas)} title="Receita bruta dividida pelo investimento" />
              <MetricMiniCard label="Receita bruta" value={formatCurrencyCompact(stat.grossValue)} tone="neutral" title={formatCurrencyFull(stat.grossValue)} />
            </div>

            <GoalBlock
              icon={<Layers size={13} />}
              label="Peças entregues"
              hint="Peças lidas do canal de entregas do Slack."
              value={stat.totalPieces || 0}
              goal={volumeGoal}
              format={(n: number) => n.toLocaleString("pt-BR")}
              accent={isUnknown ? "#EAB308" : "var(--primary)"}
              showGoal={!isUnknown}
            />
          </motion.div>
);
}

/**
 * Uma categoria de time, no mesmo cartão das categorias da página inicial.
 *
 * Mesmo desenho de `FunnelsOverview`: o cartão embrulha tudo, o cabeçalho é uma
 * linha só — tile de ícone, nome, contagem embaixo — e a ponta direita traz o
 * "?" que explica o critério de entrada e a seta de recolher. Quem já entendeu
 * a home entende esta tela sem reaprender nada.
 */
function TeamSection({
  emoji, title, description, criterion, members, emptyText, tint,
}: {
  emoji: string;
  title: string;
  description: string;
  criterion: React.ReactNode;
  members: any[];
  emptyText: string;
  tint: "interno" | "externo";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexShrink: 0, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-metric)", width: "34px", height: "34px", borderRadius: "8px", background: "var(--background-main)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {emoji}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.05rem", minWidth: 0 }}>
            <h2 style={{ ...T.name, margin: 0, color: "var(--foreground)", whiteSpace: "nowrap" }}>{title}</h2>
            <span style={{ fontSize: "var(--text-eyebrow)", color: "var(--muted)", fontWeight: 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {members.length} {members.length === 1 ? "criador" : "criadores"} · {description}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.15rem", marginLeft: "auto", flexShrink: 0 }}>
          <button
            onClick={() => setWhyOpen((v) => !v)}
            title="Quem entra nesta categoria?"
            aria-label="Quem entra nesta categoria?"
            aria-expanded={whyOpen}
            className="btn btn-icon" style={{ color: whyOpen ? "var(--primary)" : undefined }}
          >
            <HelpCircle size={16} />
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir" : "Recolher"}
            aria-label={collapsed ? "Expandir categoria" : "Recolher categoria"}
            className="btn btn-icon"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {whyOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", background: "var(--background-main)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0.85rem 0.95rem" }}>
          <span style={{ ...T.name, color: "var(--foreground)" }}>
            Quem entra nesta categoria?
          </span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.55 }}>{criterion}</span>
        </div>
      )}

      {!collapsed && (
        members.length === 0 ? (
          <p style={{ ...T.foot, opacity: 0.55, margin: 0, padding: "1rem", border: "1px dashed var(--card-border)", borderRadius: "8px", textAlign: "center" }}>
            {emptyText}
          </p>
        ) : (
          <>
            <TeamMetricsBar members={members} tint={tint} />

            <motion.div
              className="team-grid-3"
              initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            >
              {members.map((stat, index) => (
                <MemberCard key={stat.acronym} stat={stat} rank={index + 1} />
              ))}
            </motion.div>
          </>
        )
      )}
    </div>
  );
}

export default function EquipePage() {
  const [stats, setStats] = useState<any[]>([]);
  const [teamCreativeGoal, setTeamCreativeGoal] = useState(625);
  const [syncing, setSyncing] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);

  const now = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const { data: jsonReports, loading: loadingReports, mutate: mutateReports } =
    useCacheFetch<any>(`/api/reports/creators?month=${selectedMonth}&year=${selectedYear}`);
  const { data: jsonDeliveries, loading: loadingDeliveries, mutate: mutateDeliveries } =
    useCacheFetch<any>(`/api/deliveries?month=${selectedMonth}&year=${selectedYear}`);

  const loading = loadingReports || loadingDeliveries;

  useEffect(() => {
    if (!jsonReports || !jsonDeliveries) return;

    let globalTeamGoal = 625;
    let deliveriesRanking: any[] = [];
    if (jsonDeliveries.success) {
      globalTeamGoal = jsonDeliveries.teamCreativeGoal ?? 625;
      deliveriesRanking = jsonDeliveries.ranking || [];
    }

    let unifiedStats: any[] = [];
    if (jsonReports.data) {
      unifiedStats = jsonReports.data.map((stat: any) => {
        const deliveryData = deliveriesRanking.find((d: any) => d.creatorId === stat.creatorId);
        return { ...stat, totalPieces: deliveryData ? deliveryData.totalPieces : 0 };
      });
    }

    // "UNKNOWN" é um balde, não uma pessoa: fica no fim, fora do ranking.
    unifiedStats.sort((a: any, b: any) => {
      if (a.acronym.includes("UNKNOWN") && !b.acronym.includes("UNKNOWN")) return 1;
      if (b.acronym.includes("UNKNOWN") && !a.acronym.includes("UNKNOWN")) return -1;
      return b.riskApprovedValue - a.riskApprovedValue;
    });

    setStats(unifiedStats);
    setTeamCreativeGoal(globalTeamGoal);
  }, [jsonReports, jsonDeliveries]);

  const handleSyncSlack = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear }),
      });
      const data = await res.json();
      if (data.success) {
        mutateReports();
        mutateDeliveries();
      } else {
        alert("Erro na sincronização: " + (data.error || "Desconhecido"));
      }
    } catch {
      alert("Erro ao chamar API de sincronização.");
    } finally {
      setSyncing(false);
    }
  };

  const currentMonthValue = today.getMonth() + 1;
  const currentYearValue = today.getFullYear();
  const isCurrentMonth = selectedMonth === currentMonthValue && selectedYear === currentYearValue;

  const availableYears = useMemo(() => {
    const years = [];
    for (let y = LAUNCH_YEAR; y <= currentYearValue; y++) years.push(y);
    return years;
  }, [currentYearValue]);

  const availableMonths = useMemo(() => {
    let months = MONTHS.map((label, i) => ({ value: i + 1, label }));
    if (selectedYear === LAUNCH_YEAR) months = months.filter(m => m.value >= LAUNCH_MONTH);
    if (selectedYear === currentYearValue) months = months.filter(m => m.value <= currentMonthValue);
    return months;
  }, [selectedYear, currentYearValue, currentMonthValue]);

  /*
   * Duas equipes, separadas pelo cadastro: quem tem conta Google vinculada é
   * time interno; quem foi criado à mão é externo. Antes dividiam o mesmo
   * ranking, e um influenciador aparecia acima de quem tem meta e salário.
   */
  const internos = stats.filter((s: any) => !!s.userEmail);
  const externos = stats.filter((s: any) => !s.userEmail);

  const totalPieces = stats.reduce((acc, curr) => acc + (curr.totalPieces || 0), 0);
  // Meta zerada é "sem meta": a barra e o percentual somem em vez de mostrar 0.
  const hasTeamGoal = teamCreativeGoal > 0;
  const globalProgressPercent = hasTeamGoal
    ? Math.min(100, Math.round((totalPieces / teamCreativeGoal) * 100))
    : 0;

  let paceText = "";
  if (isCurrentMonth && totalPieces > 0) {
    const currentDay = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const projectedPace = Math.round((totalPieces / currentDay) * daysInMonth);
    paceText = `projeção de ${projectedPace} peças até o fim do mês`;
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <div className="dashboard-container">
        <section style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Cabeçalho */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <h1 style={{ fontSize: "var(--text-page)", fontWeight: 800, margin: 0, wordBreak: "break-word" }} className="lowercase-title">
                dashboard da equipe<span className="dot-green">.</span>
              </h1>
              <p style={{ color: "var(--muted)", maxWidth: "600px", lineHeight: 1.6, margin: 0 }} className="lowercase-title">
                produção entregue e receita gerada por membro, no mês selecionado.
              </p>
            </div>

            <div className="dashboard-filters" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <FilterChip icon={<CalendarDays size={16} />}>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} style={selectStyle}>
                  {availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </FilterChip>

              <FilterChip icon={<Activity size={16} />}>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const newYear = parseInt(e.target.value);
                    setSelectedYear(newYear);
                    if (newYear === currentYearValue && selectedMonth > currentMonthValue) setSelectedMonth(currentMonthValue);
                    if (newYear === LAUNCH_YEAR && selectedMonth < LAUNCH_MONTH) setSelectedMonth(LAUNCH_MONTH);
                  }}
                  style={selectStyle}
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </FilterChip>

              <button
                onClick={handleSyncSlack}
                disabled={syncing}
                className="btn btn-primary"
                title={`Relê o canal do Slack e regrava as entregas de ${MONTHS[selectedMonth - 1]}`}
              >
                <RefreshCw size={14} className={syncing ? "spin" : ""} />
                {syncing ? "Sincronizando..." : "Sincronizar entregas"}
              </button>

              <button onClick={() => setShowGlossary(v => !v)} className="btn btn-ghost" aria-expanded={showGlossary}>
                <Info size={14} />
                {showGlossary ? "Ocultar glossário" : "O que cada número significa"}
              </button>
            </div>
          </div>

          {/* Glossário — recolhido, porque se lê uma vez e ocupava uma tela inteira */}
          {showGlossary && (
            <div className="fixed-grid-4">
              <div className="allu-card allu-card-highlight">
                <div className="allu-card-label">▶ Receita líquida</div>
                <div className="allu-card-subtext">
                  Vendas <strong>liquidadas (Risk Approved)</strong> geradas por anúncios <strong>lançados no próprio mês</strong> — ativos e pausados.
                </div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">◇ Entregas realizadas</div>
                <div className="allu-card-subtext">
                  Peças extraídas <strong>automaticamente do Slack</strong> nas datas do mês selecionado.
                </div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">◇ Receita bruta</div>
                <div className="allu-card-subtext">
                  Faturamento <strong>total</strong> dos anúncios do mês, incluindo compras pendentes como boleto.
                </div>
              </div>
              <div className="allu-card">
                <div className="allu-card-label">◇ ROAS e CPA</div>
                <div className="allu-card-subtext">
                  Retorno sobre investimento (bruta ÷ investido) e <strong>custo por pedido líquido</strong>.
                </div>
              </div>
            </div>
          )}

          {/* Meta global */}
          {!loading && (
            <div className="allu-card" style={{ gap: "0.75rem", borderTop: "3px solid var(--primary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.75rem" }}>
                <span className="allu-card-label" style={{ color: "var(--primary)", gap: "0.35rem" }}>
                  <Target size={13} /> {hasTeamGoal ? "Meta global de peças" : "Peças entregues pela equipe"}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem", fontVariantNumeric: "tabular-nums" }}>
                  <span className="allu-card-value" style={{ color: "var(--primary)" }}>
                    <AnimatedNumber value={totalPieces} decimals={0} />
                  </span>
                  <span style={{ ...T.foot, opacity: 0.55 }}>
                    {hasTeamGoal ? `/ ${teamCreativeGoal} peças` : "peças no mês"}
                  </span>
                </div>
              </div>

              {hasTeamGoal && (
                <div style={{ width: "100%", height: "8px", background: "var(--card-border)", borderRadius: "100px", overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: `${globalProgressPercent}%` }}
                    transition={{ type: "spring", stiffness: 50, damping: 20 }}
                    style={{ height: "100%", background: "linear-gradient(90deg, var(--primary), #34D399)", borderRadius: "100px" }}
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", ...T.foot, opacity: 0.7 }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  {totalPieces === 0
                    ? <>Nenhuma entrega registrada neste mês — sincronize para trazer do Slack.</>
                    : paceText && <><Activity size={12} /> {paceText}</>}
                </span>
                {hasTeamGoal && (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{globalProgressPercent}% da meta</span>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="team-grid-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} style={{
                  background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--card-border)",
                  padding: S.cardPadding, display: "flex", flexDirection: "column", gap: S.cardGap,
                  boxShadow: "var(--card-shadow)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
                    <SkeletonCircle size="40px" />
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <Skeleton width="120px" height="16px" />
                      <Skeleton width="80px" height="12px" />
                    </div>
                  </div>
                  <Skeleton width="100%" height="92px" borderRadius={S.radius} />
                  <Skeleton width="100%" height="92px" borderRadius={S.radius} />
                  <Skeleton width="100%" height="36px" borderRadius={S.radius} />
                </div>
              ))}
            </div>
          ) : stats.length === 0 ? (
            <div style={{
              padding: "2.5rem", textAlign: "center", opacity: 0.6,
              border: "1px dashed var(--card-border)", borderRadius: "12px",
            }}>
              <Users size={28} style={{ margin: "0 auto 0.75rem auto", opacity: 0.5 }} />
              <p style={{ margin: 0 }}>Nenhum dado encontrado para o período selecionado.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
              <TeamSection
                emoji="🏢"
                title="Time interno"
                description="contas Google da Allugator"
                criterion={
                  <>
                    Criadores cujo cadastro está <strong>vinculado a uma conta Google da Allugator</strong>.
                    O nome e a foto vêm do próprio login, e o vínculo é feito em Configurações › Equipe.
                    Vincular um cadastro manual a uma conta o move para cá automaticamente.
                  </>
                }
                tint="interno"
                members={internos}
                emptyText="Nenhuma conta corporativa está vinculada a um criador. Vincule em Configurações › Equipe."
              />

              <TeamSection
                emoji="🤝"
                title="Time externo"
                description="cadastros manuais"
                criterion={
                  <>
                    Criadores <strong>cadastrados à mão</strong>, sem conta Google vinculada: influenciadores,
                    parcerias e embaixadores. Aqui também fica o balde <strong>UNKNOWN</strong>, que recolhe
                    anúncios e entregas sem nenhuma das siglas cadastradas.
                  </>
                }
                tint="externo"
                members={externos}
                emptyText="Nenhum cadastro manual. Crie em Configurações › Equipe."
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

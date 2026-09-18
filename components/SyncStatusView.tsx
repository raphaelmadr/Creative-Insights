"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, RefreshCw } from "lucide-react";
import { useNow } from "@/hooks/useNow";
import {
  HEALTH_DETAIL,
  HEALTH_LABEL,
  formatRelative,
  formatStamp,
  type SyncHealth,
  type SyncStatus,
} from "@/lib/sync-status";

/**
 * O estado da sincronização, desenhado uma vez só.
 *
 * Antes eram duas telas com duas versões: o cabeçalho dizia "Última att" e
 * "Próxima automática", a tela de sistema dizia "Última sincronização",
 * "Próxima automática" e "Última batida do disparador" — com contas diferentes
 * por trás de rótulos iguais. Quem via as duas não tinha como saber qual estava
 * certa, e nenhuma das duas estava: as duas ignoravam a passada de mídia, que é
 * metade da automação.
 *
 * Agora há um cálculo (`lib/sync-status.ts`), um vocabulário e um desenho. O
 * `variant` muda só quanto cabe na tela, nunca o que é dito.
 */

const TONE: Record<SyncHealth, { color: string; Icon: typeof CheckCircle2 }> = {
  "em-dia": { color: "var(--success)", Icon: CheckCircle2 },
  "sem-disparador": { color: "var(--warning)", Icon: AlertTriangle },
  "sem-fontes": { color: "var(--warning)", Icon: AlertTriangle },
  desligada: { color: "var(--muted)", Icon: PauseCircle },
};

interface Props {
  status: SyncStatus | null;
  /** `compact` cabe no cabeçalho; `full` é o bloco da tela de configurações. */
  variant?: "compact" | "full";
  /** Uma sincronização está rodando agora — o estado é outro enquanto dura. */
  running?: boolean;
}

/**
 * A frase da próxima passada.
 *
 * `nextEligibleAt` nulo quer dizer que a janela já venceu, e aí o que decide é
 * o disparador: com ele chegando, a próxima batida sincroniza; sem ele, não
 * adianta prometer horário nenhum — foi exatamente esse o "a qualquer momento"
 * que ficou meses na tela dizendo que estava tudo bem.
 */
function proximaPassada(status: SyncStatus, now: Date): string {
  if (!status.enabled) return "—";
  if (status.triggerSilent) return "parada, à espera do disparador";
  if (!status.nextEligibleAt) return "na próxima batida do disparador";
  return formatRelative(status.nextEligibleAt, now) ?? "—";
}

/**
 * A mesma informação de `proximaPassada`, no menor número de caracteres que
 * ainda distingue os quatro estados — é o que cabe sob o botão do cabeçalho.
 */
function proximaCurta(status: SyncStatus, now: Date): string {
  if (!status.enabled) return "automação desligada";
  if (status.triggerSilent) return "disparador parado";
  if (!status.nextEligibleAt) return "próxima a qualquer momento";
  return `próxima ${formatRelative(status.nextEligibleAt, now)}`;
}

export function SyncStatusView({ status, variant = "compact", running = false }: Props) {
  const now = useNow();

  if (!status) return null;

  const tone = TONE[status.health];
  const Icon = running ? RefreshCw : tone.Icon;
  const color = running ? "var(--primary)" : tone.color;

  const ultima = formatRelative(status.lastSyncAt, now);
  const proxima = proximaPassada(status, now);

  if (variant === "compact") {
    /*
     * Uma linha, e curta.
     *
     * Este rótulo vive sob o botão "Sincronizar Redes", numa coluna estreita: a
     * frase inteira quebrava em três linhas e escapava do menu. O que fica à
     * vista é o mínimo que responde "está atualizado?"; a frase completa, com o
     * que fazer, está no `title` e na tela de Configurações › Sistema.
     */
    const resumo = running
      ? "Sincronizando…"
      : `${ultima ?? "nunca sincronizado"} · ${proximaCurta(status, now)}`;

    return (
      <div
        role="status"
        title={running ? "Sincronização em andamento" : HEALTH_DETAIL[status.health]}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "var(--text-eyebrow)",
          color: "var(--muted)",
          lineHeight: 1.3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        <Icon
          size={11}
          color={color}
          style={{ flexShrink: 0, ...(running ? { animation: "spin 2s linear infinite" } : null) }}
        />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{resumo}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.9rem",
        padding: "1rem",
        borderRadius: "var(--radius-card)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--surface-sunken-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Icon
          size={16}
          color={color}
          style={{ flexShrink: 0, ...(running ? { animation: "spin 2s linear infinite" } : null) }}
        />
        <strong style={{ fontSize: "var(--text-cardtitle)", color: "var(--foreground)" }}>
          {running ? "Sincronizando agora" : HEALTH_LABEL[status.health]}
        </strong>
      </div>

      <p style={{ margin: 0, fontSize: "var(--text-control)", color: "var(--muted)", lineHeight: 1.5 }}>
        {HEALTH_DETAIL[status.health]}
      </p>

      {/*
        Os três carimbos que respondem "está funcionando?", nesta ordem: o que
        aconteceu, o que vem, e a prova de que o cron existe. A batida do
        disparador é a última porque é a mais técnica — mas é a que distingue
        "ainda não venceu" de "ninguém está chamando", e sem ela as duas
        situações davam a mesma tela.
      */}
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
          gap: "0.9rem",
          margin: 0,
          fontSize: "var(--text-control)",
        }}
      >
        <Carimbo
          termo="Última sincronização"
          valor={ultima ?? "nunca"}
          titulo={formatStamp(status.lastSyncAt)}
        />
        <Carimbo
          termo="Próxima passada"
          valor={proxima}
          titulo={
            status.nextEligibleAt
              ? formatStamp(status.nextEligibleAt)
              : "A janela do intervalo já venceu"
          }
        />
        <Carimbo
          termo="Última batida do disparador"
          valor={formatRelative(status.lastPingAt, now) ?? "nunca"}
          titulo={formatStamp(status.lastPingAt)}
        />
      </dl>

      <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", opacity: 0.8 }}>
        Intervalo configurado: {status.intervalMinutes} min. Como as passadas de métricas e de
        mídia dividem o mesmo disparador, cada uma volta a cada {status.intervalMinutes} min — e o
        cron do cPanel precisa bater pelo menos duas vezes nesse período para que o intervalo seja
        respeitado ao pé da letra.
      </span>
    </div>
  );
}

function Carimbo({ termo, valor, titulo }: { termo: string; valor: string; titulo?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
      <dt style={{ fontSize: "var(--text-eyebrow)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)" }}>
        {termo}
      </dt>
      <dd style={{ margin: 0, fontWeight: 600, color: "var(--foreground)" }} title={titulo}>
        {valor}
      </dd>
    </div>
  );
}

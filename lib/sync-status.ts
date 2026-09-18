/**
 * O estado da sincronização automática — um cálculo só, um vocabulário só.
 *
 * Havia três leituras concorrentes da mesma pergunta. O cabeçalho somava
 * `lastCronSyncAt + intervalo`; a tela de sistema refazia a conta por conta
 * própria, com outras palavras; e o endpoint do cron usava uma terceira regra —
 * a certa, que compara as DUAS passadas, porque a primeira a vencer é a que
 * manda. As telas ignoravam a passada de mídia e por isso anunciavam janelas que
 * não eram as reais.
 *
 * Módulo puro, sem Prisma e sem React: o servidor o alimenta com a linha de
 * configurações e o navegador reusa o mesmo resultado a cada tique do relógio,
 * sem ir buscar nada. É o que permite a contagem andar na tela entre uma
 * requisição e outra.
 */

/**
 * Silêncio do disparador que já não se explica por atraso de relógio.
 *
 * O cron do cPanel é cadastrado a cada 15 minutos; uma hora sem batida são
 * quatro batidas perdidas. Abaixo disso não vale acusar nada.
 */
export const TRIGGER_SILENCE_TOLERANCE_MS = 60 * 60 * 1000;

/** O intervalo assumido quando o painel nunca foi salvo. */
export const DEFAULT_INTERVAL_MINUTES = 120;

export type SyncHealth =
  /** Desligada no painel — o disparador bate e nada acontece, de propósito. */
  | "desligada"
  /** Nenhuma fonte tem credencial: não há o que sincronizar. */
  | "sem-fontes"
  /** O disparador externo parou de bater — é o cron do cPanel que falta. */
  | "sem-disparador"
  /** Tudo de pé. */
  | "em-dia";

/** A linha de configurações, na forma em que este módulo a consome. */
export interface SyncStatusInput {
  cronSyncEnabled?: boolean | null;
  cronSyncInterval?: number | null;
  lastSyncAt?: Date | string | null;
  lastCronSyncAt?: Date | string | null;
  lastMediaSyncAt?: Date | string | null;
  lastCronPingAt?: Date | string | null;
  /** Se existe ao menos uma fonte com credencial (Meta, TikTok…). */
  hasConfiguredSource?: boolean;
}

export interface SyncStatus {
  health: SyncHealth;
  enabled: boolean;
  intervalMinutes: number;
  /** Fim da última sincronização, manual ou automática. */
  lastSyncAt: string | null;
  /** Última vez que o disparador externo chegou — a prova de que o cron existe. */
  lastPingAt: string | null;
  /**
   * Quando a próxima passada fica elegível. `null` quer dizer "assim que o
   * disparador bater": ou a janela já venceu, ou alguma passada nunca rodou.
   */
  nextEligibleAt: string | null;
  /** O disparador está em silêncio além da tolerância. */
  triggerSilent: boolean;
}

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * O estado da automação a partir da linha de configurações.
 *
 * `now` entra por parâmetro para o cálculo ser testável e para o servidor e o
 * navegador poderem chegar ao mesmo resultado com relógios diferentes.
 */
export function buildSyncStatus(input: SyncStatusInput, now: Date = new Date()): SyncStatus {
  const enabled = input.cronSyncEnabled ?? false;
  const intervalMinutes = input.cronSyncInterval || DEFAULT_INTERVAL_MINUTES;

  const lastSyncAt = toDate(input.lastSyncAt);
  const lastPingAt = toDate(input.lastCronPingAt);
  const metrics = toDate(input.lastCronSyncAt);
  const media = toDate(input.lastMediaSyncAt);

  /*
   * A próxima janela é a da passada MAIS ATRASADA, que é a primeira a vencer —
   * a mesma regra do portão em `lib/cron-endpoint.ts`. Uma passada que nunca
   * rodou vence agora, e por isso derruba a previsão para `null`.
   */
  const nextEligible =
    metrics && media
      ? new Date(
          Math.min(metrics.getTime(), media.getTime()) + intervalMinutes * 60 * 1000
        )
      : null;

  const dueNow = !nextEligible || nextEligible.getTime() <= now.getTime();

  const triggerSilent =
    !lastPingAt || now.getTime() - lastPingAt.getTime() > TRIGGER_SILENCE_TOLERANCE_MS;

  /*
   * A ordem das perguntas é a ordem em que se resolve o problema: desligada no
   * painel é escolha, não defeito; sem credencial não adianta disparador; e só
   * então o silêncio do cron vira a queixa principal.
   */
  const health: SyncHealth = !enabled
    ? "desligada"
    : input.hasConfiguredSource === false
      ? "sem-fontes"
      : triggerSilent
        ? "sem-disparador"
        : "em-dia";

  return {
    health,
    enabled,
    intervalMinutes,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    lastPingAt: lastPingAt?.toISOString() ?? null,
    nextEligibleAt: dueNow ? null : nextEligible!.toISOString(),
    triggerSilent,
  };
}

/** Rótulo curto do estado, o mesmo em toda tela que o exibir. */
export const HEALTH_LABEL: Record<SyncHealth, string> = {
  desligada: "Automação desligada",
  "sem-fontes": "Sem fontes configuradas",
  "sem-disparador": "Disparador em silêncio",
  "em-dia": "Automação no ar",
};

/**
 * A frase que explica o estado e diz o que fazer.
 *
 * Mora aqui, e não na tela, porque as duas telas que a exibem precisam dizer a
 * mesma coisa — foi a divergência entre elas que escondeu um cron morto.
 */
export const HEALTH_DETAIL: Record<SyncHealth, string> = {
  desligada:
    "O disparador externo continua batendo, mas nada é sincronizado enquanto a chave acima estiver desligada.",
  "sem-fontes":
    "Nenhuma fonte tem credencial cadastrada — não há o que sincronizar. Preencha as chaves nos cartões acima.",
  "sem-disparador":
    "O disparador externo não bate nesta porta há mais de uma hora. O intervalo configurado só vale enquanto o cron chega — confira o Cron Jobs do cPanel com o comando abaixo. Atenção: uma batida recusada por chave errada NÃO conta como batida e dá exatamente esta tela; ela fica registrada em Configurações › Logs.",
  "em-dia": "O disparador está chegando e o intervalo configurado está sendo respeitado.",
};

/**
 * Tempo relativo em português, curto o bastante para caber no cabeçalho.
 *
 * Existe para a tela poder recalcular o rótulo a cada tique sem nova requisição:
 * a queixa que originou isto era um "a qualquer momento" congelado, que não
 * media tempo nenhum.
 */
export function formatRelative(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;

  const deltaMs = target - now.getTime();
  const past = deltaMs < 0;
  const minutes = Math.round(Math.abs(deltaMs) / 60000);

  if (minutes < 1) return past ? "agora mesmo" : "em instantes";
  if (minutes < 60) return past ? `há ${minutes} min` : `em ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    const texto = restMinutes > 0 ? `${hours} h ${restMinutes} min` : `${hours} h`;
    return past ? `há ${texto}` : `em ${texto}`;
  }

  const days = Math.round(hours / 24);
  return past ? `há ${days} ${days === 1 ? "dia" : "dias"}` : `em ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Data e hora absolutas, no formato que as duas telas já usavam. */
export function formatStamp(iso: string | null): string {
  if (!iso) return "nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "nunca";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

let globalPauseUntil = 0;
let START_TIME = Date.now();

/**
 * O teto de tempo de uma sincronização — hoje, nenhum.
 *
 * Eram 180s, e o comentário original dizia de onde vinham: "for Serverless". A
 * aplicação rodava em função serverless com limite RÍGIDO de 300s, que cortava
 * a execução no meio sem erro tratável; Meta e TikTok reservavam 180s cada e o
 * teto interno existia para a sincronização PARAR SOZINHA e relatar "parcial"
 * em vez de ser morta e desaparecer.
 *
 * Esse limite de plataforma não existe mais — a aplicação roda em processo
 * próprio no cPanel, onde nada corta a execução por tempo. O teto continuava de
 * pé sem nada por trás: era ele, e só ele, que fazia uma sincronização terminar
 * com "9 de 18 dias do mês nesta passada — parcial, rode novamente" num mês que
 * cabia inteiro numa execução.
 *
 * O mecanismo fica, o valor sai. Todas as fases que perguntam "sobrou tempo?"
 * passam a ouvir "sim" e rodam até o fim; definindo `SYNC_TIME_LIMIT_MINUTES`
 * no ambiente, o orçamento volta a existir e tudo volta a se comportar como
 * antes — é a alavanca para o dia em que uma execução longa demais atrapalhar
 * quem está navegando no painel, já que a conta tem um núcleo só.
 */
function resolveWallClockLimit(): number {
  const bruto = (process.env.SYNC_TIME_LIMIT_MINUTES ?? "").trim();
  if (bruto) {
    const minutos = Number(bruto);
    if (Number.isFinite(minutos) && minutos > 0) return minutos * 60_000;
  }
  return Number.POSITIVE_INFINITY;
}

const WALL_CLOCK_LIMIT = resolveWallClockLimit();


export function resetWallClock() {
  START_TIME = Date.now();
}

/**
 * Tempo restante antes do teto, em ms. Usado para orçar fases caras.
 *
 * Sem teto configurado devolve `Infinity`, e é assim que os pisos das fases se
 * desativam sozinhos: `Infinity < PISO` é falso em todos eles, sem que nenhuma
 * dessas dezenas de comparações precise saber que o orçamento sumiu.
 */
export function wallClockRemainingMs(): number {
  return Math.max(0, WALL_CLOCK_LIMIT - (Date.now() - START_TIME));
}

export class MetaApiError extends Error {
  code: number;
  subcode?: number;
  isRateLimit: boolean;
  isTransient: boolean;

  constructor(message: string, code: number, subcode?: number) {
    super(message);
    this.name = 'MetaApiError';
    this.code = code;
    this.subcode = subcode;
    
    // 4: App Level Rate Limit, 17: User Level Rate Limit, 32: Page Level Rate Limit
    // 613: Custom Calls limit, 80000-80004: Business Use Case Limits
    this.isRateLimit = [4, 17, 32, 613].includes(code) || (code >= 80000 && code <= 80004);
    
    // 2: Service temporarily unavailable, Subcode 2446079: Transient error
    this.isTransient = code === 2 || subcode === 2446079;
  }
}

/**
 * Só é lançado quando `SYNC_TIME_LIMIT_MINUTES` está definido — sem orçamento
 * configurado, nada aqui interrompe uma sincronização por tempo.
 */
export class WallClockLimitError extends Error {
  constructor() {
    super("Orçamento de tempo da sincronização esgotado (SYNC_TIME_LIMIT_MINUTES).");
    this.name = 'WallClockLimitError';
  }
}

import { setTimeout as delay } from "node:timers/promises";

/**
 * Quantas janelas de limite de taxa uma requisição espera antes de desistir.
 *
 * A regra da casa passou a ser: o único limite que respeitamos é o das APIs —
 * e respeitar não é desistir, é esperar a janela e continuar. Dez esperas
 * cobrem de sobra o que a Meta costuma pedir (minutos); o número existe só para
 * uma conta bloqueada por horas não deixar um processo preso para sempre.
 */
const MAX_RATE_LIMIT_WAITS = 10;

function checkWallClock() {
  if (Date.now() - START_TIME >= WALL_CLOCK_LIMIT) {
    throw new WallClockLimitError();
  }
}

function parseUsageHeader(headerValue: string | null): number {
  if (!headerValue) return 0;
  try {
    const usages = JSON.parse(headerValue);
    // Usually it's an array for X-Business-Use-Case-Usage, or a single object for X-App-Usage
    if (Array.isArray(usages)) {
      let maxUsage = 0;
      for (const usage of usages) {
        if (usage.call_count > maxUsage) maxUsage = usage.call_count;
        if (usage.total_cputime > maxUsage) maxUsage = usage.total_cputime;
        if (usage.total_time > maxUsage) maxUsage = usage.total_time;
      }
      return maxUsage;
    } else if (typeof usages === 'object') {
      return Math.max(usages.call_count || 0, usages.total_cputime || 0, usages.total_time || 0);
    }
  } catch (e) {
    // Ignore parse errors
  }
  return 0;
}

export async function throttledFetch(
  url: string,
  options?: RequestInit,
  attempt = 1,
  /** Quantas vezes esta requisição já esperou uma janela de limite de taxa. */
  rateLimitWaits = 0
): Promise<any> {
  checkWallClock();

  const now = Date.now();
  if (now < globalPauseUntil) {
    const waitTime = globalPauseUntil - now;
    if (Date.now() + waitTime - START_TIME >= WALL_CLOCK_LIMIT) {
      throw new WallClockLimitError();
    }
    await delay(waitTime);
  }

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (err: any) {
    // Fetch failed entirely (network error)
    if (attempt < 3) {
      await delay(Math.pow(2, attempt) * 1000 + Math.random() * 500);
      return throttledFetch(url, options, attempt + 1);
    }
    throw err;
  }

  // Handle headers
  const businessUsage = response.headers.get('X-Business-Use-Case-Usage');
  const appUsage = response.headers.get('X-App-Usage');
  const adAccountUsage = response.headers.get('X-Ad-Account-Usage');

  let maxUsage = Math.max(
    parseUsageHeader(businessUsage),
    parseUsageHeader(appUsage),
    parseUsageHeader(adAccountUsage)
  );

  // Proactive throttling
  if (maxUsage >= 90) {
    globalPauseUntil = Date.now() + 60000; // 60s
  } else if (maxUsage >= 75) {
    globalPauseUntil = Date.now() + 5000; // 5s
  } else if (maxUsage >= 50) {
    globalPauseUntil = Date.now() + 1000; // 1s
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    // Not JSON
    if (!response.ok && attempt < 3) {
      await delay(Math.pow(2, attempt) * 1000 + Math.random() * 500);
      return throttledFetch(url, options, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    return null;
  }

  if (data.error) {
    const errObj = new MetaApiError(data.error.message, data.error.code, data.error.error_subcode);
    
    if (errObj.isRateLimit) {
      /*
       * Limite de taxa: ESPERAR a janela e continuar, não abortar.
       *
       * Antes isto lançava, e a sincronização inteira terminava parcial. Fazia
       * sentido quando havia um teto de 180s: esperar os 60s que a Meta pede
       * consumia um terço do orçamento e o que viesse depois morreria de
       * qualquer forma. Sem teto, desistir é a pior das duas opções — a espera
       * é exatamente o que a API está pedindo, e do outro lado dela o trabalho
       * continua de onde parou.
       *
       * `globalPauseUntil` é marcado ANTES da espera para que as outras
       * requisições em voo parem junto: o limite é da conta, não desta chamada.
       */
      const estimatedTime = data.error.error_data?.estimated_time_to_regain_access;
      const pauseDuration = estimatedTime ? estimatedTime * 60000 : 60000;
      globalPauseUntil = Date.now() + pauseDuration;

      // Com orçamento configurado, a regra antiga vale: não adianta esperar
      // uma janela que termina depois do fim do tempo.
      if (Date.now() + pauseDuration - START_TIME >= WALL_CLOCK_LIMIT) {
        throw new WallClockLimitError();
      }

      if (rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
        console.warn(
          `[Meta] Limite de taxa atingido. Aguardando ${Math.round(pauseDuration / 1000)}s ` +
          `antes de continuar (espera ${rateLimitWaits + 1} de ${MAX_RATE_LIMIT_WAITS}).`
        );
        await delay(pauseDuration);
        return throttledFetch(url, options, attempt, rateLimitWaits + 1);
      }

      throw errObj;
    }

    if (errObj.isTransient) {
      if (attempt < 3) {
        // Backoff: 2s, 4s, 8s + jitter
        await delay(Math.pow(2, attempt) * 2000 + Math.random() * 1000);
        return throttledFetch(url, options, attempt + 1);
      }
      throw errObj;
    }

    // Other errors (not rate limit, not transient) just pass through
    return data;
  }

  return data;
}

export async function fetchWithBisection(
  ids: string[], 
  urlBuilder: (ids: string) => string
): Promise<any> {
  if (ids.length === 0) return {};
  checkWallClock();

  const url = urlBuilder(ids.join(','));
  const data = await throttledFetch(url).catch((err) => {
    if (err instanceof WallClockLimitError) throw err;
    return { error: { message: err.message, code: err.code, error_subcode: err.subcode }};
  });

  if (data && data.error) {
    const errObj = new MetaApiError(data.error.message, data.error.code, data.error.error_subcode);
    
    if (errObj.isRateLimit) {
      throw errObj; // Stop the sync immediately or wait
    }
    
    if (errObj.isTransient) {
      // Should have been handled by retry inside throttledFetch, but if exhausted:
      throw errObj;
    }

    // Some specific object caused a failure. Divide and conquer
    if (ids.length === 1) {
      console.warn(`[Meta Sync] ID inválido descartado por erro persistente: ${ids[0]} - ${errObj.message}`);
      return {}; // Discard this bad ID and return empty object so others can proceed
    }

    // Bisect
    const mid = Math.floor(ids.length / 2);
    const leftIds = ids.slice(0, mid);
    const rightIds = ids.slice(mid);

    const [leftData, rightData] = await Promise.all([
      fetchWithBisection(leftIds, urlBuilder),
      fetchWithBisection(rightIds, urlBuilder)
    ]);

    return { ...leftData, ...rightData };
  }

  return data; // Object with IDs as keys, usually
}

let globalPauseUntil = 0;
let START_TIME = Date.now();
const WALL_CLOCK_LIMIT = 180000; // 180s (60% of 300s maxDuration)

export function resetWallClock() {
  START_TIME = Date.now();
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

export class WallClockLimitError extends Error {
  constructor() {
    super("Wall clock limit reached. Aborting to avoid serverless timeout.");
    this.name = 'WallClockLimitError';
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

export async function throttledFetch(url: string, options?: RequestInit, attempt = 1): Promise<any> {
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
      // Pause for estimated time or default
      const estimatedTime = data.error.error_data?.estimated_time_to_regain_access;
      const pauseDuration = estimatedTime ? estimatedTime * 60000 : 60000;
      
      if (Date.now() + pauseDuration - START_TIME >= WALL_CLOCK_LIMIT) {
        throw new WallClockLimitError();
      }

      globalPauseUntil = Date.now() + pauseDuration;
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

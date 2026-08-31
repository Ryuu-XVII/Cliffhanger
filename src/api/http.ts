import { ApiError } from './errors';
import { RateLimiter, sleep, type RateLimitPriority } from './rateLimiter';

/**
 * The single outbound HTTP path (§3.3). Every call gets: a timeout, retry with
 * exponential backoff and jitter, a 429 handler that penalises the shared rate
 * limiter, and an identifying User-Agent (§4.5.5).
 */

export const USER_AGENT = 'Cliffhanger/1.0 (anime tracker; contact: hello@cliffhanger.app)';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
/** Used when a 429 carries no usable Retry-After, and as its upper bound. */
const RETRY_AFTER_FALLBACK_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 300;

let online = true;
/** Wired to NetInfo at startup so we can fail fast instead of hanging. */
export function setOnline(value: boolean): void {
  online = value;
}
export function isOnline(): boolean {
  return online;
}

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number;
  retries?: number;
  limiter?: RateLimiter;
  /**
   * A request the user is actively waiting on jumps the limiter's queue ahead
   * of background prefetch. Named distinctly from fetch's own RequestInit
   * `priority` (a browser scheduling hint we don't use) to avoid colliding
   * with it.
   */
  limiterPriority?: RateLimitPriority;
  /** Skip the offline short-circuit (used by the connectivity probe itself). */
  ignoreOffline?: boolean;
}

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    limiter,
    limiterPriority = 'normal',
    ignoreOffline = false,
    headers,
    ...init
  } = options;

  if (!online && !ignoreOffline) {
    throw new ApiError('offline', 'Device is offline');
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    if (limiter) await limiter.acquire(limiterPriority);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          ...(headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        limiter?.penalise(retryAfter);
        if (attempt === retries) {
          throw new ApiError('rate-limited', 'Rate limited', {
            status: 429,
            retryAfter,
          });
        }
        await sleep(retryAfter * 1000);
        attempt += 1;
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new ApiError('unauthorized', 'Not authorised', { status: response.status });
      }

      if (response.status === 404) {
        throw new ApiError('not-found', 'Not found', { status: 404 });
      }

      if (response.status >= 500) {
        if (attempt === retries) {
          throw new ApiError('server', `Upstream error ${response.status}`, {
            status: response.status,
          });
        }
        await sleep(backoffDelay(attempt));
        attempt += 1;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // Non-retryable classifications bail immediately.
      if (error instanceof ApiError && error.kind !== 'server' && error.kind !== 'timeout') {
        throw error;
      }

      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt === retries) {
        if (isAbort) throw new ApiError('timeout', 'Request timed out', { cause: error });
        if (error instanceof ApiError) throw error;
        throw new ApiError('unknown', 'Network request failed', { cause: error });
      }

      await sleep(backoffDelay(attempt));
      attempt += 1;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof ApiError
    ? lastError
    : new ApiError('unknown', 'Request failed', { cause: lastError });
}

export async function requestJson<T>(url: string, options?: RequestOptions): Promise<T> {
  const response = await request(url, options);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError('unknown', 'Malformed response body', { cause: error });
  }
}

/** Exponential backoff with full jitter, capped so retries stay snappy. */
export function backoffDelay(attempt: number): number {
  const base = Math.min(8_000, 500 * 2 ** attempt);
  return Math.round(base / 2 + Math.random() * (base / 2));
}

function parseRetryAfter(header: string | null): number {
  if (!header) return RETRY_AFTER_FALLBACK_SECONDS;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, RETRY_AFTER_MAX_SECONDS);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, Math.ceil((date - Date.now()) / 1000)), RETRY_AFTER_MAX_SECONDS);
  }
  return RETRY_AFTER_FALLBACK_SECONDS;
}

/**
 * §4.1 - assume a 30 req/min ceiling on AniList and 1 req/sec on MAL. This is a
 * token bucket plus a hard serialising gate; every outbound call passes through
 * it, so the app cannot burst past the limit no matter how many screens mount.
 */
export type RateLimitPriority = 'high' | 'normal';

/** Floor on the token-wait sleep, so a near-full bucket cannot spin. */
const MIN_TOKEN_WAIT_MS = 25;

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  /**
   * Two queues rather than one: a background prefetch (a Discover shelf, the
   * Home airing widget) can drain the whole token budget before a user ever
   * opens Search, and FIFO would then make an interactive search wait behind
   * every one of those. High-priority requests are always served first -
   * still capped at the same overall rate, just re-ordered so what the user
   * is actively waiting on is not queued behind work nobody is looking at.
   */
  private queueHigh: Array<() => void> = [];
  private queueNormal: Array<() => void> = [];
  private draining = false;
  /** Set when a 429 arrives - all traffic pauses until this passes. */
  private penaltyUntil = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly minGapMs = 0,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  static perMinute(count: number, minGapMs = 0): RateLimiter {
    return new RateLimiter(count, count / 60_000, minGapMs);
  }

  /** Called by the HTTP layer when the server returns 429. */
  penalise(seconds: number): void {
    this.penaltyUntil = Math.max(this.penaltyUntil, Date.now() + seconds * 1000);
    this.tokens = 0;
  }

  async acquire(priority: RateLimitPriority = 'normal'): Promise<void> {
    await new Promise<void>((resolve) => {
      (priority === 'high' ? this.queueHigh : this.queueNormal).push(resolve);
      void this.drain();
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  private queueLength(): number {
    return this.queueHigh.length + this.queueNormal.length;
  }

  private dequeue(): (() => void) | undefined {
    return this.queueHigh.shift() ?? this.queueNormal.shift();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queueLength() > 0) {
        const penaltyLeft = this.penaltyUntil - Date.now();
        if (penaltyLeft > 0) {
          await sleep(penaltyLeft);
          continue;
        }

        this.refill();
        if (this.tokens < 1) {
          const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
          await sleep(Math.max(waitMs, MIN_TOKEN_WAIT_MS));
          continue;
        }

        this.tokens -= 1;
        const next = this.dequeue();
        next?.();
        if (this.minGapMs > 0) await sleep(this.minGapMs);
      }
    } finally {
      this.draining = false;
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** AniList: 30/min working ceiling (§4.1). */
export const anilistLimiter = RateLimiter.perMinute(30);
/** Jikan: conservative, and never in a tight loop (§4.2). */
export const jikanLimiter = RateLimiter.perMinute(30, 400);
/**
 * AnimeSchedule: the public endpoints are explicitly documented as having
 * stricter limits than the token-authenticated ones, and no number is
 * published - so this is deliberately timid.
 */
export const animeScheduleLimiter = RateLimiter.perMinute(20, 500);

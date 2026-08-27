/**
 * §4.1 - assume a 30 req/min ceiling on AniList and 1 req/sec on MAL. This is a
 * token bucket plus a hard serialising gate; every outbound call passes through
 * it, so the app cannot burst past the limit no matter how many screens mount.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];
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

  async acquire(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
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

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        const penaltyLeft = this.penaltyUntil - Date.now();
        if (penaltyLeft > 0) {
          await sleep(penaltyLeft);
          continue;
        }

        this.refill();
        if (this.tokens < 1) {
          const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
          await sleep(Math.max(waitMs, 25));
          continue;
        }

        this.tokens -= 1;
        const next = this.queue.shift();
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
/** MAL: community practice is at most 1 req/sec (§4.3). */
export const malLimiter = RateLimiter.perMinute(60, 1000);
/**
 * AnimeSchedule: the public endpoints are explicitly documented as having
 * stricter limits than the token-authenticated ones, and no number is
 * published - so this is deliberately timid.
 */
export const animeScheduleLimiter = RateLimiter.perMinute(20, 500);

import { readJson, writeJson, kv } from './kv';

/**
 * §4.5.2 cache tiers. Anime metadata barely changes, so the app caches hard and
 * keeps a typical session under ten external calls (§12).
 */
export const TTL = {
  /** Airing schedule / currently-airing status. */
  airing: 60 * 60 * 1000,
  /** Seasonal lists, trending. */
  browse: 6 * 60 * 60 * 1000,
  /** Individual title metadata. */
  title: 7 * 24 * 60 * 60 * 1000,
  /** Finished series never change again. */
  finishedTitle: 30 * 24 * 60 * 60 * 1000,
  /** Search results - short, results shift with the query index. */
  search: 30 * 60 * 1000,
} as const;

const PREFIX = 'cache:';

interface Envelope<T> {
  data: T;
  fetchedAt: number;
  expiresAt: number;
}

export function cacheGet<T>(key: string, options?: { allowStale?: boolean }): T | null {
  const envelope = readJson<Envelope<T>>(PREFIX + key);
  if (!envelope) return null;
  if (envelope.expiresAt > Date.now()) return envelope.data;
  if (options?.allowStale) return envelope.data;
  return null;
}

/** Stale entries are still useful as an offline fallback (§4.5.4). */
export function cacheGetStale<T>(key: string): { data: T; fetchedAt: number } | null {
  const envelope = readJson<Envelope<T>>(PREFIX + key);
  return envelope ? { data: envelope.data, fetchedAt: envelope.fetchedAt } : null;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  const now = Date.now();
  writeJson(PREFIX + key, { data, fetchedAt: now, expiresAt: now + ttlMs } satisfies Envelope<T>);
}

export function cacheClear(): void {
  for (const key of kv().getAllKeys()) {
    if (key.startsWith(PREFIX)) kv().delete(key);
  }
}

/** Drop expired envelopes so the store does not grow without bound. */
export function cacheEvictExpired(): number {
  let removed = 0;
  const now = Date.now();
  for (const key of kv().getAllKeys()) {
    if (!key.startsWith(PREFIX)) continue;
    const envelope = readJson<Envelope<unknown>>(key);
    // Anything older than the longest tier is dead weight regardless of TTL.
    if (!envelope || envelope.fetchedAt < now - TTL.finishedTitle) {
      kv().delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Read-through helper. Returns cached data when fresh, otherwise fetches; on a
 * network failure it degrades to stale cache rather than throwing (§4.5.4).
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const fresh = cacheGet<T>(key);
  if (fresh !== null) return fresh;

  try {
    const data = await fetcher();
    cacheSet(key, data, ttlMs);
    return data;
  } catch (error) {
    const stale = cacheGetStale<T>(key);
    if (stale) return stale.data;
    throw error;
  }
}

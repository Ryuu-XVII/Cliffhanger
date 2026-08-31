import { TTL, withCache } from '../cache';
import { ApiError } from '../errors';
import { requestJson } from '../http';
import { jikanLimiter } from '../rateLimiter';

/**
 * §4.2 - Jikan is an unofficial, read-only MAL cache. It is used for two things
 * only: MAL community scores/rankings, and as a fallback when AniList is down.
 * Every field is optional because sparse entries are common, so nothing here
 * assumes a shape; callers get nulls rather than exceptions.
 */

const BASE = 'https://api.jikan.moe/v4';

export interface MalStats {
  malId: number;
  score: number | null;
  scoredBy: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  url: string | null;
}

interface JikanAnimeResponse {
  data?: {
    mal_id?: number | null;
    score?: number | null;
    scored_by?: number | null;
    rank?: number | null;
    popularity?: number | null;
    members?: number | null;
    favorites?: number | null;
    url?: string | null;
  } | null;
}

/**
 * Returns null rather than throwing when MAL data is simply unavailable -
 * the detail screen treats this as a missing row, never as an error state.
 */
export async function getMalStats(malId: number | null): Promise<MalStats | null> {
  if (!malId) return null;

  try {
    return await withCache(`jikan:anime:${malId}`, TTL.title, async () => {
      const payload = await requestJson<JikanAnimeResponse>(`${BASE}/anime/${malId}`, {
        limiter: jikanLimiter,
        retries: 1,
      });
      const data = payload.data;
      if (!data) return null;
      return {
        malId: data.mal_id ?? malId,
        score: numberOrNull(data.score),
        scoredBy: numberOrNull(data.scored_by),
        rank: numberOrNull(data.rank),
        popularity: numberOrNull(data.popularity),
        members: numberOrNull(data.members),
        favorites: numberOrNull(data.favorites),
        url: data.url ?? null,
      };
    });
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not-found') return null;
    // Jikan is strictly supplementary; a failure here must never break a screen.
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

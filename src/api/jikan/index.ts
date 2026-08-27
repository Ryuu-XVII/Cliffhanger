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
    return await withCache('jikan:anime:' + malId, TTL.title, async () => {
      const payload = await requestJson<JikanAnimeResponse>(BASE + '/anime/' + malId, {
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

interface JikanSearchResponse {
  data?: Array<{
    mal_id?: number | null;
    title?: string | null;
    title_english?: string | null;
    title_japanese?: string | null;
    images?: { jpg?: { large_image_url?: string | null } | null } | null;
    episodes?: number | null;
    type?: string | null;
    year?: number | null;
    score?: number | null;
  }> | null;
}

export interface JikanSearchResult {
  malId: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: string | null;
  episodes: number | null;
  format: string | null;
  year: number | null;
  score: number | null;
}

/**
 * Fallback search used only when AniList is unreachable (§15). Results carry a
 * malId, not an anilistId, so they are display-only until AniList recovers -
 * §4.6 forbids keying an entry off anything but the AniList id.
 */
export async function searchFallback(query: string): Promise<JikanSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const payload = await requestJson<JikanSearchResponse>(
    BASE + '/anime?limit=20&sfw=true&q=' + encodeURIComponent(trimmed),
    { limiter: jikanLimiter, retries: 1 },
  );

  return (payload.data ?? [])
    .filter((item) => typeof item.mal_id === 'number')
    .map((item) => ({
      malId: item.mal_id as number,
      title: {
        romaji: item.title ?? null,
        english: item.title_english ?? null,
        native: item.title_japanese ?? null,
      },
      coverImage: item.images?.jpg?.large_image_url ?? null,
      episodes: numberOrNull(item.episodes),
      format: item.type ?? null,
      year: numberOrNull(item.year),
      score: numberOrNull(item.score),
    }));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

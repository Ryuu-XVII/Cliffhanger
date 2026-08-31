import { TTL, withCache } from '../cache';
import { ApiError } from '../errors';
import { requestJson } from '../http';
import { animeScheduleLimiter } from '../rateLimiter';
import {
  parseScheduleDate,
  type AnimeScheduleAnime,
  type AnimeSchedulePage,
} from './types';

export * from './types';

/**
 * AnimeSchedule.net — the airing authority.
 *
 * AniList knows *what* a series is; it is unreliable about *when* an episode
 * actually lands, and it has no concept of a broadcast being delayed or a show
 * going on break. AnimeSchedule tracks exactly that, plus per-platform
 * streaming links that are richer than AniList's externalLinks.
 *
 * Two constraints shape this module:
 *
 *   1. **Lookup is by AniList id, never by title.** The `anilist-ids` query
 *      parameter returns the matching record directly, which keeps §4.6 intact:
 *      nothing in this app is ever keyed off a title string.
 *
 *   2. **Only public endpoints are used.** `/timetables` returns 401 without an
 *      OAuth token, and a token in the client bundle would violate §3.3. If the
 *      whole-week timetable is ever wanted, it belongs behind a Cloud Function
 *      the way §4.5.1 requires for scheduled work.
 *
 * Like Jikan (§4.2), this is strictly supplementary: every failure resolves to
 * null rather than throwing, so a detail screen never breaks because a
 * secondary service is down.
 */

const BASE = 'https://animeschedule.net/api/v3';

export interface AiringDelay {
  /** Free text from the service, e.g. "On Break" or "Delayed". */
  reason: string;
  from: number | null;
  until: number | null;
}

export interface AiringInfo {
  /** AnimeSchedule's own id and route, for building a link back. */
  id: string | null;
  route: string | null;
  /** Original Japanese broadcast, as a timestamp. */
  japaneseAt: number | null;
  /** When subs land. Usually what a non-Japanese viewer actually cares about. */
  subAt: number | null;
  dubAt: number | null;
  /** Set when the broadcast is delayed or the show is on break. */
  delay: AiringDelay | null;
  /** Episodes actually aired, when the service tracks an override. */
  episodesAired: number | null;
  totalEpisodes: number | null;
  status: string | null;
  streams: ScheduleStream[];
}

export interface ScheduleStream {
  platform: string;
  name: string;
  url: string;
}

/** AnimeSchedule returns bare hosts; the app must not render an unclickable string. */
function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function toAiringInfo(anime: AnimeScheduleAnime): AiringInfo {
  const reason = anime.delayedTimetable?.trim();
  const delayFrom = parseScheduleDate(anime.delayedFrom ?? anime.subDelayedFrom);
  const delayUntil = parseScheduleDate(anime.delayedUntil ?? anime.subDelayedUntil);

  const streams: ScheduleStream[] = [];
  for (const stream of anime.websites?.streams ?? []) {
    const url = absoluteUrl(stream.url);
    if (!url || !stream.platform) continue;
    streams.push({
      platform: stream.platform,
      name: stream.name?.trim() || stream.platform,
      url,
    });
  }

  return {
    id: anime.id ?? null,
    route: anime.route ?? null,
    japaneseAt: parseScheduleDate(anime.jpnTime),
    subAt: parseScheduleDate(anime.subTime),
    dubAt: parseScheduleDate(anime.dubTime),
    // A delay only counts when the service actually labelled one; dates alone
    // are historical and every finished show has them.
    delay: reason ? { reason, from: delayFrom, until: delayUntil } : null,
    episodesAired:
      anime.episodeOverride?.episodesAired && anime.episodeOverride.episodesAired > 0
        ? anime.episodeOverride.episodesAired
        : null,
    totalEpisodes: anime.episodes && anime.episodes > 0 ? anime.episodes : null,
    status: anime.status ?? null,
    streams,
  };
}

/**
 * Looks a title up by its AniList id. Cached on the airing tier (§4.5.2)
 * because delay information is the whole point and it goes stale quickly.
 */
export async function getAiringInfo(anilistId: number | null): Promise<AiringInfo | null> {
  if (!anilistId || !Number.isFinite(anilistId)) return null;

  try {
    return await withCache(`animeschedule:anilist:${anilistId}`, TTL.airing, async () => {
      const payload = await requestJson<AnimeSchedulePage>(
        `${BASE}/anime?anilist-ids=${encodeURIComponent(String(anilistId))}`,
        { limiter: animeScheduleLimiter, retries: 1 },
      );

      const match = payload.anime?.[0];
      return match ? toAiringInfo(match) : null;
    });
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not-found') return null;
    // Supplementary data only - never surface this as a screen error.
    return null;
  }
}

/** Human-readable delay line for the detail screen, or null when airing normally. */
export function describeDelay(delay: AiringDelay | null): string | null {
  if (!delay) return null;

  const until = delay.until;
  if (until && until > Date.now()) {
    const date = new Date(until).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
    return `${delay.reason} until ${date}`;
  }
  return delay.reason;
}

/** Link back to the AnimeSchedule page, which is where the corrections live. */
export function scheduleUrl(info: AiringInfo | null): string | null {
  return info?.route ? `https://animeschedule.net/anime/${info.route}` : null;
}

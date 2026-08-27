/**
 * AnimeSchedule.net v3 response shapes.
 *
 * Every field is optional: the public endpoints are undocumented in places and
 * sparse entries are common, so nothing here assumes a shape (same defensive
 * rule the spec applies to Jikan in §4.2).
 *
 * Two format quirks that matter:
 *   - Times are ISO 8601 in UTC.
 *   - A null datetime is the sentinel "0001-01-01T00:00:00Z", NOT null or an
 *     empty string. Treating that as a real date would put every unaired show
 *     in the year 1.
 */

export const NULL_DATETIME = '0001-01-01T00:00:00Z';

export interface AnimeScheduleStream {
  platform?: string | null;
  url?: string | null;
  name?: string | null;
}

export interface AnimeScheduleWebsites {
  official?: string | null;
  mal?: string | null;
  aniList?: string | null;
  kitsu?: string | null;
  animePlanet?: string | null;
  anidb?: string | null;
  streams?: AnimeScheduleStream[] | null;
}

export interface AnimeScheduleEpisodeOverride {
  overrideDate?: string | null;
  overrideEpisode?: number | null;
  episodesAired?: number | null;
}

export interface AnimeScheduleAnime {
  id?: string | null;
  title?: string | null;
  route?: string | null;
  names?: { romaji?: string | null; english?: string | null; native?: string | null } | null;

  /** Original Japanese broadcast time. */
  jpnTime?: string | null;
  /** When subtitles land. */
  subTime?: string | null;
  /** When the dub lands. */
  dubTime?: string | null;

  premier?: string | null;
  subPremier?: string | null;
  dubPremier?: string | null;

  /** Free text such as "On Break" or "Delayed". Empty when airing normally. */
  delayedTimetable?: string | null;
  delayedFrom?: string | null;
  delayedUntil?: string | null;
  subDelayedFrom?: string | null;
  subDelayedUntil?: string | null;
  dubDelayedTimetable?: string | null;
  dubDelayedFrom?: string | null;
  dubDelayedUntil?: string | null;

  episodes?: number | null;
  lengthMin?: number | null;
  status?: string | null;
  episodeOverride?: AnimeScheduleEpisodeOverride | null;

  websites?: AnimeScheduleWebsites | null;
  stats?: { averageScore?: number | null; trackedCount?: number | null } | null;
}

export interface AnimeSchedulePage {
  page?: number | null;
  totalAmount?: number | null;
  anime?: AnimeScheduleAnime[] | null;
}

/** Parses a datetime, mapping the null sentinel and junk values to null. */
export function parseScheduleDate(value: string | null | undefined): number | null {
  if (!value || value === NULL_DATETIME) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  // Anything before 1970 is the sentinel in another disguise.
  return parsed > 0 ? parsed : null;
}

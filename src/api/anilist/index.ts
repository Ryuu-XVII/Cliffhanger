import { cacheGet, cacheSet, TTL, withCache } from '../cache';
import { anilistRequest } from './client';
import {
  AIRING_SCHEDULE_QUERY,
  BROWSE_QUERY,
  BY_IDS_QUERY,
  DELETE_MEDIA_LIST_ENTRY_MUTATION,
  GENRES_QUERY,
  MEDIA_DETAIL_QUERY,
  MEDIA_LIST_COLLECTION_QUERY,
  MEDIA_LIST_ENTRY_ID_QUERY,
  SAVE_MEDIA_LIST_ENTRY_MUTATION,
  SEARCH_QUERY,
  STUDIO_MEDIA_QUERY,
  STUDIO_SEARCH_QUERY,
  TAGS_QUERY,
  VIEWER_QUERY,
} from './queries';
import type {
  AniListAiringSchedule,
  AniListMedia,
  AniListMediaLite,
  AniListMediaTag,
  AniListMediaListEntry,
  AniListPage,
  AniListPageInfo,
  AniListSeason,
  AniListViewer,
} from './types';

export * from './types';
export { setAniListToken, hasAniListToken } from './client';

const PER_PAGE = 24;
/** AniList rejects very large id_in sets, so multi-id lookups are chunked. */
const IDS_PER_REQUEST = 50;
const AIRING_PER_PAGE = 50;

export interface SearchParams {
  query: string;
  page?: number;
  type?: 'ANIME' | 'MANGA';
  /** Multi-select. Empty or omitted means "any". */
  format?: string[];
  status?: string[];
  genre?: string[];
  tag?: string[];
  source?: string[];
  /** Exclusions - titles carrying any of these are filtered out. */
  excludeGenre?: string[];
  excludeTag?: string[];
  /** 0-100. Guards against loose matches on a barely-relevant tag. */
  minimumTagRank?: number;
  season?: AniListSeason;
  /** A single year. Use yearFrom/yearTo for a range; they are mutually exclusive. */
  seasonYear?: number;
  yearFrom?: number;
  yearTo?: number;
  minScore?: number;
  /**
   * Episodes for anime, chapters for manga - the API splits these into two
   * argument pairs, but they are one idea to the user (see unitNoun).
   */
  minEpisodes?: number;
  maxEpisodes?: number;
  maxDuration?: number;
  countryOfOrigin?: string;
  sort?: string[];
  includeAdult?: boolean;
}

export interface Paged<T> {
  items: T[];
  hasNextPage: boolean;
  page: number;
}

/*
 * Deliberately absent: a `total`.
 *
 * AniList's pageInfo.total cannot be trusted and must not be surfaced. Verified
 * against the live API with genre_in:[Mecha], seasonYear:2016, perPage:20 - a
 * set that really holds 26 titles:
 *
 *   page 1 -> total 5000, lastPage 250, hasNextPage true
 *   page 2 -> total 26,   lastPage 2,   hasNextPage false
 *   page 3 -> total 40,   lastPage 3,   hasNextPage false
 *
 * So it is a placeholder until the final page, and past the end it keeps
 * climbing. Showing it would tell a user "5,000+ results" for 26 matches.
 * Count loaded items instead, and say "N+" while hasNextPage is true.
 */

function page<T>(result: AniListPage<T> | null | undefined, currentPage: number): Paged<T> {
  return {
    items: result?.media?.filter((item): item is T => item !== null) ?? [],
    hasNextPage: result?.pageInfo?.hasNextPage ?? false,
    page: currentPage,
  };
}

/** FuzzyDateInt is YYYYMMDD packed into an Int. */
function fuzzyDateInt(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

function nonEmpty(values: string[] | undefined): string[] | undefined {
  return values && values.length > 0 ? values : undefined;
}

/** The filter fields a search can carry on its own, with no query text. */
export type SearchFilters = Omit<SearchParams, 'query' | 'page' | 'type' | 'sort' | 'includeAdult'>;

/** True when the filters alone are enough to run a search without query text. */
export function hasSearchFilters(filters: SearchFilters): boolean {
  const lists = [
    filters.format,
    filters.status,
    filters.genre,
    filters.tag,
    filters.source,
    filters.excludeGenre,
    filters.excludeTag,
  ];
  if (lists.some((list) => list && list.length > 0)) return true;
  return Boolean(
    filters.season ||
      filters.seasonYear ||
      filters.yearFrom ||
      filters.yearTo ||
      filters.minScore ||
      filters.minEpisodes ||
      filters.maxEpisodes ||
      filters.maxDuration ||
      filters.countryOfOrigin,
  );
}

/** F-01. Callers debounce; this layer caches so back-navigation is free. */
export async function searchMedia(params: SearchParams): Promise<Paged<AniListMediaLite>> {
  const {
    query,
    page: pageNumber = 1,
    type = 'ANIME',
    format,
    status,
    genre,
    tag,
    source,
    excludeGenre,
    excludeTag,
    minimumTagRank,
    season,
    seasonYear,
    yearFrom,
    yearTo,
    minScore,
    minEpisodes,
    maxEpisodes,
    maxDuration,
    countryOfOrigin,
    sort = ['SEARCH_MATCH', 'POPULARITY_DESC'],
    includeAdult = false,
  } = params;

  const trimmed = query.trim();
  const hasFilter = hasSearchFilters(params);
  if (trimmed.length === 0 && !hasFilter) {
    return { items: [], hasNextPage: false, page: pageNumber };
  }

  // A range is expressed as start-date bounds; a single year keeps using
  // seasonYear so it can pair with a season.
  const startDateGreater = yearFrom ? fuzzyDateInt(yearFrom, 1, 1) : undefined;
  const startDateLesser = yearTo ? fuzzyDateInt(yearTo, 12, 31) : undefined;

  const key = [
    'anilist:search',
    type,
    trimmed.toLowerCase(),
    pageNumber,
    (format ?? []).join('|'),
    (status ?? []).join('|'),
    (genre ?? []).join('|'),
    (tag ?? []).join('|'),
    (source ?? []).join('|'),
    (excludeGenre ?? []).join('|'),
    (excludeTag ?? []).join('|'),
    minimumTagRank ?? '',
    season ?? '',
    seasonYear ?? '',
    yearFrom ?? '',
    yearTo ?? '',
    minScore ?? '',
    minEpisodes ?? '',
    maxEpisodes ?? '',
    maxDuration ?? '',
    countryOfOrigin ?? '',
    sort.join(','),
    includeAdult ? 'adult' : 'sfw',
  ].join(':');

  return withCache(key, TTL.search, async () => {
    const data = await anilistRequest<{ Page: AniListPage<AniListMediaLite> | null }>(SEARCH_QUERY, {
      search: trimmed || undefined,
      page: pageNumber,
      perPage: PER_PAGE,
      type,
      isAdult: includeAdult ? undefined : false,
      format_in: nonEmpty(format),
      status_in: nonEmpty(status),
      genre_in: nonEmpty(genre),
      genre_not_in: nonEmpty(excludeGenre),
      tag_in: nonEmpty(tag),
      tag_not_in: nonEmpty(excludeTag),
      // Only meaningful alongside an included tag.
      minimumTagRank: nonEmpty(tag) ? minimumTagRank : undefined,
      season: season ?? undefined,
      seasonYear: seasonYear ?? undefined,
      startDate_greater: startDateGreater,
      startDate_lesser: startDateLesser,
      averageScore_greater: minScore ?? undefined,
      // One "unit count" filter, routed to whichever pair the type uses.
      episodes_greater: type === 'ANIME' ? (minEpisodes ?? undefined) : undefined,
      episodes_lesser: type === 'ANIME' ? (maxEpisodes ?? undefined) : undefined,
      chapters_greater: type === 'MANGA' ? (minEpisodes ?? undefined) : undefined,
      chapters_lesser: type === 'MANGA' ? (maxEpisodes ?? undefined) : undefined,
      duration_lesser: type === 'ANIME' ? (maxDuration ?? undefined) : undefined,
      source_in: nonEmpty(source),
      countryOfOrigin: countryOfOrigin ?? undefined,
      sort,
    }, { priority: 'high' });
    const result = page(data.Page, pageNumber);
    // Warm the per-title cache so tapping a result renders instantly.
    for (const item of result.items) primeMediaLite(item);

    // AniList's own search is fairly literal - a query carrying one word the
    // official title does not (an extra qualifier like "season 2", or a word
    // order AniList's index does not expect) often returns nothing at all
    // rather than a fuzzy near-match. One bounded retry with a relaxed query
    // catches that common case without turning every search into a fan-out:
    // relaxQuery always returns a strictly shorter query or null, so this
    // recurses at most a handful of times before giving up.
    if (result.items.length === 0 && !hasFilter && pageNumber === 1) {
      const relaxed = relaxQuery(trimmed);
      if (relaxed) return searchMedia({ ...params, query: relaxed });
    }
    return result;
  });
}

/** Words common enough in an English title that a search missing them should still match. */
const SEARCH_STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on']);

/**
 * Widens a failed search query by one step: first by dropping filler words
 * ("the", "of", ...), then - once there are none left to drop - by dropping
 * the last word, since a common miss is a trailing qualifier ("movie",
 * "part 2") that is not actually part of the title AniList has on file.
 * Returns null once there is nothing left worth trying.
 */
export function relaxQuery(trimmed: string): string | null {
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return null;

  const withoutStopWords = words.filter((word) => !SEARCH_STOP_WORDS.has(word.toLowerCase()));
  if (withoutStopWords.length > 0 && withoutStopWords.length < words.length) {
    return withoutStopWords.join(' ');
  }
  return words.slice(0, -1).join(' ') || null;
}

/** F-02. Finished series get the 30-day tier (§4.5.2). */
export async function getMedia(id: number): Promise<AniListMedia> {
  const key = `anilist:media:${id}`;

  return withCache(key, TTL.title, async () => {
    const data = await anilistRequest<{ Media: AniListMedia | null }>(
      MEDIA_DETAIL_QUERY,
      { id },
      { priority: 'high' },
    );
    if (!data.Media) throw new Error(`Media ${id} not found`);
    const media = data.Media;
    // Re-stamp with the longer TTL when the series can never change again.
    const ttl =
      media.status === 'FINISHED' || media.status === 'CANCELLED' ? TTL.finishedTitle : TTL.title;
    cacheSet(key, media, ttl);
    return media;
  });
}

export async function getMediaByIds(ids: number[]): Promise<AniListMediaLite[]> {
  if (ids.length === 0) return [];
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += IDS_PER_REQUEST) {
    chunks.push(ids.slice(index, index + IDS_PER_REQUEST));
  }

  const results: AniListMediaLite[] = [];
  for (const chunk of chunks) {
    const data = await anilistRequest<{ Page: AniListPage<AniListMediaLite> | null }>(BY_IDS_QUERY, {
      ids: chunk,
      page: 1,
      perPage: chunk.length,
    });
    const items = page(data.Page, 1).items;
    for (const item of items) primeMediaLite(item);
    results.push(...items);
  }
  return results;
}

export interface BrowseParams {
  sort: string[];
  page?: number;
  season?: AniListSeason;
  seasonYear?: number;
  status?: string;
  format?: string;
  genre?: string;
  type?: 'ANIME' | 'MANGA';
  includeAdult?: boolean;
  cacheKey: string;
  ttl?: number;
}

export async function browse(params: BrowseParams): Promise<Paged<AniListMediaLite>> {
  const { page: pageNumber = 1, includeAdult = false, ttl = TTL.browse } = params;
  const key = ['anilist:browse', params.cacheKey, pageNumber, includeAdult ? 'adult' : 'sfw'].join(
    ':',
  );

  return withCache(key, ttl, async () => {
    const data = await anilistRequest<{ Page: AniListPage<AniListMediaLite> | null }>(BROWSE_QUERY, {
      page: pageNumber,
      perPage: PER_PAGE,
      sort: params.sort,
      season: params.season,
      seasonYear: params.seasonYear,
      status: params.status,
      format: params.format,
      genre: params.genre,
      type: params.type ?? 'ANIME',
      isAdult: includeAdult ? undefined : false,
    });
    const result = page(data.Page, pageNumber);
    for (const item of result.items) primeMediaLite(item);
    return result;
  });
}

export interface AniListStudio {
  id: number;
  name: string;
}

/** Typeahead for the search screen's studio filter. */
export async function searchStudios(query: string): Promise<AniListStudio[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = `anilist:studio-search:${trimmed.toLowerCase()}`;
  return withCache(key, TTL.browse, async () => {
    const data = await anilistRequest<{ Page: { studios: AniListStudio[] | null } | null }>(
      STUDIO_SEARCH_QUERY,
      { search: trimmed, page: 1, perPage: 8 },
      { priority: 'high' },
    );
    return data.Page?.studios?.filter((studio): studio is AniListStudio => studio !== null) ?? [];
  });
}

/**
 * A studio's catalogue. AniList has no studio filter on the Media root query
 * (confirmed via schema introspection), so this walks Studio.media instead -
 * a separate connection that only supports sort, not genre/tag/status/year.
 */
export async function getStudioMedia(
  studioId: number,
  pageNumber = 1,
  sort: string[] = ['POPULARITY_DESC'],
  includeAdult = false,
): Promise<Paged<AniListMediaLite> & { studioName: string }> {
  const key = ['anilist:studio-media', studioId, pageNumber, sort.join(',')].join(':');

  return withCache(key, TTL.browse, async () => {
    const data = await anilistRequest<{
      Studio: { name: string; media: { pageInfo: AniListPageInfo | null; nodes: (AniListMediaLite | null)[] } } | null;
    }>(STUDIO_MEDIA_QUERY, { id: studioId, page: pageNumber, perPage: PER_PAGE, sort }, { priority: 'high' });

    const nodes = (data.Studio?.media.nodes ?? []).filter(
      (item): item is AniListMediaLite => item !== null && (includeAdult || !item.isAdult),
    );
    for (const item of nodes) primeMediaLite(item);

    return {
      items: nodes,
      hasNextPage: data.Studio?.media.pageInfo?.hasNextPage ?? false,
      page: pageNumber,
      studioName: data.Studio?.name ?? '',
    };
  });
}

/** F-09 shelves. */
export const discover = {
  trending: (pageNumber = 1, includeAdult = false) =>
    browse({
      sort: ['TRENDING_DESC', 'POPULARITY_DESC'],
      page: pageNumber,
      includeAdult,
      cacheKey: 'trending',
    }),
  topRated: (pageNumber = 1, includeAdult = false) =>
    browse({ sort: ['SCORE_DESC'], page: pageNumber, includeAdult, cacheKey: 'top-rated' }),
  topMovies: (pageNumber = 1, includeAdult = false) =>
    browse({
      sort: ['SCORE_DESC'],
      format: 'MOVIE',
      page: pageNumber,
      includeAdult,
      cacheKey: 'top-movies',
    }),
  airingSoon: (pageNumber = 1, includeAdult = false) =>
    browse({
      sort: ['POPULARITY_DESC'],
      status: 'NOT_YET_RELEASED',
      page: pageNumber,
      includeAdult,
      cacheKey: 'airing-soon',
      ttl: TTL.airing,
    }),
  popularNow: (pageNumber = 1, includeAdult = false) =>
    browse({
      sort: ['POPULARITY_DESC'],
      status: 'RELEASING',
      page: pageNumber,
      includeAdult,
      cacheKey: 'popular-now',
      ttl: TTL.airing,
    }),
  byGenre: (genre: string, pageNumber = 1, includeAdult = false) =>
    browse({
      sort: ['POPULARITY_DESC'],
      genre,
      page: pageNumber,
      includeAdult,
      cacheKey: `genre:${genre.toLowerCase()}`,
    }),
};

/** F-08. */
export function getSeason(
  season: AniListSeason,
  year: number,
  pageNumber = 1,
  includeAdult = false,
  type: 'ANIME' | 'MANGA' = 'ANIME',
): Promise<Paged<AniListMediaLite>> {
  return browse({
    sort: ['POPULARITY_DESC'],
    season,
    seasonYear: year,
    page: pageNumber,
    includeAdult,
    type,
    cacheKey: `season:${type}:${season}:${year}`,
  });
}

export function getGenres(): Promise<string[]> {
  return withCache('anilist:genres', TTL.finishedTitle, async () => {
    const data = await anilistRequest<{ GenreCollection: string[] | null }>(GENRES_QUERY);
    return data.GenreCollection ?? [];
  });
}

/**
 * Spoiler tags stay hidden always - a tag picker is no place to learn a twist.
 * Adult tags follow the user's Show Adult setting, so the tag list agrees with
 * the genre list instead of silently hiding more than the genre list does.
 */
export function getMediaTags(includeAdult = false): Promise<AniListMediaTag[]> {
  const key = `anilist:media-tags:${includeAdult ? 'adult' : 'sfw'}`;
  return withCache(key, TTL.finishedTitle, async () => {
    const data = await anilistRequest<{ MediaTagCollection: AniListMediaTag[] | null }>(TAGS_QUERY);
    return (data.MediaTagCollection ?? []).filter(
      (tag) =>
        (includeAdult || !tag.isAdult) && !tag.isGeneralSpoiler && !tag.isMediaSpoiler,
    );
  });
}

export type AiringScheduleItem = AniListAiringSchedule & { media: AniListMediaLite | null };

/** Feeds the airing countdown (F-14) and the local notification scheduler. */
export async function getAiringSchedule(
  fromSeconds: number,
  toSeconds: number,
  pageNumber = 1,
): Promise<{ items: AiringScheduleItem[]; hasNextPage: boolean }> {
  const key = ['anilist:airing', fromSeconds, toSeconds, pageNumber].join(':');
  return withCache(key, TTL.airing, async () => {
    const data = await anilistRequest<{
      Page: {
        pageInfo: { hasNextPage: boolean | null } | null;
        airingSchedules: AiringScheduleItem[] | null;
      } | null;
    }>(AIRING_SCHEDULE_QUERY, {
      page: pageNumber,
      perPage: AIRING_PER_PAGE,
      from: fromSeconds,
      to: toSeconds,
    });

    return {
      items: data.Page?.airingSchedules ?? [],
      hasNextPage: data.Page?.pageInfo?.hasNextPage ?? false,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Authenticated calls - only used when the user linked AniList (§5).
 * ------------------------------------------------------------------ */

export async function getViewer(): Promise<AniListViewer> {
  const data = await anilistRequest<{ Viewer: AniListViewer | null }>(
    VIEWER_QUERY,
    {},
    { authenticated: true },
  );
  if (!data.Viewer) throw new Error('AniList returned no viewer');
  return data.Viewer;
}

export interface RemoteList {
  name: string;
  status: string | null;
  isCustomList: boolean;
  entries: AniListMediaListEntry[];
}

export async function getMediaListCollection(
  userId: number,
  type: 'ANIME' | 'MANGA' = 'ANIME',
): Promise<RemoteList[]> {
  const data = await anilistRequest<{
    MediaListCollection: { lists: RemoteList[] | null } | null;
  }>(MEDIA_LIST_COLLECTION_QUERY, { userId, type }, { authenticated: true });
  return data.MediaListCollection?.lists ?? [];
}

export interface SaveEntryInput {
  mediaId: number;
  status?: string;
  /** 0-100. */
  score?: number | null;
  progress?: number;
  progressVolumes?: number;
  repeat?: number;
  notes?: string;
  private?: boolean;
  startedAt?: { year: number; month: number; day: number } | null;
  completedAt?: { year: number; month: number; day: number } | null;
}

export async function saveMediaListEntry(input: SaveEntryInput): Promise<{ id: number }> {
  const data = await anilistRequest<{ SaveMediaListEntry: { id: number } | null }>(
    SAVE_MEDIA_LIST_ENTRY_MUTATION,
    {
      mediaId: input.mediaId,
      status: input.status,
      score: input.score ?? undefined,
      progress: input.progress,
      progressVolumes: input.progressVolumes,
      repeat: input.repeat,
      notes: input.notes,
      private: input.private,
      startedAt: input.startedAt ?? undefined,
      completedAt: input.completedAt ?? undefined,
    },
    { authenticated: true },
  );
  if (!data.SaveMediaListEntry) throw new Error('AniList did not save the entry');
  return data.SaveMediaListEntry;
}

/**
 * The viewer's list-entry id for a title, or null when it is not on their list.
 * Needed because deletions are keyed by list-entry id, not media id.
 */
export async function getMediaListEntryId(mediaId: number): Promise<number | null> {
  const data = await anilistRequest<{ Media: { mediaListEntry: { id: number } | null } | null }>(
    MEDIA_LIST_ENTRY_ID_QUERY,
    { mediaId },
    { authenticated: true },
  );
  return data.Media?.mediaListEntry?.id ?? null;
}

/** F-23: mirror a local removal onto AniList. No-ops if it was never on the list. */
export async function deleteMediaListEntryByMediaId(mediaId: number): Promise<boolean> {
  const id = await getMediaListEntryId(mediaId);
  if (id === null) return false;
  return deleteMediaListEntry(id);
}

export async function deleteMediaListEntry(id: number): Promise<boolean> {
  const data = await anilistRequest<{ DeleteMediaListEntry: { deleted: boolean | null } | null }>(
    DELETE_MEDIA_LIST_ENTRY_MUTATION,
    { id },
    { authenticated: true },
  );
  return data.DeleteMediaListEntry?.deleted ?? false;
}

/** Cheap warm of the lite cache used by grids while the full detail loads. */
function primeMediaLite(media: AniListMediaLite): void {
  cacheSet(`anilist:lite:${media.id}`, media, TTL.title);
}

/**
 * A title just seen in a search/discover grid was already primed above - the
 * detail screen uses this as placeholder data so it can paint the real title,
 * cover and score immediately instead of "Untitled" while `getMedia`'s much
 * heavier query (synopsis, characters, staff, recommendations) is in flight.
 */
export function getCachedMediaLite(id: number): AniListMediaLite | null {
  return cacheGet<AniListMediaLite>(`anilist:lite:${id}`);
}


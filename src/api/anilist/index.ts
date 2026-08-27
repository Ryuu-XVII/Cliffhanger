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
  SAVE_MEDIA_LIST_ENTRY_MUTATION,
  SEARCH_QUERY,
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
  AniListSeason,
  AniListViewer,
} from './types';

export * from './types';
export { setAniListToken, hasAniListToken } from './client';

const PER_PAGE = 24;

export interface SearchParams {
  query: string;
  page?: number;
  type?: 'ANIME' | 'MANGA';
  format?: string;
  genre?: string;
  tag?: string;
  seasonYear?: number;
  status?: string;
  sort?: string[];
  includeAdult?: boolean;
}

export interface Paged<T> {
  items: T[];
  hasNextPage: boolean;
  page: number;
}

function page<T>(result: AniListPage<T> | null | undefined, currentPage: number): Paged<T> {
  return {
    items: result?.media?.filter((item): item is T => item !== null) ?? [],
    hasNextPage: result?.pageInfo?.hasNextPage ?? false,
    page: currentPage,
  };
}

/** F-01. Callers debounce; this layer caches so back-navigation is free. */
export async function searchMedia(params: SearchParams): Promise<Paged<AniListMediaLite>> {
  const {
    query,
    page: pageNumber = 1,
    type = 'ANIME',
    format,
    genre,
    tag,
    seasonYear,
    status,
    sort = ['SEARCH_MATCH', 'POPULARITY_DESC'],
    includeAdult = false,
  } = params;

  const trimmed = query.trim();
  const hasFilter = Boolean(format || genre || tag || seasonYear || status);
  if (trimmed.length === 0 && !hasFilter) return { items: [], hasNextPage: false, page: pageNumber };

  const key = [
    'anilist:search',
    type,
    trimmed.toLowerCase(),
    pageNumber,
    format ?? '',
    genre ?? '',
    tag ?? '',
    seasonYear ?? '',
    status ?? '',
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
      format: format ?? undefined,
      genre: genre ?? undefined,
      tag: tag ?? undefined,
      seasonYear: seasonYear ?? undefined,
      status: status ?? undefined,
      sort,
    });
    const result = page(data.Page, pageNumber);
    // Warm the per-title cache so tapping a result renders instantly.
    for (const item of result.items) primeMediaLite(item);
    return result;
  });
}

/** F-02. Finished series get the 30-day tier (§4.5.2). */
export async function getMedia(id: number): Promise<AniListMedia> {
  const key = 'anilist:media:' + id;

  return withCache(key, TTL.title, async () => {
    const data = await anilistRequest<{ Media: AniListMedia | null }>(MEDIA_DETAIL_QUERY, { id });
    if (!data.Media) throw new Error('Media ' + id + ' not found');
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
  for (let index = 0; index < ids.length; index += 50) {
    chunks.push(ids.slice(index, index + 50));
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
      cacheKey: 'genre:' + genre.toLowerCase(),
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
    cacheKey: 'season:' + type + ':' + season + ':' + year,
  });
}

export function getGenres(): Promise<string[]> {
  return withCache('anilist:genres', TTL.finishedTitle, async () => {
    const data = await anilistRequest<{ GenreCollection: string[] | null }>(GENRES_QUERY);
    return data.GenreCollection ?? [];
  });
}

export function getMediaTags(): Promise<AniListMediaTag[]> {
  return withCache('anilist:media-tags', TTL.finishedTitle, async () => {
    const data = await anilistRequest<{ MediaTagCollection: AniListMediaTag[] | null }>(TAGS_QUERY);
    return (data.MediaTagCollection ?? []).filter(
      (tag) => !tag.isAdult && !tag.isGeneralSpoiler && !tag.isMediaSpoiler,
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
    }>(AIRING_SCHEDULE_QUERY, { page: pageNumber, perPage: 50, from: fromSeconds, to: toSeconds });

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
  cacheSet('anilist:lite:' + media.id, media, TTL.title);
}

export function getCachedMediaLite(id: number): AniListMediaLite | null {
  return cacheGet<AniListMediaLite>('anilist:lite:' + id, { allowStale: true });
}

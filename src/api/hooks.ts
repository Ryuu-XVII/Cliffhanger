import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useSettingsStore } from '@/stores/settingsStore';
import type { AniListMedia, AniListSeason } from './anilist/types';
import {
  discover,
  getAiringSchedule,
  getCachedMediaLite,
  getGenres,
  getMedia,
  getMediaTags,
  getSeason,
  getStudioMedia,
  hasSearchFilters,
  searchMedia,
  searchStudios,
} from './anilist';
import { getMalStats } from './jikan';
import { getAiringInfo } from './animeschedule';
import { ApiError } from './errors';

/**
 * The only React-facing entry points to the network (§3.3). TanStack Query
 * handles dedupe, retries and stale-while-revalidate on top of the MMKV cache
 * underneath, which is what keeps a session under ten external calls (§12).
 */

const STALE = {
  browse: 6 * 60 * 60 * 1000,
  title: 24 * 60 * 60 * 1000,
  airing: 60 * 60 * 1000,
  search: 5 * 60 * 1000,
  /** Genre and tag vocabularies - AniList adds to these a few times a year. */
  reference: 30 * 24 * 60 * 60 * 1000,
};

const SECONDS_PER_HOUR = 3600;

/** Do not retry a request the server already told us not to repeat. */
function retryPolicy(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.kind === 'not-found' || error.kind === 'unauthorized' || error.kind === 'offline') {
      return false;
    }
  }
  return failureCount < 2;
}

/** F-01 requires a 300ms debounce on search input. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export interface SearchOptions {
  format?: string[];
  status?: string[];
  genre?: string[];
  tag?: string[];
  source?: string[];
  excludeGenre?: string[];
  excludeTag?: string[];
  minimumTagRank?: number;
  season?: AniListSeason;
  seasonYear?: number;
  yearFrom?: number;
  yearTo?: number;
  minScore?: number;
  minEpisodes?: number;
  maxEpisodes?: number;
  maxDuration?: number;
  countryOfOrigin?: string;
  sort?: string[];
  type?: 'ANIME' | 'MANGA';
}

/** Infinite-scroll search used by the dedicated results screen. */
export function useSearchResults(query: string, options: SearchOptions = {}) {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);
  const trimmed = query.trim();
  const hasFilters = hasSearchFilters(options);

  return useInfiniteQuery({
    queryKey: ['search-results', trimmed, options, includeAdult],
    enabled: trimmed.length > 0 || hasFilters,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      searchMedia({ query: trimmed, page: pageParam as number, includeAdult, ...options }),
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: STALE.search,
    retry: retryPolicy,
  });
}

/** Lightweight inline preview shown under the search field while typing (top few matches). */
export function useSearchPreview(query: string, type: 'ANIME' | 'MANGA') {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['search-preview', trimmed, type, includeAdult],
    enabled: trimmed.length >= 2,
    queryFn: () => searchMedia({ query: trimmed, page: 1, type, includeAdult, sort: ['SEARCH_MATCH', 'POPULARITY_DESC'] }),
    staleTime: STALE.search,
    retry: retryPolicy,
  });
}

/** Studio-name typeahead for the search screen's studio filter. */
export function useStudioSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['studio-search', trimmed],
    enabled: trimmed.length >= 2,
    queryFn: () => searchStudios(trimmed),
    staleTime: STALE.browse,
    retry: retryPolicy,
  });
}

/** A studio's own catalogue - AniList has no studio filter on Media, so this is a separate browse path (see getStudioMedia). */
export function useStudioMedia(studioId: number | null, sort: string[]) {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);

  return useInfiniteQuery({
    queryKey: ['studio-media', studioId, sort, includeAdult],
    enabled: studioId !== null,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getStudioMedia(studioId as number, pageParam as number, sort, includeAdult),
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: STALE.browse,
    retry: retryPolicy,
  });
}

export function useMedia(id: number | null) {
  return useQuery({
    queryKey: ['media', id],
    enabled: id !== null,
    queryFn: () => getMedia(id as number),
    // A title just tapped from a search/discover grid was already cached in
    // its lighter MediaLite shape - reusing it here means the screen paints
    // the real title, cover and score immediately instead of "Untitled"
    // while the much heavier full query (synopsis, characters, staff,
    // recommendations) is still in flight. It shares every field the detail
    // screen actually reads before the real data lands; TanStack Query
    // discards it the moment the real query resolves.
    placeholderData:
      id === null ? undefined : ((getCachedMediaLite(id) ?? undefined) as AniListMedia | undefined),
    staleTime: STALE.title,
    retry: retryPolicy,
  });
}

export type DiscoverShelfId =
  | 'trending'
  | 'popularNow'
  | 'topRated'
  | 'topMovies'
  | 'airingSoon';

export function useDiscoverShelf(shelf: DiscoverShelfId) {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);

  return useQuery({
    queryKey: ['discover', shelf, includeAdult],
    queryFn: () => discover[shelf](1, includeAdult),
    staleTime: shelf === 'airingSoon' ? STALE.airing : STALE.browse,
    retry: retryPolicy,
  });
}

/** Paginated variant of a discover shelf, for its "See all" destination. */
export function useDiscoverShelfBrowse(shelf: DiscoverShelfId | null) {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);

  return useInfiniteQuery({
    queryKey: ['discover-browse', shelf, includeAdult],
    enabled: shelf !== null,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => discover[shelf as DiscoverShelfId](pageParam as number, includeAdult),
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: shelf === 'airingSoon' ? STALE.airing : STALE.browse,
    retry: retryPolicy,
  });
}

export function useGenreShelf(genre: string | null) {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);

  return useQuery({
    queryKey: ['genre', genre, includeAdult],
    enabled: genre !== null,
    queryFn: () => discover.byGenre(genre as string, 1, includeAdult),
    staleTime: STALE.browse,
    retry: retryPolicy,
  });
}

export function useSeasonBrowse(
  season: AniListSeason,
  year: number,
  type: 'ANIME' | 'MANGA' = 'ANIME',
) {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);

  return useInfiniteQuery({
    queryKey: ['season', season, year, type, includeAdult],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getSeason(season, year, pageParam as number, includeAdult, type),
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: STALE.browse,
    retry: retryPolicy,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: getGenres,
    staleTime: STALE.reference,
    retry: retryPolicy,
  });
}

export function useMediaTags() {
  const includeAdult = useSettingsStore((state) => state.settings.showAdult);
  return useQuery({
    queryKey: ['media-tags', includeAdult],
    queryFn: () => getMediaTags(includeAdult),
    staleTime: STALE.reference,
    retry: retryPolicy,
  });
}

/**
 * Airing schedule for the next `hours`, used by the home screen and by the
 * local notification scheduler. Cached for an hour per §4.5.2.
 */
export function useAiringWindow(hours = 168) {
  const from = Math.floor(Date.now() / 1000);
  const to = from + hours * SECONDS_PER_HOUR;
  // Bucket the window so the key is stable within the hour and the cache holds.
  const bucket = Math.floor(from / SECONDS_PER_HOUR);

  return useQuery({
    queryKey: ['airing', bucket, hours],
    queryFn: async () => {
      const first = await getAiringSchedule(from, to, 1);
      if (!first.hasNextPage) return first.items;
      const second = await getAiringSchedule(from, to, 2);
      return [...first.items, ...second.items];
    },
    staleTime: STALE.airing,
    retry: retryPolicy,
  });
}

/** F-02 secondary row. Never blocks the detail screen - it resolves to null. */
export function useMalStats(malId: number | null) {
  return useQuery({
    queryKey: ['mal', malId],
    enabled: malId !== null,
    queryFn: () => getMalStats(malId),
    staleTime: STALE.title,
    retry: false,
  });
}

/**
 * F-14 / F-22 — airing times, delays and streaming links from AnimeSchedule.
 *
 * Cached on the airing tier and never retried hard: it is supplementary, and
 * the detail screen must render fully without it.
 */
export function useAiringInfo(anilistId: number | null) {
  return useQuery({
    queryKey: ['animeschedule', anilistId],
    enabled: anilistId !== null,
    queryFn: () => getAiringInfo(anilistId),
    staleTime: STALE.airing,
    retry: false,
  });
}

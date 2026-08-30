import type { AniListSeason } from '@/api/anilist/types';
import type { SearchOptions } from '@/api/hooks';
import { readJson, writeJson } from '@/api/kv';

/**
 * The whole filter set as one serialisable object.
 *
 * Keeping it in a single shape rather than twenty pieces of screen state buys
 * three things the search screen needs: it can be persisted verbatim so a
 * carefully built filter set survives leaving the screen, it can be saved and
 * restored as a named search, and it can be handed to the results screen as a
 * single param instead of twenty that are easy to forget to pass.
 */

export type LibraryScope = 'all' | 'in-library' | 'not-in-library';

export interface StudioRef {
  id: number;
  name: string;
}

export interface SearchFilters {
  type: 'ANIME' | 'MANGA';
  formats: string[];
  statuses: string[];
  genres: string[];
  excludedGenres: string[];
  tags: string[];
  excludedTags: string[];
  /** 0-100 tag relevance floor; null leaves AniList's default. */
  minimumTagRank: number | null;
  sources: string[];
  countryOfOrigin: string | null;
  season: AniListSeason | null;
  yearFrom: number | null;
  yearTo: number | null;
  minScore: number | null;
  minEpisodes: number | null;
  maxEpisodes: number | null;
  maxDuration: number | null;
  /** Applied on the client - AniList's own onList needs their account linked. */
  libraryScope: LibraryScope;
  sort: string[];
  studio: StudioRef | null;
}

export const DEFAULT_SORT = ['SEARCH_MATCH', 'POPULARITY_DESC'];

export const EMPTY_FILTERS: SearchFilters = {
  type: 'ANIME',
  formats: [],
  statuses: [],
  genres: [],
  excludedGenres: [],
  tags: [],
  excludedTags: [],
  minimumTagRank: null,
  sources: [],
  countryOfOrigin: null,
  season: null,
  yearFrom: null,
  yearTo: null,
  minScore: null,
  minEpisodes: null,
  maxEpisodes: null,
  maxDuration: null,
  libraryScope: 'all',
  sort: DEFAULT_SORT,
  studio: null,
};

/* ------------------------------ option data ------------------------------ */

export const ANIME_FORMATS = [
  { value: 'TV', label: 'TV' },
  { value: 'TV_SHORT', label: 'TV short' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'MUSIC', label: 'Music' },
];

export const MANGA_FORMATS = [
  { value: 'MANGA', label: 'Manga' },
  { value: 'NOVEL', label: 'Light novel' },
  { value: 'ONE_SHOT', label: 'One shot' },
];

/** All five MediaStatus values - CANCELLED used to be missing. */
export const STATUSES = [
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
  { value: 'HIATUS', label: 'On hiatus' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const SOURCES = [
  { value: 'ORIGINAL', label: 'Original' },
  { value: 'MANGA', label: 'Manga' },
  { value: 'LIGHT_NOVEL', label: 'Light novel' },
  { value: 'WEB_NOVEL', label: 'Web novel' },
  { value: 'NOVEL', label: 'Novel' },
  { value: 'VISUAL_NOVEL', label: 'Visual novel' },
  { value: 'VIDEO_GAME', label: 'Video game' },
  { value: 'GAME', label: 'Game' },
  { value: 'DOUJINSHI', label: 'Doujinshi' },
  { value: 'COMIC', label: 'Comic' },
  { value: 'LIVE_ACTION', label: 'Live action' },
  { value: 'MULTIMEDIA_PROJECT', label: 'Multimedia' },
  { value: 'PICTURE_BOOK', label: 'Picture book' },
  { value: 'OTHER', label: 'Other' },
];

export const COUNTRIES = [
  { value: 'JP', label: 'Japan' },
  { value: 'CN', label: 'China' },
  { value: 'KR', label: 'Korea' },
  { value: 'TW', label: 'Taiwan' },
];

export const SEASONS: { value: AniListSeason; label: string }[] = [
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
];

export const SCORE_PRESETS = [
  { value: 60, label: '60+' },
  { value: 70, label: '70+' },
  { value: 80, label: '80+' },
  { value: 90, label: '90+' },
];

/** Presets beat a numeric keypad on mobile for a range this coarse. */
export const EPISODE_PRESETS = [
  { label: '1-12', min: 1, max: 12 },
  { label: '13-26', min: 13, max: 26 },
  { label: '27-99', min: 27, max: 99 },
  { label: '100+', min: 100, max: null },
];

/** Manga run far longer than a cour, so the buckets are scaled to match. */
export const CHAPTER_PRESETS = [
  { label: '1-50', min: 1, max: 50 },
  { label: '51-150', min: 51, max: 150 },
  { label: '151-500', min: 151, max: 500 },
  { label: '500+', min: 500, max: null },
];

export const DURATION_PRESETS = [
  { value: 10, label: 'Under 10 min' },
  { value: 25, label: 'Under 25 min' },
  { value: 45, label: 'Under 45 min' },
];

export const TAG_RANK_PRESETS = [
  { value: 50, label: 'Fairly relevant' },
  { value: 75, label: 'Very relevant' },
];

export interface SortOption {
  value: string[];
  label: string;
  /** Sorts with no meaningful ascending twin, or that need typed text. */
  directional?: boolean;
  requiresQuery?: boolean;
}

export const SORTS: SortOption[] = [
  { value: DEFAULT_SORT, label: 'Best match', requiresQuery: true },
  { value: ['POPULARITY_DESC'], label: 'Popularity', directional: true },
  { value: ['SCORE_DESC'], label: 'Score', directional: true },
  { value: ['START_DATE_DESC'], label: 'Release date', directional: true },
  { value: ['FAVOURITES_DESC'], label: 'Favourites', directional: true },
  { value: ['TITLE_ROMAJI'], label: 'Title', directional: true },
  { value: ['EPISODES_DESC'], label: 'Episode count', directional: true },
];

/**
 * AniList encodes direction in the enum name rather than a separate argument,
 * so flipping direction means rewriting the enum: SCORE_DESC <-> SCORE.
 */
export function flipSortDirection(sort: string[]): string[] {
  return sort.map((key) => (key.endsWith('_DESC') ? key.slice(0, -5) : key + '_DESC'));
}

export function isDescending(sort: string[]): boolean {
  return sort[0]?.endsWith('_DESC') ?? false;
}

/** Matches a sort against the option list ignoring its current direction. */
export function sortMatches(sort: string[], option: SortOption): boolean {
  const base = (keys: string[]) => keys.map((key) => key.replace(/_DESC$/, '')).join(',');
  return base(sort) === base(option.value);
}

/* ------------------------------ derivations ------------------------------ */

export function countActiveFilters(filters: SearchFilters): number {
  if (filters.studio) return 1; // Studio browsing ignores everything else.
  return (
    filters.formats.length +
    filters.statuses.length +
    filters.genres.length +
    filters.excludedGenres.length +
    filters.tags.length +
    filters.excludedTags.length +
    filters.sources.length +
    (filters.countryOfOrigin ? 1 : 0) +
    (filters.season ? 1 : 0) +
    (filters.yearFrom || filters.yearTo ? 1 : 0) +
    (filters.minScore ? 1 : 0) +
    (filters.minEpisodes || filters.maxEpisodes ? 1 : 0) +
    (filters.maxDuration ? 1 : 0) +
    (filters.minimumTagRank ? 1 : 0) +
    (filters.libraryScope !== 'all' ? 1 : 0) +
    (sortMatches(filters.sort, SORTS[0] as SortOption) ? 0 : 1)
  );
}

export interface FilterPill {
  /** Stable identity so the removal handler knows what to undo. */
  id: string;
  label: string;
  /** True for exclusions, which render differently. */
  negated?: boolean;
}

/**
 * The at-a-glance summary. Without this the only feedback on a filter set is a
 * count and an all-or-nothing Clear, which makes removing one wrong choice mean
 * hunting back through every section.
 */
export function describeFilters(filters: SearchFilters): FilterPill[] {
  const pills: FilterPill[] = [];
  const label = (list: { value: string; label: string }[], value: string): string =>
    list.find((option) => option.value === value)?.label ?? value;

  if (filters.studio) {
    pills.push({ id: 'studio', label: filters.studio.name });
    return pills;
  }

  const formatOptions = filters.type === 'MANGA' ? MANGA_FORMATS : ANIME_FORMATS;
  for (const value of filters.formats) pills.push({ id: 'format:' + value, label: label(formatOptions, value) });
  for (const value of filters.statuses) pills.push({ id: 'status:' + value, label: label(STATUSES, value) });
  for (const value of filters.genres) pills.push({ id: 'genre:' + value, label: value });
  for (const value of filters.excludedGenres) pills.push({ id: 'excludeGenre:' + value, label: value, negated: true });
  for (const value of filters.tags) pills.push({ id: 'tag:' + value, label: value });
  for (const value of filters.excludedTags) pills.push({ id: 'excludeTag:' + value, label: value, negated: true });
  for (const value of filters.sources) pills.push({ id: 'source:' + value, label: label(SOURCES, value) });

  if (filters.countryOfOrigin) {
    pills.push({ id: 'country', label: label(COUNTRIES, filters.countryOfOrigin) });
  }
  if (filters.season) {
    pills.push({ id: 'season', label: SEASONS.find((s) => s.value === filters.season)?.label ?? filters.season });
  }
  if (filters.yearFrom || filters.yearTo) {
    const from = filters.yearFrom ?? null;
    const to = filters.yearTo ?? null;
    pills.push({
      id: 'year',
      label: from && to ? (from === to ? String(from) : from + '-' + to) : from ? from + ' onward' : 'Up to ' + to,
    });
  }
  if (filters.minScore) pills.push({ id: 'minScore', label: filters.minScore + '+ score' });
  if (filters.minEpisodes || filters.maxEpisodes) {
    const min = filters.minEpisodes;
    const max = filters.maxEpisodes;
    const unit = filters.type === 'MANGA' ? ' ch' : ' eps';
    pills.push({
      id: 'episodes',
      label: (min && max ? min + '-' + max : min ? min + '+' : 'Up to ' + max) + unit,
    });
  }
  if (filters.maxDuration) pills.push({ id: 'duration', label: 'Under ' + filters.maxDuration + ' min' });
  if (filters.minimumTagRank) pills.push({ id: 'tagRank', label: filters.minimumTagRank + '%+ tag match' });
  if (filters.libraryScope !== 'all') {
    pills.push({
      id: 'libraryScope',
      label: filters.libraryScope === 'in-library' ? 'In my library' : 'Not in my library',
    });
  }
  if (!sortMatches(filters.sort, SORTS[0] as SortOption)) {
    const option = SORTS.find((candidate) => sortMatches(filters.sort, candidate));
    if (option) {
      pills.push({ id: 'sort', label: option.label + (isDescending(filters.sort) ? ' ↓' : ' ↑') });
    }
  }
  return pills;
}

/** Removes whatever a summary pill represents, by its id. */
export function removeFilter(filters: SearchFilters, id: string): SearchFilters {
  const [kind, value] = id.split(/:(.*)/s);
  const without = (list: string[]): string[] => list.filter((item) => item !== value);

  switch (kind) {
    case 'studio':
      return { ...filters, studio: null };
    case 'format':
      return { ...filters, formats: without(filters.formats) };
    case 'status':
      return { ...filters, statuses: without(filters.statuses) };
    case 'genre':
      return { ...filters, genres: without(filters.genres) };
    case 'excludeGenre':
      return { ...filters, excludedGenres: without(filters.excludedGenres) };
    case 'tag':
      return { ...filters, tags: without(filters.tags) };
    case 'excludeTag':
      return { ...filters, excludedTags: without(filters.excludedTags) };
    case 'source':
      return { ...filters, sources: without(filters.sources) };
    case 'country':
      return { ...filters, countryOfOrigin: null };
    case 'season':
      return { ...filters, season: null };
    case 'year':
      return { ...filters, yearFrom: null, yearTo: null };
    case 'minScore':
      return { ...filters, minScore: null };
    case 'episodes':
      return { ...filters, minEpisodes: null, maxEpisodes: null };
    case 'duration':
      return { ...filters, maxDuration: null };
    case 'tagRank':
      return { ...filters, minimumTagRank: null };
    case 'libraryScope':
      return { ...filters, libraryScope: 'all' };
    case 'sort':
      return { ...filters, sort: DEFAULT_SORT };
    default:
      return filters;
  }
}

/**
 * Tri-state selection: neutral -> included -> excluded -> neutral. One tap
 * target does the work of two lists, which is what keeps a genre grid with
 * exclusions from doubling in size.
 */
export type TriState = 'neutral' | 'included' | 'excluded';

export function triStateOf(value: string, included: string[], excluded: string[]): TriState {
  if (included.includes(value)) return 'included';
  if (excluded.includes(value)) return 'excluded';
  return 'neutral';
}

export function cycleTriState(
  value: string,
  included: string[],
  excluded: string[],
): { included: string[]; excluded: string[] } {
  switch (triStateOf(value, included, excluded)) {
    case 'neutral':
      return { included: [...included, value], excluded };
    case 'included':
      return { included: included.filter((item) => item !== value), excluded: [...excluded, value] };
    case 'excluded':
      return { included, excluded: excluded.filter((item) => item !== value) };
  }
}

/** Maps the UI shape onto the API shape. */
export function toSearchOptions(filters: SearchFilters): SearchOptions {
  // A single year keeps using seasonYear so it can pair with a season; a real
  // range has to go through start-date bounds, which seasonYear cannot express.
  const singleYear =
    filters.yearFrom !== null && filters.yearFrom === filters.yearTo ? filters.yearFrom : null;

  return {
    type: filters.type,
    format: filters.formats,
    status: filters.statuses,
    genre: filters.genres,
    excludeGenre: filters.excludedGenres,
    tag: filters.tags,
    excludeTag: filters.excludedTags,
    minimumTagRank: filters.minimumTagRank ?? undefined,
    source: filters.sources,
    countryOfOrigin: filters.countryOfOrigin ?? undefined,
    season: filters.season ?? undefined,
    seasonYear: singleYear ?? undefined,
    yearFrom: singleYear === null ? (filters.yearFrom ?? undefined) : undefined,
    yearTo: singleYear === null ? (filters.yearTo ?? undefined) : undefined,
    minScore: filters.minScore ?? undefined,
    minEpisodes: filters.minEpisodes ?? undefined,
    maxEpisodes: filters.maxEpisodes ?? undefined,
    maxDuration: filters.maxDuration ?? undefined,
    sort: filters.sort,
  };
}

/* ------------------------------ persistence ------------------------------ */

const DRAFT_KEY = 'search:draft';
const SAVED_KEY = 'search:saved';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  createdAt: number;
}

/** Merged onto EMPTY_FILTERS so a stored draft from an older build still loads. */
export function loadDraft(): { query: string; filters: SearchFilters } | null {
  const stored = readJson<{ query: string; filters: Partial<SearchFilters> }>(DRAFT_KEY);
  if (!stored) return null;
  return { query: stored.query ?? '', filters: { ...EMPTY_FILTERS, ...stored.filters } };
}

export function saveDraft(query: string, filters: SearchFilters): void {
  writeJson(DRAFT_KEY, { query, filters });
}

export function listSavedSearches(): SavedSearch[] {
  return readJson<SavedSearch[]>(SAVED_KEY) ?? [];
}

export function saveSearch(name: string, query: string, filters: SearchFilters): SavedSearch[] {
  const entry: SavedSearch = {
    id: 'saved-' + Date.now().toString(36),
    name: name.trim(),
    query,
    filters,
    createdAt: Date.now(),
  };
  const next = [entry, ...listSavedSearches()].slice(0, 20);
  writeJson(SAVED_KEY, next);
  return next;
}

export function deleteSavedSearch(id: string): SavedSearch[] {
  const next = listSavedSearches().filter((entry) => entry.id !== id);
  writeJson(SAVED_KEY, next);
  return next;
}

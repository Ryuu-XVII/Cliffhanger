/**
 * AniList response shapes. Every field that AniList can omit is typed
 * `| null` - §4.2 demands defensive handling of sparse entries, and AniList is
 * just as capable of returning nulls as Jikan.
 */

export interface AniListTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

export interface AniListCoverImage {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
  color: string | null;
}

export interface AniListDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListAiringSchedule {
  id: number;
  episode: number;
  /** Unix seconds, JST-derived but absolute (§11). */
  airingAt: number;
  timeUntilAiring: number;
}

export interface AniListStudioEdge {
  isMain: boolean;
  node: { id: number; name: string };
}

export interface AniListRelationEdge {
  relationType: string | null;
  node: AniListMediaLite | null;
}

export interface AniListRecommendationEdge {
  node: { mediaRecommendation: AniListMediaLite | null } | null;
}

export interface AniListCharacterEdge {
  role: string | null;
  node: {
    id: number;
    name: { full: string | null; native: string | null } | null;
    image: { large: string | null } | null;
  } | null;
  voiceActors: Array<{
    id: number;
    name: { full: string | null } | null;
    image: { large: string | null } | null;
    languageV2: string | null;
  }> | null;
}

export interface AniListStaffEdge {
  role: string | null;
  node: {
    id: number;
    name: { full: string | null } | null;
    image: { large: string | null } | null;
  } | null;
}

export interface AniListExternalLink {
  id: number;
  url: string | null;
  site: string | null;
  type: string | null;
  language: string | null;
  icon: string | null;
  color: string | null;
}

export interface AniListMediaTag {
  id: number;
  name: string;
  category: string | null;
  isGeneralSpoiler: boolean | null;
  isMediaSpoiler: boolean | null;
  isAdult: boolean | null;
}

export interface AniListMediaLite {
  id: number;
  idMal: number | null;
  type: 'ANIME' | 'MANGA' | null;
  title: AniListTitle | null;
  coverImage: AniListCoverImage | null;
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  startDate: AniListDate | null;
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  genres: string[] | null;
  isAdult: boolean | null;
  nextAiringEpisode: AniListAiringSchedule | null;
}

export interface AniListMedia extends AniListMediaLite {
  description: string | null;
  endDate: AniListDate | null;
  source: string | null;
  countryOfOrigin: string | null;
  favourites: number | null;
  hashtag: string | null;
  synonyms: string[] | null;
  tags: Array<{ id: number; name: string; rank: number | null; isGeneralSpoiler: boolean | null; isMediaSpoiler: boolean | null }> | null;
  studios: { edges: AniListStudioEdge[] | null } | null;
  relations: { edges: AniListRelationEdge[] | null } | null;
  recommendations: { edges: AniListRecommendationEdge[] | null } | null;
  characters: { edges: AniListCharacterEdge[] | null } | null;
  staff: { edges: AniListStaffEdge[] | null } | null;
  externalLinks: AniListExternalLink[] | null;
  streamingEpisodes: Array<{ title: string | null; thumbnail: string | null; url: string | null; site: string | null }> | null;
  trailer: { id: string | null; site: string | null; thumbnail: string | null } | null;
  airingSchedule: { nodes: AniListAiringSchedule[] | null } | null;
}

export interface AniListPageInfo {
  total: number | null;
  currentPage: number | null;
  lastPage: number | null;
  hasNextPage: boolean | null;
  perPage: number | null;
}

export interface AniListPage<T> {
  pageInfo: AniListPageInfo | null;
  media: T[] | null;
}

export type AniListSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AniListViewer {
  id: number;
  name: string;
  avatar: { large: string | null } | null;
  options: { titleLanguage: string | null; displayAdultContent: boolean | null } | null;
  mediaListOptions: { scoreFormat: string | null } | null;
}

export interface AniListMediaListEntry {
  id: number;
  status: string | null;
  score: number | null;
  progress: number | null;
  progressVolumes: number | null;
  repeat: number | null;
  notes: string | null;
  private: boolean | null;
  startedAt: AniListDate | null;
  completedAt: AniListDate | null;
  updatedAt: number | null;
  media: AniListMediaLite | null;
}

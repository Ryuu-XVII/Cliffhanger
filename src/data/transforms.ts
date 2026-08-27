import type { AniListMedia, AniListMediaLite } from '@/api/anilist/types';
import type { EntrySnapshot, MediaType } from './models';

/**
 * §4.5.3 - Firestore stores IDs plus a minimal denormalised snapshot, never a
 * copy of the catalogue. This is the single place a snapshot is built, so the
 * shape can never drift between search, detail and import.
 */
export function toSnapshot(media: AniListMediaLite | AniListMedia): EntrySnapshot {
  return {
    title: {
      romaji: media.title?.romaji ?? null,
      english: media.title?.english ?? null,
      native: media.title?.native ?? null,
    },
    coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? media.coverImage?.medium ?? null,
    bannerImage: media.bannerImage ?? null,
    totalEpisodes: media.episodes ?? null,
    format: media.format ?? null,
    airingStatus: media.status ?? null,
    nextAiringAt: media.nextAiringEpisode?.airingAt ?? null,
    genres: media.genres ?? [],
    averageScore: media.averageScore ?? null,
    totalChapters: media.chapters ?? null,
    totalVolumes: media.volumes ?? null,
  };
}

export function mediaTypeOf(media: AniListMediaLite | AniListMedia): MediaType {
  return media.type === 'MANGA' ? 'MANGA' : 'ANIME';
}

/** AniList list status strings map 1:1 onto ours, but guard the unknown case. */
export function fromAniListStatus(status: string | null | undefined): EntryStatusLike {
  switch (status) {
    case 'CURRENT':
      return 'WATCHING';
    case 'PLANNING':
      return 'PLANNING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PAUSED':
      return 'ON_HOLD';
    case 'DROPPED':
      return 'DROPPED';
    case 'REPEATING':
      return 'REWATCHING';
    default:
      return 'PLANNING';
  }
}

export function toAniListStatus(status: EntryStatusLike): string {
  switch (status) {
    case 'WATCHING':
      return 'CURRENT';
    case 'ON_HOLD':
      return 'PAUSED';
    case 'REWATCHING':
      return 'REPEATING';
    default:
      return status;
  }
}

type EntryStatusLike =
  | 'WATCHING'
  | 'PLANNING'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'DROPPED'
  | 'REWATCHING';

/** AniList descriptions carry a little HTML even with asHtml:false. */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatLabel(format: string | null | undefined): string {
  switch (format) {
    case 'TV':
      return 'TV';
    case 'TV_SHORT':
      return 'TV short';
    case 'MOVIE':
      return 'Movie';
    case 'SPECIAL':
      return 'Special';
    case 'OVA':
      return 'OVA';
    case 'ONA':
      return 'ONA';
    case 'MUSIC':
      return 'Music';
    case 'MANGA':
      return 'Manga';
    case 'NOVEL':
      return 'Light novel';
    case 'ONE_SHOT':
      return 'One shot';
    default:
      return format ? format.replace(/_/g, ' ') : 'Unknown';
  }
}

export function airingLabel(status: string | null | undefined): string {
  switch (status) {
    case 'RELEASING':
      return 'Airing';
    case 'FINISHED':
      return 'Finished';
    case 'NOT_YET_RELEASED':
      return 'Not yet aired';
    case 'CANCELLED':
      return 'Cancelled';
    case 'HIATUS':
      return 'On hiatus';
    default:
      return 'Unknown';
  }
}

export function relationLabel(relation: string | null | undefined): string {
  if (!relation) return 'Related';
  return relation
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

import type { AniListSeason } from '@/api/anilist/types';

export const SEASONS: AniListSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

export const SEASON_LABELS: Record<AniListSeason, string> = {
  WINTER: 'Winter',
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
};

export interface SeasonRef {
  season: AniListSeason;
  year: number;
}

export function currentSeason(date = new Date()): SeasonRef {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month <= 1 || month === 11) {
    // December belongs to the winter season of the following year.
    return { season: 'WINTER', year: month === 11 ? year + 1 : year };
  }
  if (month <= 4) return { season: 'SPRING', year };
  if (month <= 7) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

export function nextSeason(ref: SeasonRef): SeasonRef {
  const index = SEASONS.indexOf(ref.season);
  const next = (index + 1) % SEASONS.length;
  return { season: SEASONS[next] as AniListSeason, year: next === 0 ? ref.year + 1 : ref.year };
}

export function previousSeason(ref: SeasonRef): SeasonRef {
  const index = SEASONS.indexOf(ref.season);
  const prev = (index + SEASONS.length - 1) % SEASONS.length;
  return {
    season: SEASONS[prev] as AniListSeason,
    year: prev === SEASONS.length - 1 ? ref.year - 1 : ref.year,
  };
}

export function seasonLabel(ref: SeasonRef): string {
  return `${SEASON_LABELS[ref.season]} ${ref.year}`;
}

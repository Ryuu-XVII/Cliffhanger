import { currentSeason, nextSeason, previousSeason, seasonLabel } from '@/utils/season';

describe('season maths', () => {
  it('maps months onto the right season', () => {
    expect(currentSeason(new Date(2026, 0, 15)).season).toBe('WINTER');
    expect(currentSeason(new Date(2026, 3, 1)).season).toBe('SPRING');
    expect(currentSeason(new Date(2026, 6, 20)).season).toBe('SUMMER');
    expect(currentSeason(new Date(2026, 9, 5)).season).toBe('FALL');
  });

  it('rolls December into the following winter', () => {
    expect(currentSeason(new Date(2026, 11, 20))).toEqual({ season: 'WINTER', year: 2027 });
  });

  it('wraps the year when stepping past the boundary', () => {
    expect(nextSeason({ season: 'FALL', year: 2026 })).toEqual({ season: 'WINTER', year: 2027 });
    expect(previousSeason({ season: 'WINTER', year: 2026 })).toEqual({ season: 'FALL', year: 2025 });
  });

  it('labels a season for display', () => {
    expect(seasonLabel({ season: 'SUMMER', year: 2024 })).toBe('Summer 2024');
  });
});

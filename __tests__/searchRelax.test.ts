import { relaxQuery } from '@/api/anilist';

describe('relaxQuery', () => {
  it('drops filler words first', () => {
    expect(relaxQuery('Rise of the Shield Hero')).toBe('Rise Shield Hero');
  });

  it('falls back to dropping the last word once there are no filler words', () => {
    expect(relaxQuery('Frieren Beyond Journeys End Movie')).toBe('Frieren Beyond Journeys End');
  });

  it('returns null for a single word - nothing left to relax', () => {
    expect(relaxQuery('Naruto')).toBeNull();
  });

  it('keeps relaxing one word at a time until a single word is all that is left', () => {
    let query: string | null = 'My Hero Academia Season 7 Final';
    const seen: string[] = [];
    while (query) {
      seen.push(query);
      query = relaxQuery(query);
    }
    expect(seen).toEqual([
      'My Hero Academia Season 7 Final',
      'My Hero Academia Season 7',
      'My Hero Academia Season',
      'My Hero Academia',
      'My Hero',
      'My',
    ]);
  });
});

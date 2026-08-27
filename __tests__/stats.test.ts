import { computeStats } from '@/features/stats/compute';
import type { LibraryEntry } from '@/data/models';

function entry(overrides: Partial<LibraryEntry>): LibraryEntry {
  return {
    anilistId: 1,
    malId: null,
    mediaType: 'ANIME',
    status: 'COMPLETED',
    progress: 12,
    score: null,
    rewatches: 0,
    notes: '',
    startedAt: null,
    completedAt: null,
    updatedAt: 0,
    customListIds: [],
    notify: null,
    private: false,
    snapshot: {
      title: { romaji: 'x', english: null, native: null },
      coverImage: null,
      bannerImage: null,
      totalEpisodes: 12,
      format: 'TV',
      airingStatus: 'FINISHED',
      genres: ['Action'],
      averageScore: null,
    },
    ...overrides,
  };
}

describe('library stats', () => {
  it('reports zeroes for an empty library without dividing by zero', () => {
    const stats = computeStats([]);
    expect(stats.totalEntries).toBe(0);
    expect(stats.meanScore).toBeNull();
    expect(stats.completionRate).toBe(0);
    expect(Number.isFinite(stats.daysWatched)).toBe(true);
  });

  it('counts rewatched series as full extra passes', () => {
    const stats = computeStats([entry({ anilistId: 1, progress: 12, rewatches: 2 })]);
    expect(stats.episodesWatched).toBe(36);
    expect(stats.rewatchTotal).toBe(2);
  });

  it('averages only the scored entries', () => {
    const stats = computeStats([
      entry({ anilistId: 1, score: 90 }),
      entry({ anilistId: 2, score: 70 }),
      entry({ anilistId: 3, score: null }),
    ]);
    expect(stats.meanScore).toBe(80);
    expect(stats.scoredCount).toBe(2);
  });

  it('excludes planning entries from the completion rate', () => {
    const stats = computeStats([
      entry({ anilistId: 1, status: 'COMPLETED' }),
      entry({ anilistId: 2, status: 'WATCHING' }),
      entry({ anilistId: 3, status: 'PLANNING' }),
    ]);
    expect(stats.completionRate).toBe(0.5);
  });

  it('ranks genres by how often they appear', () => {
    const stats = computeStats([
      entry({ anilistId: 1, snapshot: { ...entry({}).snapshot, genres: ['Action', 'Comedy'] } }),
      entry({ anilistId: 2, snapshot: { ...entry({}).snapshot, genres: ['Action'] } }),
    ]);
    expect(stats.genreBreakdown[0]?.genre).toBe('Action');
    expect(stats.genreBreakdown[0]?.count).toBe(2);
  });

  it('uses a film runtime for movies', () => {
    const stats = computeStats([
      entry({
        anilistId: 1,
        progress: 1,
        snapshot: { ...entry({}).snapshot, format: 'MOVIE', totalEpisodes: 1 },
      }),
    ]);
    expect(stats.minutesWatched).toBe(105);
  });
});

import { buildJsonExport, buildMalXmlExport, parseMalXml } from '@/features/data/importExport';
import type { LibraryEntry } from '@/data/models';

// The export builders are pure; stubbing the sync module keeps the Firebase
// ESM bundle out of the test runtime.
jest.mock('@/data/sync', () => ({ syncNow: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '/tmp' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));

const entry: LibraryEntry = {
  anilistId: 21,
  malId: 21,
  mediaType: 'ANIME',
  status: 'COMPLETED',
  progress: 12,
  score: 85,
  rewatches: 2,
  notes: 'Watched with my brother',
  startedAt: new Date(2026, 0, 5).getTime(),
  completedAt: new Date(2026, 1, 20).getTime(),
  updatedAt: Date.now(),
  customListIds: [],
  notify: null,
  private: false,
  snapshot: {
    title: { romaji: 'One Piece', english: 'One Piece', native: 'ワンピース' },
    coverImage: null,
    bannerImage: null,
    totalEpisodes: 12,
    format: 'TV',
    airingStatus: 'FINISHED',
    genres: ['Action'],
    averageScore: 88,
  },
};

describe('export (F-21)', () => {
  it('writes a self-describing JSON payload', () => {
    const parsed = JSON.parse(buildJsonExport([entry]));
    expect(parsed.format).toBe('cliffhanger-library');
    expect(parsed.entryCount).toBe(1);
    expect(parsed.entries[0].anilistId).toBe(21);
    expect(parsed.entries[0].notes).toBe('Watched with my brother');
  });

  it('writes MAL-compatible XML with a 10 point score', () => {
    const xml = buildMalXmlExport([entry]);
    expect(xml).toContain('<myanimelist>');
    expect(xml).toContain('<series_animedb_id>21</series_animedb_id>');
    expect(xml).toContain('<my_watched_episodes>12</my_watched_episodes>');
    // 85/100 stored becomes 9 on MAL's 10 point scale.
    expect(xml).toContain('<my_score>9</my_score>');
    expect(xml).toContain('<my_status>Completed</my_status>');
    expect(xml).toContain('<my_times_watched>2</my_times_watched>');
  });

  it('round-trips through its own XML parser', () => {
    const parsed = parseMalXml(buildMalXmlExport([entry]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      malId: 21,
      progress: 12,
      score: 9,
      status: 'Completed',
      rewatches: 2,
      notes: 'Watched with my brother',
    });
  });

  it('ignores malformed rows rather than throwing', () => {
    expect(parseMalXml('<myanimelist><anime><series_title>x</series_title></anime></myanimelist>')).toEqual([]);
    expect(parseMalXml('not xml at all')).toEqual([]);
  });
});

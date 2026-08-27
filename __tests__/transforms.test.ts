import { airingLabel, formatLabel, fromAniListStatus, relationLabel, stripHtml, toAniListStatus, toSnapshot } from '@/data/transforms';
import type { AniListMediaLite } from '@/api/anilist/types';

const media: AniListMediaLite = {
  id: 1535,
  idMal: 1535,
  type: 'ANIME',
  title: { romaji: 'Death Note', english: 'Death Note', native: 'デスノート' },
  coverImage: { extraLarge: 'xl.jpg', large: 'l.jpg', medium: 'm.jpg', color: '#fff' },
  bannerImage: 'banner.jpg',
  format: 'TV',
  status: 'FINISHED',
  episodes: 37,
  chapters: null,
  volumes: null,
  duration: 23,
  season: 'FALL',
  seasonYear: 2006,
  startDate: { year: 2006, month: 10, day: 4 },
  averageScore: 84,
  meanScore: 84,
  popularity: 100,
  genres: ['Mystery', 'Psychological'],
  isAdult: false,
  nextAiringEpisode: null,
};

describe('snapshot building', () => {
  it('keeps only what the library needs to render offline', () => {
    const snapshot = toSnapshot(media);
    expect(snapshot.title.romaji).toBe('Death Note');
    expect(snapshot.coverImage).toBe('xl.jpg');
    expect(snapshot.totalEpisodes).toBe(37);
    expect(snapshot.genres).toEqual(['Mystery', 'Psychological']);
  });

  it('survives a sparse entry without throwing', () => {
    const sparse = { ...media, title: null, coverImage: null, genres: null, episodes: null };
    const snapshot = toSnapshot(sparse);
    expect(snapshot.title).toEqual({ romaji: null, english: null, native: null });
    expect(snapshot.coverImage).toBeNull();
    expect(snapshot.genres).toEqual([]);
    expect(snapshot.totalEpisodes).toBeNull();
  });

  it('falls back down the cover image sizes', () => {
    const noExtraLarge = {
      ...media,
      coverImage: { extraLarge: null, large: 'l.jpg', medium: 'm.jpg', color: null },
    };
    expect(toSnapshot(noExtraLarge).coverImage).toBe('l.jpg');
  });
});

describe('status mapping', () => {
  it('maps AniList list statuses onto ours', () => {
    expect(fromAniListStatus('CURRENT')).toBe('WATCHING');
    expect(fromAniListStatus('PAUSED')).toBe('ON_HOLD');
    expect(fromAniListStatus('REPEATING')).toBe('REWATCHING');
  });

  it('defaults an unknown status to planning rather than throwing', () => {
    expect(fromAniListStatus('SOMETHING_NEW')).toBe('PLANNING');
    expect(fromAniListStatus(null)).toBe('PLANNING');
  });

  it('maps back for writes', () => {
    expect(toAniListStatus('WATCHING')).toBe('CURRENT');
    expect(toAniListStatus('ON_HOLD')).toBe('PAUSED');
    expect(toAniListStatus('COMPLETED')).toBe('COMPLETED');
  });
});

describe('text helpers', () => {
  it('strips the markup AniList leaves in descriptions', () => {
    expect(stripHtml('<p>Hello<br>world</p>')).toBe('Hello\nworld');
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(stripHtml(null)).toBe('');
  });

  it('gives human labels for formats and statuses', () => {
    expect(formatLabel('TV_SHORT')).toBe('TV short');
    expect(formatLabel(null)).toBe('Unknown');
    expect(airingLabel('RELEASING')).toBe('Airing');
    expect(relationLabel('SIDE_STORY')).toBe('Side story');
  });
});

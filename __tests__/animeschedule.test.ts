import { describeDelay, parseScheduleDate, scheduleUrl, NULL_DATETIME } from '@/api/animeschedule';
import { mergeStreamingSources } from '@/api/streaming';
import type { StreamingOption } from '@/api/streaming';

/**
 * AnimeSchedule is the airing authority (times, delays, streaming links), but
 * it is supplementary: nothing here may throw, and nothing may be keyed off a
 * title string (§4.6).
 */

describe('schedule datetime parsing', () => {
  it('maps the null sentinel to null rather than the year 1', () => {
    expect(parseScheduleDate(NULL_DATETIME)).toBeNull();
    expect(parseScheduleDate('0001-01-01T00:00:00Z')).toBeNull();
  });

  it('handles missing and malformed values', () => {
    expect(parseScheduleDate(null)).toBeNull();
    expect(parseScheduleDate(undefined)).toBeNull();
    expect(parseScheduleDate('')).toBeNull();
    expect(parseScheduleDate('not a date')).toBeNull();
  });

  it('parses a real ISO 8601 UTC timestamp', () => {
    expect(parseScheduleDate('2023-10-02T14:00:00Z')).toBe(Date.parse('2023-10-02T14:00:00Z'));
  });
});

describe('delay copy', () => {
  it('says nothing when the show is airing normally', () => {
    expect(describeDelay(null)).toBeNull();
  });

  it('names the reason and the return date when it is still ahead', () => {
    const until = Date.now() + 7 * 86400000;
    expect(describeDelay({ reason: 'On Break', from: null, until })).toMatch(/^On Break until /);
  });

  it('drops a return date that has already passed', () => {
    const until = Date.now() - 86400000;
    expect(describeDelay({ reason: 'Delayed', from: null, until })).toBe('Delayed');
  });
});

describe('schedule links', () => {
  it('builds a link back to the source of corrections', () => {
    expect(
      scheduleUrl({
        id: 'Tav8',
        route: 'sousou-no-frieren',
        japaneseAt: null,
        subAt: null,
        dubAt: null,
        delay: null,
        episodesAired: null,
        totalEpisodes: null,
        status: null,
        streams: [],
      }),
    ).toBe('https://animeschedule.net/anime/sousou-no-frieren');
  });

  it('returns null with no route', () => {
    expect(scheduleUrl(null)).toBeNull();
  });
});

describe('merging streaming sources (F-22)', () => {
  const anilist: StreamingOption[] = [
    { id: 1, label: 'Crunchyroll', url: 'https://crunchyroll.com/x', colour: '#F47521', language: null, icon: null },
  ];

  it('adds platforms AniList did not know about', () => {
    const merged = mergeStreamingSources(
      anilist,
      [
        { platform: 'netflix', name: 'Netflix', url: 'https://netflix.com/title/1' },
        { platform: 'amazon', name: 'Amazon', url: 'https://amzn.to/x' },
      ],
      'ZA',
    );
    expect(merged.map((option) => option.label)).toEqual(
      expect.arrayContaining(['Crunchyroll', 'Netflix', 'Prime Video']),
    );
  });

  it('never duplicates a service both sources report', () => {
    const merged = mergeStreamingSources(
      anilist,
      [{ platform: 'crunchyroll', name: 'Crunchyroll', url: 'https://crunchyroll.com/y' }],
      'ZA',
    );
    expect(merged.filter((option) => option.label === 'Crunchyroll')).toHaveLength(1);
  });

  it('drops anything that is not an official licensor', () => {
    const merged = mergeStreamingSources(
      anilist,
      [{ platform: 'somepiratesite', name: 'Free Anime HD', url: 'https://pirate.test/x' }],
      'ZA',
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.label).toBe('Crunchyroll');
  });

  it('reads sub and dub out of the display name', () => {
    const merged = mergeStreamingSources(
      [],
      [{ platform: 'youtube', name: 'YouTube (Dub)', url: 'https://youtube.com/playlist?list=x' }],
      'ZA',
    );
    expect(merged[0]?.language).toBe('Dub');
  });

  it('survives an empty schedule response', () => {
    expect(mergeStreamingSources(anilist, [], 'ZA')).toHaveLength(1);
  });
});

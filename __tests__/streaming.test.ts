import { infoLinks, streamingOptions } from '@/api/streaming';
import type { AniListExternalLink } from '@/api/anilist/types';

function link(overrides: Partial<AniListExternalLink>): AniListExternalLink {
  return {
    id: 1,
    url: 'https://example.test',
    site: 'Crunchyroll',
    type: 'STREAMING',
    language: 'English',
    icon: null,
    color: null,
    ...overrides,
  };
}

describe('streaming availability (F-22)', () => {
  it('keeps official licensors only', () => {
    const options = streamingOptions(
      [
        link({ id: 1, site: 'Crunchyroll' }),
        link({ id: 2, site: 'SomePirateSite' }),
        link({ id: 3, site: 'Netflix' }),
      ],
      'ZA',
    );
    expect(options.map((option) => option.label)).toEqual(['Crunchyroll', 'Netflix']);
  });

  it('drops non-streaming links', () => {
    expect(streamingOptions([link({ type: 'INFO' })], 'ZA')).toEqual([]);
  });

  it('deduplicates a service listed twice', () => {
    const options = streamingOptions(
      [link({ id: 1, site: 'Crunchyroll' }), link({ id: 2, site: 'crunchyroll' })],
      'ZA',
    );
    expect(options).toHaveLength(1);
  });

  it('orders by what is most likely licensed in the region', () => {
    const options = streamingOptions(
      [link({ id: 1, site: 'Netflix' }), link({ id: 2, site: 'Crunchyroll' })],
      'ZA',
    );
    expect(options[0]?.label).toBe('Crunchyroll');
  });

  it('handles a title with no links at all', () => {
    expect(streamingOptions(null, 'ZA')).toEqual([]);
    expect(infoLinks(undefined)).toEqual([]);
  });
});

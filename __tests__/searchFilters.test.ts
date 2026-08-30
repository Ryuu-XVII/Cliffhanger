import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  SORTS,
  countActiveFilters,
  cycleTriState,
  deleteSavedSearch,
  describeFilters,
  flipSortDirection,
  isDescending,
  listSavedSearches,
  loadDraft,
  removeFilter,
  saveDraft,
  saveSearch,
  sortMatches,
  toSearchOptions,
  triStateOf,
  type SearchFilters,
} from '@/features/search/filters';

/**
 * The filter set is one object that has to survive three trips: into the API
 * variables, into a summary the user can edit, and through storage. A field
 * that gets dropped on any of those trips fails silently - the search just
 * quietly returns the wrong thing - so each trip is pinned down here.
 */

function filtersWith(overrides: Partial<SearchFilters>): SearchFilters {
  return { ...EMPTY_FILTERS, ...overrides };
}

describe('tri-state selection', () => {
  it('cycles neutral -> included -> excluded -> neutral', () => {
    let included: string[] = [];
    let excluded: string[] = [];

    expect(triStateOf('Action', included, excluded)).toBe('neutral');

    ({ included, excluded } = cycleTriState('Action', included, excluded));
    expect(triStateOf('Action', included, excluded)).toBe('included');
    expect(included).toEqual(['Action']);

    ({ included, excluded } = cycleTriState('Action', included, excluded));
    expect(triStateOf('Action', included, excluded)).toBe('excluded');
    // Must not linger in both lists, which would ask AniList for and against it.
    expect(included).toEqual([]);
    expect(excluded).toEqual(['Action']);

    ({ included, excluded } = cycleTriState('Action', included, excluded));
    expect(triStateOf('Action', included, excluded)).toBe('neutral');
    expect(excluded).toEqual([]);
  });
});

describe('sort direction', () => {
  it('flips the AniList enum in both directions', () => {
    expect(flipSortDirection(['SCORE_DESC'])).toEqual(['SCORE']);
    expect(flipSortDirection(['SCORE'])).toEqual(['SCORE_DESC']);
    expect(isDescending(['SCORE_DESC'])).toBe(true);
    expect(isDescending(['SCORE'])).toBe(false);
  });

  it('matches a sort option regardless of current direction', () => {
    const score = SORTS.find((option) => option.label === 'Score')!;
    expect(sortMatches(['SCORE_DESC'], score)).toBe(true);
    expect(sortMatches(['SCORE'], score)).toBe(true);
    expect(sortMatches(['POPULARITY_DESC'], score)).toBe(false);
  });
});

describe('toSearchOptions', () => {
  it('carries every filter through to the API shape', () => {
    const options = toSearchOptions(
      filtersWith({
        type: 'ANIME',
        formats: ['TV', 'ONA'],
        statuses: ['FINISHED'],
        genres: ['Action'],
        excludedGenres: ['Ecchi'],
        tags: ['Isekai'],
        excludedTags: ['Harem'],
        minimumTagRank: 75,
        sources: ['LIGHT_NOVEL'],
        countryOfOrigin: 'JP',
        season: 'SUMMER',
        minScore: 80,
        minEpisodes: 1,
        maxEpisodes: 12,
        maxDuration: 25,
        sort: ['SCORE_DESC'],
      }),
    );

    expect(options).toMatchObject({
      type: 'ANIME',
      format: ['TV', 'ONA'],
      status: ['FINISHED'],
      genre: ['Action'],
      excludeGenre: ['Ecchi'],
      tag: ['Isekai'],
      excludeTag: ['Harem'],
      minimumTagRank: 75,
      source: ['LIGHT_NOVEL'],
      countryOfOrigin: 'JP',
      season: 'SUMMER',
      minScore: 80,
      minEpisodes: 1,
      maxEpisodes: 12,
      maxDuration: 25,
      sort: ['SCORE_DESC'],
    });
  });

  it('sends a single year as seasonYear so it can pair with a season', () => {
    const options = toSearchOptions(filtersWith({ yearFrom: 2016, yearTo: 2016, season: 'FALL' }));
    expect(options.seasonYear).toBe(2016);
    expect(options.yearFrom).toBeUndefined();
    expect(options.yearTo).toBeUndefined();
  });

  it('sends a real range as bounds, which seasonYear cannot express', () => {
    const options = toSearchOptions(filtersWith({ yearFrom: 2010, yearTo: 2019 }));
    expect(options.seasonYear).toBeUndefined();
    expect(options.yearFrom).toBe(2010);
    expect(options.yearTo).toBe(2019);
  });

  it('supports an open-ended range', () => {
    expect(toSearchOptions(filtersWith({ yearFrom: 2020 }))).toMatchObject({ yearFrom: 2020 });
    expect(toSearchOptions(filtersWith({ yearTo: 1999 }))).toMatchObject({ yearTo: 1999 });
  });

  it('keeps the unit count as one filter for both types', () => {
    // The API splits episodes_* from chapters_*; the split happens in the API
    // layer by type, so the filter object stays one shared idea.
    const anime = toSearchOptions(filtersWith({ type: 'ANIME', minEpisodes: 1, maxEpisodes: 12 }));
    const manga = toSearchOptions(filtersWith({ type: 'MANGA', minEpisodes: 1, maxEpisodes: 50 }));
    expect(anime).toMatchObject({ type: 'ANIME', minEpisodes: 1, maxEpisodes: 12 });
    expect(manga).toMatchObject({ type: 'MANGA', minEpisodes: 1, maxEpisodes: 50 });
  });
});

describe('unit-count pill wording', () => {
  it('says episodes for anime and chapters for manga', () => {
    const anime = describeFilters(filtersWith({ type: 'ANIME', minEpisodes: 1, maxEpisodes: 12 }));
    const manga = describeFilters(filtersWith({ type: 'MANGA', minEpisodes: 1, maxEpisodes: 50 }));
    expect(anime.find((pill) => pill.id === 'episodes')?.label).toBe('1-12 eps');
    expect(manga.find((pill) => pill.id === 'episodes')?.label).toBe('1-50 ch');
  });
});

describe('countActiveFilters', () => {
  it('is zero for an untouched filter set', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts exclusions and multi-selects individually', () => {
    const count = countActiveFilters(
      filtersWith({ genres: ['Action', 'Drama'], excludedGenres: ['Ecchi'], formats: ['TV'] }),
    );
    expect(count).toBe(4);
  });

  it('collapses to one while a studio is selected, since nothing else applies', () => {
    const count = countActiveFilters(
      filtersWith({ studio: { id: 1, name: 'MAPPA' }, genres: ['Action'], minScore: 80 }),
    );
    expect(count).toBe(1);
  });

  it('does not count the default sort, but does count a changed one', () => {
    expect(countActiveFilters(filtersWith({ sort: DEFAULT_SORT }))).toBe(0);
    expect(countActiveFilters(filtersWith({ sort: ['SCORE_DESC'] }))).toBe(1);
  });
});

describe('describeFilters and removeFilter', () => {
  it('produces a removable pill for every active filter', () => {
    const filters = filtersWith({
      genres: ['Action'],
      excludedGenres: ['Ecchi'],
      minScore: 80,
      yearFrom: 2010,
      yearTo: 2019,
      libraryScope: 'not-in-library',
    });
    const pills = describeFilters(filters);

    expect(pills.map((pill) => pill.label)).toEqual(
      expect.arrayContaining(['Action', 'Ecchi', '80+ score', '2010-2019', 'Not in my library']),
    );
    expect(pills.find((pill) => pill.label === 'Ecchi')?.negated).toBe(true);
  });

  it('round-trips: removing every pill returns to an empty set', () => {
    let filters = filtersWith({
      formats: ['TV'],
      statuses: ['FINISHED'],
      genres: ['Action'],
      excludedGenres: ['Ecchi'],
      tags: ['Isekai'],
      excludedTags: ['Harem'],
      sources: ['MANGA'],
      countryOfOrigin: 'JP',
      season: 'FALL',
      yearFrom: 2010,
      yearTo: 2019,
      minScore: 80,
      minEpisodes: 1,
      maxEpisodes: 12,
      maxDuration: 25,
      minimumTagRank: 50,
      libraryScope: 'in-library',
      sort: ['SCORE_DESC'],
    });

    for (const pill of describeFilters(filters)) {
      filters = removeFilter(filters, pill.id);
    }

    expect(countActiveFilters(filters)).toBe(0);
    expect(describeFilters(filters)).toHaveLength(0);
  });

  it('removes only the targeted value out of a multi-select', () => {
    const filters = filtersWith({ genres: ['Action', 'Drama', 'Comedy'] });
    expect(removeFilter(filters, 'genre:Drama').genres).toEqual(['Action', 'Comedy']);
  });

  it('does not confuse a genre with an identically named excluded genre', () => {
    const filters = filtersWith({ genres: ['Action'], excludedGenres: ['Action'] });
    const afterInclude = removeFilter(filters, 'genre:Action');
    expect(afterInclude.genres).toEqual([]);
    expect(afterInclude.excludedGenres).toEqual(['Action']);
  });

  it('handles values containing a colon without truncating them', () => {
    const filters = filtersWith({ tags: ['Re:Zero style'] });
    const [pill] = describeFilters(filters);
    expect(removeFilter(filters, pill!.id).tags).toEqual([]);
  });
});

describe('persistence', () => {
  it('restores a saved draft', () => {
    const filters = filtersWith({ genres: ['Action'], minScore: 70 });
    saveDraft('bebop', filters);

    const restored = loadDraft();
    expect(restored?.query).toBe('bebop');
    expect(restored?.filters.genres).toEqual(['Action']);
    expect(restored?.filters.minScore).toBe(70);
  });

  it('fills in fields a draft from an older build did not have', () => {
    saveDraft('x', { genres: ['Action'] } as unknown as SearchFilters);
    const restored = loadDraft();
    // Missing keys must come back as the empty defaults, not undefined.
    expect(restored?.filters.excludedGenres).toEqual([]);
    expect(restored?.filters.libraryScope).toBe('all');
    expect(restored?.filters.sort).toEqual(DEFAULT_SORT);
  });

  it('saves, lists and deletes named searches', () => {
    for (const entry of listSavedSearches()) deleteSavedSearch(entry.id);

    const filters = filtersWith({ genres: ['Mecha'] });
    saveSearch('Mecha only', 'gundam', filters);
    const listed = listSavedSearches();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('Mecha only');
    expect(listed[0]?.query).toBe('gundam');
    expect(listed[0]?.filters.genres).toEqual(['Mecha']);

    expect(deleteSavedSearch(listed[0]!.id)).toHaveLength(0);
  });
});

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDebounced, useGenres, useMediaTags, useSearchPreview, useStudioSearch } from '@/api/hooks';
import { readJson, writeJson } from '@/api/kv';
import { resolveTitle } from '@/data/titles';
import {
  ANIME_FORMATS,
  CHAPTER_PRESETS,
  COUNTRIES,
  DURATION_PRESETS,
  EMPTY_FILTERS,
  EPISODE_PRESETS,
  MANGA_FORMATS,
  SCORE_PRESETS,
  SEASONS,
  SORTS,
  SOURCES,
  STATUSES,
  TAG_RANK_PRESETS,
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
  triStateOf,
  type LibraryScope,
  type SavedSearch,
  type SearchFilters,
} from '@/features/search/filters';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Chip, TriChip } from '@/ui/Chip';
import { Cover } from '@/ui/Cover';
import { Divider } from '@/ui/Surfaces';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-01. This screen builds a query plus a filter set; results render on
 * /search-results once the user commits. The filter set lives in one
 * serialisable object (see features/search/filters) so it survives leaving the
 * screen, can be saved by name, and reaches the results screen whole.
 */

const RECENT_KEY = 'search:recent';
const MAX_RECENT = 8;

// AniList's GenreCollection, kept as a fallback so the picker works while the
// live collection loads. Remote additions merge in automatically.
const KNOWN_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Hentai',
  'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

const LIBRARY_SCOPES: { value: LibraryScope; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'not-in-library', label: 'Not in my library' },
  { value: 'in-library', label: 'In my library' },
];

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const titleLanguage = useSettingsStore((state) => state.settings.titleLanguage);
  const showAdult = useSettingsStore((state) => state.settings.showAdult);

  const restored = useRef(loadDraft()).current;
  const [query, setQuery] = useState(restored?.query ?? '');
  const [filters, setFilters] = useState<SearchFilters>(restored?.filters ?? EMPTY_FILTERS);
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY) ?? []);
  const [saved, setSaved] = useState<SavedSearch[]>(() => listSavedSearches());

  const [genreQuery, setGenreQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [studioQuery, setStudioQuery] = useState('');
  const [openTagCategory, setOpenTagCategory] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const debounced = useDebounced(query, 300);
  const debouncedStudioQuery = useDebounced(studioQuery, 300);
  const genreCollection = useGenres();
  const tagCollection = useMediaTags();
  const studioResults = useStudioSearch(debouncedStudioQuery);
  const preview = useSearchPreview(filters.studio ? '' : debounced, filters.type);

  const patch = useCallback((next: Partial<SearchFilters>) => {
    setFilters((previous) => ({ ...previous, ...next }));
  }, []);

  // Persist on every change so backing out of the screen never loses the set.
  useEffect(() => {
    saveDraft(query, filters);
  }, [query, filters]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, []);

  const allGenres = useMemo(() => {
    const merged = Array.from(new Set([...KNOWN_GENRES, ...(genreCollection.data ?? [])]));
    return showAdult ? merged : merged.filter((item) => item !== 'Hentai');
  }, [genreCollection.data, showAdult]);

  const visibleGenres = useMemo(
    () => allGenres.filter((item) => item.toLowerCase().includes(genreQuery.trim().toLowerCase())),
    [allGenres, genreQuery],
  );

  /**
   * AniList ships ~400 tags already grouped into two dozen categories, and the
   * old flat list showed nothing at all until you typed - so the vast majority
   * were undiscoverable. Grouping makes them browsable; the search box still
   * flattens across every category when there is a query.
   */
  const tagCategories = useMemo(() => {
    const needle = tagQuery.trim().toLowerCase();
    const grouped = new Map<string, string[]>();
    for (const tag of tagCollection.data ?? []) {
      if (needle && !tag.name.toLowerCase().includes(needle)) continue;
      const category = tag.category ?? 'Other';
      const list = grouped.get(category) ?? [];
      list.push(tag.name);
      grouped.set(category, list);
    }
    return Array.from(grouped.entries())
      .map(([category, names]) => ({ category, names: names.sort() }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [tagCollection.data, tagQuery]);

  const pills = useMemo(() => describeFilters(filters), [filters]);
  const filterCount = countActiveFilters(filters);
  const formatOptions = filters.type === 'MANGA' ? MANGA_FORMATS : ANIME_FORMATS;

  const canSearch = Boolean(filters.studio) || debounced.trim().length > 0 || filterCount > 0;
  const showPreview = !filters.studio && debounced.trim().length >= 2;
  const showIdle = !showPreview && debounced.trim().length === 0 && filterCount === 0;

  const remember = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecent((previous) => {
      const next = [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, MAX_RECENT);
      writeJson(RECENT_KEY, next);
      return next;
    });
  }, []);

  const runSearch = (overrideQuery?: string, overrideFilters?: SearchFilters) => {
    const finalQuery = overrideQuery ?? query;
    const finalFilters = overrideFilters ?? filters;
    remember(finalQuery);
    router.push({
      pathname: '/search-results',
      params: { q: finalQuery.trim(), filters: JSON.stringify(finalFilters) },
    });
  };

  /*
   * A sheet rather than Alert.prompt, which does not exist on Android and would
   * have left the primary platform unable to name anything it saves.
   */
  const openSaveSheet = () => {
    setSaveName(query.trim() || pills.slice(0, 2).map((pill) => pill.label).join(' + ') || 'Filter set');
    setSaveOpen(true);
  };

  const commitSave = () => {
    const name = saveName.trim();
    if (!name) return;
    setSaved(saveSearch(name, query, filters));
    setSaveOpen(false);
    toast.show(`Saved as "${name}"`, 'success');
  };

  return (
    <Screen>
      {/* Query row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.gutter,
          paddingBottom: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Exit search"
          style={{ marginRight: spacing.md, padding: spacing.xs }}
        >
          <Ionicons name="close" size={24} color={colors.onSurfaceVariant} />
        </Pressable>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            paddingHorizontal: spacing.md,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: hairline,
            backgroundColor: colors.surfaceContainerLow,
            opacity: filters.studio ? 0.5 : 1,
          }}
        >
          <Ionicons name="search" size={18} color={colors.onSurfaceVariant} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch()}
            editable={!filters.studio}
            placeholder={filters.studio ? 'Clear the studio to search by title' : 'Search titles...'}
            placeholderTextColor={colors.outline}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search titles"
            style={{
              flex: 1,
              marginLeft: spacing.sm,
              color: colors.onSurface,
              fontFamily: 'HankenGrotesk_400Regular',
              fontSize: 16,
            }}
          />
          {query.length > 0 && !filters.studio ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
            >
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Type + save */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.gutter,
          marginBottom: spacing.sm,
        }}
      >
        {/* Formats and the count buckets differ per type, so both reset on switch. */}
        <Chip
          label="Anime"
          compact
          selected={filters.type === 'ANIME'}
          onPress={() =>
            patch({ type: 'ANIME', formats: [], minEpisodes: null, maxEpisodes: null })
          }
        />
        <Chip
          label="Manga"
          compact
          selected={filters.type === 'MANGA'}
          onPress={() =>
            patch({
              type: 'MANGA',
              formats: [],
              minEpisodes: null,
              maxEpisodes: null,
              maxDuration: null,
              season: null,
            })
          }
        />
        <View style={{ flex: 1 }} />
        {canSearch ? (
          <Pressable
            onPress={openSaveSheet}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save this search"
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Ionicons name="bookmark-outline" size={15} color={colors.primary} />
            <Text variant="labelSm" colour={colors.primary} uppercase style={{ marginLeft: 4 }}>
              Save
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Active filters, individually removable */}
      {pills.length > 0 ? (
        <View style={{ marginBottom: spacing.sm }}>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
          >
            {pills.map((pill) => (
              <Pressable
                key={pill.id}
                onPress={() => setFilters(removeFilter(filters, pill.id))}
                accessibilityRole="button"
                accessibilityLabel={`Remove filter ${pill.label}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: spacing.xs,
                  paddingLeft: spacing.sm + 2,
                  paddingRight: spacing.sm,
                  borderRadius: radii.full,
                  backgroundColor: pill.negated ? colors.errorContainer : colors.primaryContainer,
                }}
              >
                <Text
                  variant="labelSm"
                  colour={pill.negated ? colors.onErrorContainer : colors.onPrimaryContainer}
                  style={pill.negated ? { textDecorationLine: 'line-through' } : undefined}
                >
                  {pill.label}
                </Text>
                <Ionicons
                  name="close"
                  size={13}
                  color={pill.negated ? colors.onErrorContainer : colors.onPrimaryContainer}
                  style={{ marginLeft: 4 }}
                />
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setFilters({ ...EMPTY_FILTERS, type: filters.type });
                setGenreQuery('');
                setTagQuery('');
                setStudioQuery('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              style={{ justifyContent: 'center', paddingHorizontal: spacing.sm }}
            >
              <Text variant="labelSm" colour={colors.primary} uppercase>
                Clear all
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showPreview ? (
          <View style={{ marginBottom: spacing.md }}>
            <SectionLabel>Top matches</SectionLabel>
            {preview.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : (preview.data?.items.length ?? 0) === 0 ? (
              <Text variant="bodyMd" colour="onSurfaceVariant" style={{ paddingHorizontal: spacing.gutter }}>
                No quick matches - press Search for the full result set.
              </Text>
            ) : (
              (preview.data?.items ?? []).slice(0, 5).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    remember(query);
                    router.push({ pathname: '/title/[id]', params: { id: String(item.id) } });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={resolveTitle(item.title, titleLanguage)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: spacing.gutter,
                    paddingVertical: spacing.sm,
                    gap: spacing.md,
                  }}
                >
                  <Cover uri={item.coverImage?.large ?? null} width={40} height={56} radius={radii.sm} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLg" numberOfLines={1}>
                      {resolveTitle(item.title, titleLanguage)}
                    </Text>
                    <Text variant="labelSm" colour="onSurfaceVariant">
                      {[item.format, item.seasonYear].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
                </Pressable>
              ))
            )}
            <Divider style={{ marginHorizontal: spacing.gutter, marginTop: spacing.sm }} />
          </View>
        ) : null}

        {/* Studio */}
        <SectionLabel>Studio</SectionLabel>
        {filters.studio ? (
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <Chip label={filters.studio.name} selected onPress={() => patch({ studio: null })} />
            <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: spacing.sm }}>
              Browsing this studio&apos;s catalogue. AniList only lets a studio list be sorted, not
              filtered, so the filters below are paused.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
              <SearchField
                icon="business-outline"
                value={studioQuery}
                onChangeText={setStudioQuery}
                placeholder="Search studios (e.g. MAPPA)"
                accessibilityLabel="Search studios"
              />
            </View>
            {studioQuery.trim().length >= 2 ? (
              studioResults.isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
              ) : (studioResults.data?.length ?? 0) > 0 ? (
                <ChipRow>
                  {(studioResults.data ?? []).map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      compact
                      onPress={() => {
                        setFilters({
                          ...EMPTY_FILTERS,
                          type: filters.type,
                          studio: item,
                          sort: ['POPULARITY_DESC'],
                        });
                        setQuery('');
                        setStudioQuery('');
                      }}
                    />
                  ))}
                </ChipRow>
              ) : (
                <Hint>No studios match &ldquo;{studioQuery.trim()}&rdquo;</Hint>
              )
            ) : null}
          </>
        )}

        <Divider style={{ marginHorizontal: spacing.gutter, marginTop: spacing.sm }} />

        {/* Everything below is inert while a studio is selected. */}
        <View style={{ opacity: filters.studio ? 0.4 : 1 }} pointerEvents={filters.studio ? 'none' : 'auto'}>
          <SectionLabel hint="Pick any number">Format</SectionLabel>
          <ChipRow>
            {formatOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.formats.includes(option.value)}
                onPress={() => patch({ formats: toggleInList(filters.formats, option.value) })}
              />
            ))}
          </ChipRow>

          <SectionLabel hint="Pick any number">Status</SectionLabel>
          <ChipRow>
            {STATUSES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.statuses.includes(option.value)}
                onPress={() => patch({ statuses: toggleInList(filters.statuses, option.value) })}
              />
            ))}
          </ChipRow>

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel hint="Tap once to include, twice to exclude">Genres</SectionLabel>
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <SearchField
              icon="search-outline"
              value={genreQuery}
              onChangeText={setGenreQuery}
              placeholder="Filter genres"
              accessibilityLabel="Filter the genre list"
            />
          </View>
          {visibleGenres.length > 0 ? (
            <Wrap>
              {visibleGenres.map((item) => (
                <TriChip
                  key={item}
                  label={item}
                  state={triStateOf(item, filters.genres, filters.excludedGenres)}
                  onPress={() => {
                    const next = cycleTriState(item, filters.genres, filters.excludedGenres);
                    patch({ genres: next.included, excludedGenres: next.excluded });
                  }}
                />
              ))}
            </Wrap>
          ) : (
            <Hint>No genres match &ldquo;{genreQuery.trim()}&rdquo;</Hint>
          )}

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel hint="Tap once to include, twice to exclude">Themes and tags</SectionLabel>
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <SearchField
              icon="color-wand-outline"
              value={tagQuery}
              onChangeText={setTagQuery}
              placeholder="Search themes (e.g. Isekai)"
              accessibilityLabel="Search themes and tags"
            />
          </View>

          {tagCollection.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
          ) : tagCategories.length === 0 ? (
            <Hint>No themes match &ldquo;{tagQuery.trim()}&rdquo;</Hint>
          ) : (
            tagCategories.map(({ category, names }) => {
              // A live query flattens the browse view: every match shows at once.
              const expanded = tagQuery.trim().length > 0 || openTagCategory === category;
              const chosen = names.filter(
                (name) => filters.tags.includes(name) || filters.excludedTags.includes(name),
              ).length;

              return (
                <View key={category} style={{ marginBottom: spacing.xs }}>
                  <Pressable
                    onPress={() => setOpenTagCategory(expanded && !tagQuery ? null : category)}
                    accessibilityRole="button"
                    accessibilityLabel={`${category}${expanded ? ', collapse' : ', expand'}`}
                    accessibilityState={{ expanded }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: spacing.gutter,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <Text variant="bodyMd" style={{ flex: 1 }}>
                      {category}
                    </Text>
                    {chosen > 0 ? (
                      <Text variant="labelSm" colour={colors.primary} style={{ marginRight: spacing.sm }}>
                        {String(chosen)}
                      </Text>
                    ) : null}
                    <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginRight: spacing.sm }}>
                      {String(names.length)}
                    </Text>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={15}
                      color={colors.onSurfaceVariant}
                    />
                  </Pressable>

                  {expanded ? (
                    <Wrap>
                      {names.map((name) => (
                        <TriChip
                          key={name}
                          label={name}
                          state={triStateOf(name, filters.tags, filters.excludedTags)}
                          onPress={() => {
                            const next = cycleTriState(name, filters.tags, filters.excludedTags);
                            patch({ tags: next.included, excludedTags: next.excluded });
                          }}
                        />
                      ))}
                    </Wrap>
                  ) : null}
                </View>
              );
            })
          )}

          {filters.tags.length > 0 ? (
            <>
              <SectionLabel hint="How strongly a tag must apply">Tag relevance</SectionLabel>
              <ChipRow>
                <Chip
                  label="Any"
                  compact
                  selected={filters.minimumTagRank === null}
                  onPress={() => patch({ minimumTagRank: null })}
                />
                {TAG_RANK_PRESETS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    compact
                    selected={filters.minimumTagRank === option.value}
                    onPress={() => patch({ minimumTagRank: option.value })}
                  />
                ))}
              </ChipRow>
            </>
          ) : null}

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>Source material</SectionLabel>
          <Wrap>
            {SOURCES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.sources.includes(option.value)}
                onPress={() => patch({ sources: toggleInList(filters.sources, option.value) })}
              />
            ))}
          </Wrap>

          <SectionLabel>Country of origin</SectionLabel>
          <ChipRow>
            <Chip
              label="Any"
              compact
              selected={filters.countryOfOrigin === null}
              onPress={() => patch({ countryOfOrigin: null })}
            />
            {COUNTRIES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.countryOfOrigin === option.value}
                onPress={() =>
                  patch({
                    countryOfOrigin: filters.countryOfOrigin === option.value ? null : option.value,
                  })
                }
              />
            ))}
          </ChipRow>

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>Season</SectionLabel>
          <ChipRow>
            {SEASONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.season === option.value}
                onPress={() => patch({ season: filters.season === option.value ? null : option.value })}
              />
            ))}
          </ChipRow>

          <SectionLabel hint="Leave one side blank for an open-ended range">Year</SectionLabel>
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <YearField
                label="From"
                value={filters.yearFrom}
                onChange={(value) => patch({ yearFrom: value })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <YearField label="To" value={filters.yearTo} onChange={(value) => patch({ yearTo: value })} />
            </View>
          </View>

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>Minimum score</SectionLabel>
          <ChipRow>
            <Chip
              label="Any"
              compact
              selected={filters.minScore === null}
              onPress={() => patch({ minScore: null })}
            />
            {SCORE_PRESETS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.minScore === option.value}
                onPress={() => patch({ minScore: filters.minScore === option.value ? null : option.value })}
              />
            ))}
          </ChipRow>

          <SectionLabel>{filters.type === 'MANGA' ? 'Chapter count' : 'Episode count'}</SectionLabel>
          <ChipRow>
            <Chip
              label="Any"
              compact
              selected={filters.minEpisodes === null && filters.maxEpisodes === null}
              onPress={() => patch({ minEpisodes: null, maxEpisodes: null })}
            />
            {(filters.type === 'MANGA' ? CHAPTER_PRESETS : EPISODE_PRESETS).map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                compact
                selected={filters.minEpisodes === option.min && filters.maxEpisodes === option.max}
                onPress={() =>
                  patch(
                    filters.minEpisodes === option.min && filters.maxEpisodes === option.max
                      ? { minEpisodes: null, maxEpisodes: null }
                      : { minEpisodes: option.min, maxEpisodes: option.max },
                  )
                }
              />
            ))}
          </ChipRow>

          {filters.type === 'ANIME' ? (
            <>
              <SectionLabel>Episode length</SectionLabel>
              <ChipRow>
                <Chip
                  label="Any"
                  compact
                  selected={filters.maxDuration === null}
                  onPress={() => patch({ maxDuration: null })}
                />
                {DURATION_PRESETS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    compact
                    selected={filters.maxDuration === option.value}
                    onPress={() =>
                      patch({ maxDuration: filters.maxDuration === option.value ? null : option.value })
                    }
                  />
                ))}
              </ChipRow>
            </>
          ) : null}

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>My library</SectionLabel>
          <ChipRow>
            {LIBRARY_SCOPES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={filters.libraryScope === option.value}
                onPress={() => patch({ libraryScope: option.value })}
              />
            ))}
          </ChipRow>
        </View>

        <Divider style={{ marginHorizontal: spacing.gutter }} />

        <SectionLabel>Sort by</SectionLabel>
        <ChipRow>
          {SORTS.filter((option) => !(option.requiresQuery && filters.studio)).map((option) => {
            const active = sortMatches(filters.sort, option);
            return (
              <Chip
                key={option.label}
                label={
                  active && option.directional
                    ? `${option.label}${isDescending(filters.sort) ? ' ↓' : ' ↑'}`
                    : option.label
                }
                compact
                selected={active}
                accessibilityLabel={
                  active && option.directional
                    ? `${option.label}, ${isDescending(filters.sort) ? 'descending' : 'ascending'}. Tap to reverse.`
                    : option.label
                }
                onPress={() =>
                  // Tapping the active directional sort reverses it, which is
                  // how the library screen already behaves.
                  patch({
                    sort:
                      active && option.directional
                        ? flipSortDirection(filters.sort)
                        : [...option.value],
                  })
                }
              />
            );
          })}
        </ChipRow>

        {/* Saved searches and recents */}
        {saved.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <SectionLabel hint="Tap to run it, or the cross to remove it">Saved searches</SectionLabel>
            <Wrap>
              {saved.map((entry) => (
                <View
                  key={entry.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: radii.full,
                    borderWidth: 1,
                    borderColor: hairline,
                    backgroundColor: colors.surfaceContainerLow,
                    paddingLeft: spacing.md,
                    paddingRight: spacing.xs,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      setQuery(entry.query);
                      setFilters(entry.filters);
                      runSearch(entry.query, entry.filters);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Run saved search ${entry.name}`}
                    style={{ paddingVertical: spacing.sm }}
                  >
                    <Text variant="labelLg">{entry.name}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setSaved(deleteSavedSearch(entry.id));
                      toast.show(`Removed "${entry.name}"`);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove saved search ${entry.name}`}
                    style={{ padding: spacing.sm }}
                  >
                    <Ionicons name="close" size={14} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ))}
            </Wrap>
          </View>
        ) : null}

        {showIdle ? (
          <View style={{ marginTop: spacing.lg }}>
            {recent.length > 0 ? (
              <View style={{ paddingHorizontal: spacing.gutter }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ flex: 1 }}>
                    Recent
                  </Text>
                  <Pressable
                    onPress={() => {
                      setRecent([]);
                      writeJson(RECENT_KEY, []);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent searches"
                  >
                    <Text variant="labelSm" colour={colors.primary} uppercase>
                      Clear
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {recent.map((term) => (
                    <Chip
                      key={term}
                      label={term}
                      onPress={() => {
                        setQuery(term);
                        runSearch(term);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <EmptyState
                icon="search-outline"
                title="Find something to watch"
                message="Search by title, or build a filter set - genres and tags can be included or excluded."
                compact
              />
            )}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          borderTopWidth: 1,
          borderTopColor: hairline,
          backgroundColor: colors.background,
        }}
      >
        {!canSearch ? (
          <Text
            variant="labelSm"
            colour="onSurfaceVariant"
            style={{ textAlign: 'center', marginBottom: spacing.sm }}
          >
            Type a title or pick a filter to search
          </Text>
        ) : null}
        <Button
          label={
            filterCount > 0
              ? `Search · ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`
              : 'Search'
          }
          onPress={() => runSearch()}
          disabled={!canSearch}
          fullWidth
          icon={<Ionicons name="search" size={16} color={colors.onPrimary} />}
        />
      </View>

      <Sheet visible={saveOpen} onClose={() => setSaveOpen(false)} title="Save this search">
        <Text variant="bodyMd" colour="onSurfaceVariant" style={{ marginBottom: spacing.md }}>
          It keeps the query and every filter, ready to run again.
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            paddingHorizontal: spacing.md,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: hairline,
            backgroundColor: colors.surfaceContainerLow,
            marginBottom: spacing.lg,
          }}
        >
          <TextInput
            value={saveName}
            onChangeText={setSaveName}
            onSubmitEditing={commitSave}
            placeholder="Name this search"
            placeholderTextColor={colors.outline}
            returnKeyType="done"
            autoFocus
            maxLength={40}
            accessibilityLabel="Name for this saved search"
            style={{
              flex: 1,
              paddingVertical: 0,
              color: colors.onSurface,
              fontFamily: 'HankenGrotesk_400Regular',
              fontSize: 16,
            }}
          />
        </View>
        <Button label="Save" onPress={commitSave} disabled={!saveName.trim()} fullWidth />
      </Sheet>
    </Screen>
  );
}

/* -------------------------------- helpers -------------------------------- */

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ marginHorizontal: spacing.gutter, marginTop: spacing.md, marginBottom: spacing.sm }}>
      <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
        {children}
      </Text>
      {hint ? (
        <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 1, opacity: 0.75 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
    >
      {children}
    </ScrollView>
  );
}

/** Wrapping grid - the right shape when a set is browsed rather than skimmed. */
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        paddingHorizontal: spacing.gutter,
      }}
    >
      {children}
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="labelSm" colour="onSurfaceVariant" style={{ paddingHorizontal: spacing.gutter }}>
      {children}
    </Text>
  );
}

function YearField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(value ? String(value) : '');

  // Keep in step when the value is cleared from the summary pills.
  useEffect(() => {
    setText(value ? String(value) : '');
  }, [value]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 48,
        paddingHorizontal: spacing.md,
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: hairline,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginRight: spacing.sm }}>
        {label}
      </Text>
      <TextInput
        value={text}
        onChangeText={(next) => {
          const digits = next.replace(/\D/g, '').slice(0, 4);
          setText(digits);
          // Only commit a plausible year, so typing "2" does not filter to year 2.
          onChange(/^\d{4}$/.test(digits) && Number(digits) > 1900 ? Number(digits) : null);
        }}
        placeholder="Any"
        placeholderTextColor={colors.outline}
        keyboardType="number-pad"
        maxLength={4}
        accessibilityLabel={`${label} year`}
        style={{
          flex: 1,
          paddingVertical: 0,
          color: colors.onSurface,
          fontFamily: 'HankenGrotesk_400Regular',
          fontSize: 15,
        }}
      />
    </View>
  );
}

function SearchField({
  icon,
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 48,
        paddingHorizontal: spacing.md,
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: hairline,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Ionicons name={icon} size={17} color={colors.onSurfaceVariant} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
        style={{
          flex: 1,
          marginLeft: spacing.sm,
          paddingVertical: 0,
          color: colors.onSurface,
          fontFamily: 'HankenGrotesk_400Regular',
          fontSize: 15,
        }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={17} color={colors.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
}

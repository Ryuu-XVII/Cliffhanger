import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AniListSeason } from '@/api/anilist/types';
import { useDebounced, useGenres, useMediaTags, useSearchPreview, useStudioSearch } from '@/api/hooks';
import { readJson, writeJson } from '@/api/kv';
import { resolveTitle } from '@/data/titles';
import { useSettingsStore } from '@/stores/settingsStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Cover } from '@/ui/Cover';
import { Divider } from '@/ui/Surfaces';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-01. This screen collects the query and filters; results render on
 * /search-results once the user commits with Search. Debounced at 300ms so
 * recent-search suggestions - and the inline top-matches preview - can react
 * to typing without hammering storage or the network.
 */

const RECENT_KEY = 'search:recent';
const MAX_RECENT = 8;

const FORMATS = [
  { value: undefined, label: 'Any format' },
  { value: 'TV', label: 'TV' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
] as const;

const MANGA_FORMATS = [
  { value: undefined, label: 'Any format' },
  { value: 'MANGA', label: 'Manga' },
  { value: 'NOVEL', label: 'Novel' },
  { value: 'ONE_SHOT', label: 'One shot' },
] as const;

const STATUSES = [
  { value: undefined, label: 'Any status' },
  { value: 'RELEASING', label: 'Airing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
  { value: 'HIATUS', label: 'Hiatus' },
] as const;

const SEASONS: { value: AniListSeason; label: string }[] = [
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
];

const SORTS = [
  { value: ['SEARCH_MATCH', 'POPULARITY_DESC'], label: 'Best match' },
  { value: ['POPULARITY_DESC'], label: 'Most popular' },
  { value: ['SCORE_DESC'], label: 'Highest rated' },
  { value: ['START_DATE_DESC'], label: 'Newest' },
  { value: ['FAVOURITES_DESC'], label: 'Most loved' },
  { value: ['TITLE_ROMAJI'], label: 'Title A-Z' },
  { value: ['TITLE_ROMAJI_DESC'], label: 'Title Z-A' },
] as const;

/** Sorts that only make sense with typed text - hidden once a studio is picked. */
const STUDIO_SORTS = SORTS.filter((option) => option.value[0] !== 'SEARCH_MATCH');
const STUDIO_DEFAULT_SORT = ['POPULARITY_DESC'];

// AniList's current GenreCollection (verified against the live GraphQL API).
// Keep this fallback so the selector remains useful while the collection query
// is loading or unavailable; remote additions are merged below automatically.
const KNOWN_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Hentai',
  'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const titleLanguage = useSettingsStore((state) => state.settings.titleLanguage);
  const showAdult = useSettingsStore((state) => state.settings.showAdult);

  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<string | undefined>(undefined);
  const [type, setType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const [genres, setGenres] = useState<string[]>([]);
  const [genreQuery, setGenreQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [season, setSeason] = useState<AniListSeason | undefined>();
  const [yearText, setYearText] = useState('');
  const [sort, setSort] = useState<string[]>([...SORTS[0].value]);
  const [studio, setStudio] = useState<{ id: number; name: string } | null>(null);
  const [studioQuery, setStudioQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY) ?? []);

  const debounced = useDebounced(query, 300);
  const debouncedStudioQuery = useDebounced(studioQuery, 300);
  const genreCollection = useGenres();
  const tagCollection = useMediaTags();
  const studioResults = useStudioSearch(debouncedStudioQuery);
  const preview = useSearchPreview(studio ? '' : debounced, type);

  const allGenres = useMemo(() => {
    const merged = Array.from(new Set([...KNOWN_GENRES, ...(genreCollection.data ?? [])]));
    return showAdult ? merged : merged.filter((item) => item !== 'Hentai');
  }, [genreCollection.data, showAdult]);
  const visibleGenres = useMemo(
    () => allGenres.filter((item) => item.toLowerCase().includes(genreQuery.trim().toLowerCase())),
    [allGenres, genreQuery],
  );
  const visibleTags = useMemo(
    () => (tagCollection.data ?? []).filter((item) => item.name.toLowerCase().includes(tagQuery.trim().toLowerCase())).slice(0, 30),
    [tagCollection.data, tagQuery],
  );

  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
  // Studio browsing ignores every other filter (AniList only lets you sort a
  // studio's catalogue), so once one is picked the count reflects only that.
  const filterCount = studio
    ? 1
    : Number(Boolean(format)) +
      genres.length +
      tags.length +
      Number(Boolean(status)) +
      Number(Boolean(season)) +
      Number(Boolean(year)) +
      (sort[0] === 'SEARCH_MATCH' ? 0 : 1);

  const clearFilters = () => {
    setFormat(undefined);
    setGenres([]);
    setGenreQuery('');
    setTags([]);
    setTagQuery('');
    setStatus(undefined);
    setSeason(undefined);
    setYearText('');
    setSort([...SORTS[0].value]);
    setStudio(null);
    setStudioQuery('');
  };

  useEffect(() => {
    // Focus after the modal settles so the keyboard animation does not fight
    // the presentation transition.
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, []);

  const remember = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecent((previous) => {
      const next = [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, MAX_RECENT);
      writeJson(RECENT_KEY, next);
      return next;
    });
  }, []);

  const canSearch = Boolean(studio) || debounced.trim().length > 0 || filterCount > 0;
  const showPreview = !studio && debounced.trim().length >= 2;
  const showRecent = !showPreview && debounced.trim().length === 0 && filterCount === 0;

  const runSearch = (overrideQuery?: string) => {
    if (studio) {
      remember('Studio: ' + studio.name);
      router.push({
        pathname: '/search-results',
        params: { type, sort: sort.join(','), studioId: String(studio.id), studioName: studio.name },
      });
      return;
    }

    const finalQuery = overrideQuery ?? query;
    remember(finalQuery);
    router.push({
      pathname: '/search-results',
      params: {
        q: finalQuery.trim(),
        type,
        format: format ?? '',
        genre: genres.join(','),
        tag: tags.join(','),
        status: status ?? '',
        season: season ?? '',
        year: year ? String(year) : '',
        sort: sort.join(','),
      },
    });
  };

  const openPreviewItem = (id: number) => {
    remember(query);
    router.push({ pathname: '/title/[id]', params: { id: String(id) } });
  };

  return (
    <Screen>
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
            opacity: studio ? 0.5 : 1,
          }}
        >
          <Ionicons name="search" size={18} color={colors.onSurfaceVariant} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch()}
            editable={!studio}
            placeholder={studio ? 'Clear the studio filter to search by title' : 'Search titles...'}
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
          {query.length > 0 && !studio ? (
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

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.gutter,
          marginBottom: spacing.md,
        }}
      >
        <Chip label="Anime" compact selected={type === 'ANIME'} onPress={() => setType('ANIME')} />
        <Chip label="Manga" compact selected={type === 'MANGA'} onPress={() => setType('MANGA')} />

        <View style={{ flex: 1 }} />

        {filterCount > 0 ? (
          <Pressable
            onPress={clearFilters}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={'Clear ' + filterCount + ' active filters'}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Text variant="labelSm" colour={colors.primary} uppercase>
              {'Clear filters (' + filterCount + ')'}
            </Text>
          </Pressable>
        ) : null}
      </View>

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
              <Text
                variant="bodyMd"
                colour="onSurfaceVariant"
                style={{ paddingHorizontal: spacing.gutter }}
              >
                No quick matches yet - press Search for the full result set.
              </Text>
            ) : (
              <View>
                {(preview.data?.items ?? []).slice(0, 5).map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openPreviewItem(item.id)}
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
                    <Cover
                      uri={item.coverImage?.large ?? null}
                      width={40}
                      height={56}
                      radius={radii.sm}
                    />
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
                ))}
              </View>
            )}
            <Divider style={{ marginHorizontal: spacing.gutter, marginTop: spacing.sm }} />
          </View>
        ) : null}

        <SectionLabel>Studio</SectionLabel>
        {studio ? (
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <Chip
              label={studio.name}
              selected
              onPress={() => {
                setStudio(null);
                setStudioQuery('');
              }}
            />
            <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: spacing.sm }}>
              Browsing this studio's catalogue. Other filters below don't apply while a studio is
              selected - AniList only lets you sort a studio's list, not filter it.
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
                <ScrollView
                  horizontal
                  style={{ flexGrow: 0 }}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
                >
                  {(studioResults.data ?? []).map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      compact
                      onPress={() => {
                        setStudio(item);
                        setStudioQuery('');
                        setQuery('');
                        setFormat(undefined);
                        setGenres([]);
                        setTags([]);
                        setStatus(undefined);
                        setSeason(undefined);
                        setYearText('');
                        if (sort[0] === 'SEARCH_MATCH') setSort([...STUDIO_DEFAULT_SORT]);
                      }}
                    />
                  ))}
                </ScrollView>
              ) : (
                <Text
                  variant="labelSm"
                  colour="onSurfaceVariant"
                  style={{ paddingHorizontal: spacing.gutter }}
                >
                  No studios match &ldquo;{studioQuery.trim()}&rdquo;
                </Text>
              )
            ) : null}
          </>
        )}

        <Divider style={{ marginHorizontal: spacing.gutter, marginTop: spacing.sm }} />

        <View style={{ opacity: studio ? 0.4 : 1 }} pointerEvents={studio ? 'none' : 'auto'}>
          <SectionLabel>Format and status</SectionLabel>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
          >
            {(type === 'ANIME' ? FORMATS : MANGA_FORMATS).map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                compact
                selected={format === option.value}
                onPress={() => setFormat(option.value)}
              />
            ))}
            {STATUSES.map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                compact
                selected={status === option.value}
                onPress={() => setStatus(option.value)}
              />
            ))}
          </ScrollView>

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>Genre</SectionLabel>
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <SearchField
              icon="search-outline"
              value={genreQuery}
              onChangeText={setGenreQuery}
              placeholder="Search genres"
              accessibilityLabel="Search genres"
            />
          </View>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
          >
            {visibleGenres.length > 0 ? (
              visibleGenres.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  compact
                  selected={genres.includes(item)}
                  onPress={() =>
                    setGenres((previous) =>
                      previous.includes(item)
                        ? previous.filter((value) => value !== item)
                        : [...previous, item],
                    )
                  }
                />
              ))
            ) : (
              <Text variant="labelSm" colour="onSurfaceVariant">
                No genres match &ldquo;{genreQuery.trim()}&rdquo;
              </Text>
            )}
          </ScrollView>

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>Themes and tags</SectionLabel>
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <SearchField
              icon="color-wand-outline"
              value={tagQuery}
              onChangeText={setTagQuery}
              placeholder="Search themes (e.g. Isekai)"
              accessibilityLabel="Search themes"
            />
          </View>
          {tagQuery.trim().length > 0 ? (
            visibleTags.length > 0 ? (
              <ScrollView
                horizontal
                style={{ flexGrow: 0 }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
              >
                {visibleTags.map((item) => (
                  <Chip
                    key={item.id}
                    label={item.name}
                    compact
                    selected={tags.includes(item.name)}
                    onPress={() =>
                      setTags((previous) =>
                        previous.includes(item.name)
                          ? previous.filter((value) => value !== item.name)
                          : [...previous, item.name],
                      )
                    }
                  />
                ))}
              </ScrollView>
            ) : (
              <Text
                variant="labelSm"
                colour="onSurfaceVariant"
                style={{ paddingHorizontal: spacing.gutter }}
              >
                No themes match &ldquo;{tagQuery.trim()}&rdquo;
              </Text>
            )
          ) : tags.length > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                paddingHorizontal: spacing.gutter,
              }}
            >
              {tags.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  compact
                  selected
                  onPress={() => setTags((previous) => previous.filter((value) => value !== name))}
                />
              ))}
            </View>
          ) : null}

          <Divider style={{ marginHorizontal: spacing.gutter }} />

          <SectionLabel>Season and year</SectionLabel>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}
          >
            {SEASONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                compact
                selected={season === option.value}
                onPress={() => setSeason(season === option.value ? undefined : option.value)}
              />
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}>
            <SearchField
              icon="calendar-outline"
              value={yearText}
              onChangeText={(value) => setYearText(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 2024"
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel="Filter by release year"
            />
          </View>
        </View>

        <Divider style={{ marginHorizontal: spacing.gutter }} />

        <SectionLabel>Sort by</SectionLabel>
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter }}
        >
          {(studio ? STUDIO_SORTS : SORTS).map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              compact
              selected={sort.join(',') === option.value.join(',')}
              onPress={() => setSort([...option.value])}
            />
          ))}
        </ScrollView>

        <View style={{ marginTop: spacing.lg }}>
          {showRecent ? (
            recent.length > 0 ? (
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
                message="Search by romaji, English or native title. Three letters is usually enough."
                compact
              />
            )
          ) : null}
        </View>
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
          label="Search"
          onPress={() => runSearch()}
          disabled={!canSearch}
          fullWidth
          icon={<Ionicons name="search" size={16} color={colors.onPrimary} />}
        />
      </View>
    </Screen>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="labelLg"
      colour="onSurfaceVariant"
      uppercase
      style={{ marginHorizontal: spacing.gutter, marginVertical: spacing.sm }}
    >
      {children}
    </Text>
  );
}

interface SearchFieldProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  keyboardType?: 'default' | 'number-pad';
  maxLength?: number;
}

/**
 * A full-width filter search field. Previously these lived inside the same
 * horizontal ScrollView as the chip rows, which meant tapping to type
 * competed with swiping to scroll the chips - the wrong component for what
 * is, functionally, a standalone text input.
 */
function SearchField({
  icon,
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  keyboardType = 'default',
  maxLength,
}: SearchFieldProps) {
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
        keyboardType={keyboardType}
        maxLength={maxLength}
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
    </View>
  );
}

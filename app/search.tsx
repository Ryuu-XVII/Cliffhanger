import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDebounced, useGenres, useMediaTags } from '@/api/hooks';
import { readJson, writeJson } from '@/api/kv';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { SkeletonCard } from '@/ui/Skeleton';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-01. Debounced at 300ms, handles romaji/English/native through AniList's own
 * matcher, and carries the empty, no-results and error states the spec requires.
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

const STATUSES = [
  { value: undefined, label: 'Any status' },
  { value: 'RELEASING', label: 'Airing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
  { value: 'HIATUS', label: 'Hiatus' },
] as const;

const SORTS = [
  { value: ['SEARCH_MATCH', 'POPULARITY_DESC'], label: 'Best match' },
  { value: ['POPULARITY_DESC'], label: 'Most popular' },
  { value: ['SCORE_DESC'], label: 'Highest rated' },
  { value: ['START_DATE_DESC'], label: 'Newest' },
  { value: ['FAVOURITES_DESC'], label: 'Most loved' },
] as const;

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

  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<string | undefined>(undefined);
  const [type, setType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const [genre, setGenre] = useState<string | undefined>();
  const [genreQuery, setGenreQuery] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [yearText, setYearText] = useState('');
  const [sort, setSort] = useState<string[]>([...SORTS[0].value]);
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY) ?? []);

  const debounced = useDebounced(query, 300);
  const genres = useGenres();
  const tags = useMediaTags();
  const allGenres = useMemo(
    () => Array.from(new Set([...KNOWN_GENRES, ...(genres.data ?? [])])),
    [genres.data],
  );
  const visibleGenres = useMemo(
    () => allGenres.filter((item) => item.toLowerCase().includes(genreQuery.trim().toLowerCase())),
    [allGenres, genreQuery],
  );
  const visibleTags = useMemo(
    () => (tags.data ?? []).filter((item) => item.name.toLowerCase().includes(tag.trim().toLowerCase())).slice(0, 30),
    [tags.data, tag],
  );
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
  const activeFilters = Number(Boolean(format)) + Number(Boolean(genre)) + Number(Boolean(tag.trim())) + Number(Boolean(status)) + Number(Boolean(year)) + (sort[0] === 'SEARCH_MATCH' ? 0 : 1);
  const clearFilters = () => {
    setFormat(undefined);
    setGenre(undefined);
    setGenreQuery('');
    setTag('');
    setStatus(undefined);
    setYearText('');
    setSort([...SORTS[0].value]);
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

  const showRecent = debounced.trim().length === 0 && activeFilters === 0;
  const openResults = () => {
    remember(query);
    router.push({
      pathname: '/search-results',
      params: {
        q: query.trim(),
        type,
        format: format ?? '',
        genre: genre ?? '',
        tag: tag.trim(),
        status: status ?? '',
        year: year ? String(year) : '',
        sort: sort.join(','),
      },
    });
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
          }}
        >
          <Ionicons name="search" size={18} color={colors.onSurfaceVariant} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => remember(query)}
            placeholder="Search AniList..."
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
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={openResults}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          style={{ marginLeft: spacing.md }}
        >
          <Text variant="labelLg" colour={colors.primary} uppercase>
            Done
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter, marginBottom: spacing.md }}>
        <Chip label="Anime" compact selected={type === 'ANIME'} onPress={() => setType('ANIME')} />
        <Chip label="Manga" compact selected={type === 'MANGA'} onPress={() => setType('MANGA')} />
      </View>

      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm }}>
        <Chip label="Filters" compact selected={activeFilters > 0} onPress={clearFilters} accessibilityLabel={activeFilters > 0 ? 'Clear all filters' : 'Filters'} />
        {type === 'ANIME' ? FORMATS.map((option) => (
          <Chip key={option.label} label={option.label} compact selected={format === option.value} onPress={() => setFormat(option.value)} />
        )) : null}
        {STATUSES.map((option) => (
          <Chip key={option.label} label={option.label} compact selected={status === option.value} onPress={() => setStatus(option.value)} />
        ))}
      </ScrollView>

      <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginHorizontal: spacing.gutter, marginTop: spacing.sm, marginBottom: spacing.xs }}>Genres</Text>
      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: 190, height: 48, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: hairline, backgroundColor: colors.surfaceContainerLow }}>
          <Ionicons name="search-outline" size={17} color={colors.onSurfaceVariant} />
          <TextInput value={genreQuery} onChangeText={setGenreQuery} placeholder="Search genres" placeholderTextColor={colors.outline} autoCorrect={false} accessibilityLabel="Search genres" style={{ flex: 1, marginLeft: spacing.sm, paddingVertical: 0, color: colors.onSurface, fontFamily: 'HankenGrotesk_400Regular', fontSize: 15 }} />
        </View>
        {visibleGenres.map((item) => <Chip key={item} label={item} compact selected={genre === item} onPress={() => setGenre(genre === item ? undefined : item)} />)}
      </ScrollView>

      <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginHorizontal: spacing.gutter, marginTop: spacing.sm, marginBottom: spacing.xs }}>Year</Text>
      <View style={{ paddingHorizontal: spacing.gutter }}>
        <TextInput value={yearText} onChangeText={(value) => setYearText(value.replace(/\D/g, '').slice(0, 4))} placeholder="Enter year (e.g. 2024)" placeholderTextColor={colors.outline} keyboardType="number-pad" maxLength={4} accessibilityLabel="Filter by year" style={{ width: '100%', height: 52, paddingHorizontal: spacing.md, paddingVertical: 0, borderRadius: radii.full, borderWidth: 1, borderColor: hairline, backgroundColor: colors.surfaceContainerLow, color: colors.onSurface, fontFamily: 'HankenGrotesk_400Regular', fontSize: 16, textAlignVertical: 'center' }} />
      </View>

      <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginHorizontal: spacing.gutter, marginTop: spacing.md, marginBottom: spacing.xs }}>Themes and tags</Text>
      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: 230, height: 48, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: hairline, backgroundColor: colors.surfaceContainerLow }}>
          <Ionicons name="color-wand-outline" size={17} color={colors.onSurfaceVariant} />
          <TextInput value={tag} onChangeText={setTag} placeholder="Search themes (e.g. Isekai)" placeholderTextColor={colors.outline} autoCorrect={false} accessibilityLabel="Search AniList themes" style={{ flex: 1, marginLeft: spacing.sm, paddingVertical: 0, color: colors.onSurface, fontFamily: 'HankenGrotesk_400Regular', fontSize: 15 }} />
        </View>
        {visibleTags.map((item) => <Chip key={item.id} label={item.name} compact selected={tag.trim().toLowerCase() === item.name.toLowerCase()} onPress={() => setTag(item.name)} />)}
      </ScrollView>

      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingBottom: spacing.md }}>
        {SORTS.map((option) => (
          <Chip key={option.label} label={option.label} compact selected={sort.join(',') === option.value.join(',')} onPress={() => setSort([...option.value])} />
        ))}
      </ScrollView>

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
                <Chip key={term} label={term} onPress={() => setQuery(term)} />
              ))}
            </View>
          </View>
        ) : (
          <EmptyState
            icon="search-outline"
            title="Find something to watch"
            message="Search by romaji, English or native title. Three letters is usually enough."
            compact
            style={{ paddingTop: spacing.lg }}
          />
        )
      ) : (
        <EmptyState
          icon="options-outline"
          title="Ready to search"
          message="Tap Done to view results for your query and selected filters."
          compact
          style={{ paddingTop: spacing.lg }}
        />
      )}
    </Screen>
  );
}

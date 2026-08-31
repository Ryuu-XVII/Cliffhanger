import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSearchResults, useStudioMedia } from '@/api/hooks';
import { MediaCard } from '@/features/catalogue/MediaCard';
import {
  EMPTY_FILTERS,
  describeFilters,
  toSearchOptions,
  type SearchFilters,
} from '@/features/search/filters';
import { useLibraryStore } from '@/stores/libraryStore';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { EmptyState, ErrorState } from '@/ui/States';
import { Screen } from '@/ui/Screen';
import { SkeletonCard } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

/** Client-side scoping needs a few pages before it can look full. */
const MIN_VISIBLE_BEFORE_AUTOFETCH = 12;

/** Any more than this and the one-line summary starts wrapping past two rows. */
const MAX_SUMMARY_PILLS = 4;

export default function SearchResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; filters?: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const entries = useLibraryStore((state) => state.entries);

  /*
   * The whole filter set travels as one JSON param. Twenty separate params were
   * the alternative, and every new filter would have been one more thing to
   * forget to pass through - exactly how filters get silently dropped.
   */
  const filters: SearchFilters = useMemo(() => {
    if (!params.filters) return EMPTY_FILTERS;
    try {
      return { ...EMPTY_FILTERS, ...(JSON.parse(params.filters) as Partial<SearchFilters>) };
    } catch {
      return EMPTY_FILTERS;
    }
  }, [params.filters]);

  const studioId = filters.studio?.id ?? null;

  const search = useSearchResults(studioId ? '' : (params.q ?? ''), toSearchOptions(filters));
  const studio = useStudioMedia(studioId, filters.sort);

  const active = studioId ? studio : search;
  const { hasNextPage, isFetchingNextPage, isLoading, fetchNextPage } = active;
  const rawItems = useMemo(
    () => active.data?.pages.flatMap((page) => page.items) ?? [],
    [active.data],
  );

  /*
   * F-09-adjacent: "hide what I already track". AniList has an onList argument,
   * but it resolves against *their* account, and this app's library is local
   * and works signed-out - so the scope is applied here instead.
   */
  const results = useMemo(() => {
    if (filters.libraryScope === 'all') return rawItems;
    const wanted = filters.libraryScope === 'in-library';
    return rawItems.filter((item) => Boolean(entries[String(item.id)]) === wanted);
  }, [rawItems, filters.libraryScope, entries]);

  // Scoping can empty a page entirely, which would read as "no results" while
  // more pages exist. Pull more until there is enough to look like a grid.
  useEffect(() => {
    if (filters.libraryScope === 'all') return;
    if (results.length >= MIN_VISIBLE_BEFORE_AUTOFETCH) return;
    if (!hasNextPage || isFetchingNextPage || isLoading) return;
    void fetchNextPage();
  }, [filters.libraryScope, results.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const columns = width >= 700 ? 4 : 3;
  const cardWidth = (width - spacing.gutter * 2 - spacing.sm * (columns - 1)) / columns;

  const title = studioId ? (filters.studio?.name ?? 'Studio') : (params.q?.trim() || 'Filtered results');

  /*
   * Counted from what is actually loaded rather than from pageInfo.total, which
   * AniList reports as a 5000 placeholder until the last page (see the note in
   * api/anilist). "N+" while more pages exist is honest and sharpens as the
   * user scrolls; "5,000+ results" for 26 matches would not be.
   */
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (!isLoading) {
      const count = results.length.toLocaleString();
      parts.push(
        hasNextPage
          ? `${count}+ results`
          : `${count} ${results.length === 1 ? 'result' : 'results'}`,
      );
    }
    if (!studioId) {
      parts.push(filters.type === 'MANGA' ? 'Manga' : 'Anime');
      for (const pill of describeFilters(filters).slice(0, MAX_SUMMARY_PILLS)) {
        parts.push(pill.negated ? `no ${pill.label}` : pill.label);
      }
    }
    return parts.join(' · ');
  }, [isLoading, hasNextPage, results.length, studioId, filters]);

  return (
    <Screen>
      <ScreenHeader
        title={title}
        showBack
        right={
          studioId ? undefined : (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Edit search filters"
            >
              <Text variant="labelLg" colour={colors.primary} uppercase>
                Edit
              </Text>
            </Pressable>
          )
        }
      />

      {summary ? (
        <Text
          variant="labelSm"
          colour="onSurfaceVariant"
          numberOfLines={2}
          style={{ paddingHorizontal: spacing.gutter, marginTop: -spacing.sm, marginBottom: spacing.sm }}
        >
          {summary}
        </Text>
      ) : null}

      {active.isError ? (
        <ErrorState error={active.error} onRetry={() => void active.refetch()} />
      ) : isLoading ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.sm,
            paddingHorizontal: spacing.gutter,
            paddingTop: spacing.lg,
          }}
        >
          {Array.from({ length: columns * 3 }, (_, index) => (
            <SkeletonCard key={index} width={cardWidth} />
          ))}
        </View>
      ) : results.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title="No matching titles"
          message={
            filters.libraryScope !== 'all' && rawItems.length > 0
              ? 'Every match is filtered out by the library scope. Try setting it back to Everything.'
              : 'Nothing fits this combination. Try removing a filter or two.'
          }
          actionLabel="Edit filters"
          onAction={() => router.back()}
        />
      ) : (
        <FlatList
          data={results}
          key={`results-${columns}`}
          numColumns={columns}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.gutter,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
          }}
          columnWrapperStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}
          renderItem={({ item }) => <MediaCard media={item} width={cardWidth} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

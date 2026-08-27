import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSearchResults, useStudioMedia } from '@/api/hooks';
import type { AniListSeason } from '@/api/anilist/types';
import { MediaCard } from '@/features/catalogue/MediaCard';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { EmptyState, ErrorState } from '@/ui/States';
import { Screen } from '@/ui/Screen';
import { SkeletonCard } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

export default function SearchResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string;
    type?: string;
    format?: string;
    genre?: string;
    tag?: string;
    status?: string;
    year?: string;
    season?: string;
    sort?: string;
    studioId?: string;
    studioName?: string;
  }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const type = params.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const sort = params.sort?.split(',').filter(Boolean) ?? ['SEARCH_MATCH', 'POPULARITY_DESC'];
  const studioId = params.studioId ? Number(params.studioId) : null;

  const search = useSearchResults(studioId ? '' : (params.q ?? ''), {
    type,
    format: params.format || undefined,
    genre: params.genre ? params.genre.split(',').filter(Boolean) : undefined,
    tag: params.tag ? params.tag.split(',').filter(Boolean) : undefined,
    status: params.status || undefined,
    season: (params.season as AniListSeason) || undefined,
    seasonYear: params.year ? Number(params.year) : undefined,
    sort,
  });
  const studio = useStudioMedia(studioId, sort);

  const active = studioId ? studio : search;
  const results = studioId
    ? (studio.data?.pages.flatMap((p) => p.items) ?? [])
    : (search.data?.pages.flatMap((p) => p.items) ?? []);

  const columns = width >= 700 ? 4 : 3;
  const cardWidth = (width - spacing.gutter * 2 - spacing.sm * (columns - 1)) / columns;
  const summary = studioId
    ? undefined
    : [type === 'MANGA' ? 'Manga' : 'Anime', params.genre?.split(',').join(', '), params.tag?.split(',').join(', '), params.status, params.season, params.year]
        .filter(Boolean)
        .join(' · ');

  const title = studioId ? (params.studioName || 'Studio') : (params.q?.trim() || 'Filtered results');

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
          numberOfLines={1}
          style={{ paddingHorizontal: spacing.gutter, marginTop: -spacing.sm, marginBottom: spacing.sm }}
        >
          {summary}
        </Text>
      ) : null}

      {active.isError ? (
        <ErrorState error={active.error} onRetry={() => void active.refetch()} />
      ) : active.isLoading ? (
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
        <EmptyState icon="alert-circle-outline" title="No matching titles" message="Go back and try a different filter combination." />
      ) : (
        <FlatList
          data={results}
          key={'results-' + columns}
          numColumns={columns}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          columnWrapperStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}
          renderItem={({ item }) => <MediaCard media={item} width={cardWidth} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
          }}
          ListFooterComponent={
            active.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

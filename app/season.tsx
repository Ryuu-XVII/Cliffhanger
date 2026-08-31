import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, useWindowDimensions, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { useDiscoverShelfBrowse, useGenreShelf, useSeasonBrowse, type DiscoverShelfId } from '@/api/hooks';
import type { AniListSeason } from '@/api/anilist/types';
import { MediaCard } from '@/features/catalogue/MediaCard';
import {
  currentSeason,
  nextSeason,
  previousSeason,
  seasonLabel,
  type SeasonRef,
} from '@/utils/season';
import { aspect, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { SkeletonCard } from '@/ui/Skeleton';
import { Stepper } from '@/ui/Stepper';
import { EmptyState, ErrorState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-08 season browser, doubling as the "see all" destination for a genre. The
 * season stepper wraps years correctly, which the naive month/4 version does
 * not - December belongs to the next winter.
 */
const SHELF_TITLES: Record<DiscoverShelfId, string> = {
  trending: 'Trending now',
  popularNow: 'Popular now',
  topRated: 'Top rated',
  topMovies: 'Top movies',
  airingSoon: 'Airing soon',
};

/** AniList has nothing catalogued before this, so anything earlier is a bad param. */
const EARLIEST_SEASON_YEAR = 1950;

/** Title and metadata block under each cover, used for the parallax row offset. */
const CARD_CAPTION_HEIGHT = 70;

const SKELETON_COUNT = 6;

export default function SeasonScreen() {
  const params = useLocalSearchParams<{ season?: string; year?: string; genre?: string; shelf?: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const scrollY = useSharedValue(0);

  const genre = typeof params.genre === 'string' ? params.genre : null;
  const shelf =
    typeof params.shelf === 'string' && params.shelf in SHELF_TITLES
      ? (params.shelf as DiscoverShelfId)
      : null;

  const [ref, setRef] = useState<SeasonRef>(() => {
    const fallback = currentSeason();
    const season = typeof params.season === 'string' ? (params.season as AniListSeason) : fallback.season;
    const year = Number(params.year);
    return {
      season,
      year: Number.isFinite(year) && year > EARLIEST_SEASON_YEAR ? year : fallback.year,
    };
  });

  const seasonQuery = useSeasonBrowse(ref.season, ref.year);
  const genreQuery = useGenreShelf(genre);
  const shelfQuery = useDiscoverShelfBrowse(shelf);

  const items = useMemo(() => {
    if (shelf) return shelfQuery.data?.pages.flatMap((page) => page.items) ?? [];
    if (genre) return genreQuery.data?.items ?? [];
    return seasonQuery.data?.pages.flatMap((page) => page.items) ?? [];
  }, [shelf, shelfQuery.data, genre, genreQuery.data, seasonQuery.data]);

  function activeQuery() {
    if (shelf) return shelfQuery;
    if (genre) return genreQuery;
    return seasonQuery;
  }

  const { isLoading, isError, error, refetch } = activeQuery();

  function emptyMessage(): string {
    if (shelf) return 'AniList has nothing here right now.';
    if (genre) return 'AniList has no titles for this genre right now.';
    return 'This season has not been catalogued yet. Try the previous one.';
  }

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const columns = width >= 700 ? 4 : 3;
  const cardWidth = (width - spacing.gutter * 2 - spacing.sm * (columns - 1)) / columns;

  return (
    <Screen>
      <ScreenHeader title={shelf ? SHELF_TITLES[shelf] : (genre ?? 'Season')} showBack />

      {genre || shelf ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.gutter,
            marginBottom: spacing.lg,
          }}
        >
          <Stepper
            icon="chevron-back"
            label={`Previous season, ${seasonLabel(previousSeason(ref))}`}
            onPress={() => setRef(previousSeason(ref))}
          />

          <Text variant="displayLgMobile">{seasonLabel(ref)}</Text>

          <Stepper
            icon="chevron-forward"
            label={`Next season, ${seasonLabel(nextSeason(ref))}`}
            onPress={() => setRef(nextSeason(ref))}
          />
        </View>
      )}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.sm,
            paddingHorizontal: spacing.gutter,
          }}
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <SkeletonCard key={index} width={cardWidth} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing listed"
          message={emptyMessage()}
        />
      ) : (
        <FlatList
          data={items}
          key={`season-${columns}`}
          numColumns={columns}
          keyExtractor={(item) => String(item.id)}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (shelf) {
              if (shelfQuery.hasNextPage && !shelfQuery.isFetchingNextPage) void shelfQuery.fetchNextPage();
              return;
            }
            if (!genre && seasonQuery.hasNextPage && !seasonQuery.isFetchingNextPage) {
              void seasonQuery.fetchNextPage();
            }
          }}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl }}
          columnWrapperStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}
          renderItem={({ item, index }) => (
            <MediaCard
              media={item}
              width={cardWidth}
              scrollY={scrollY}
              itemOffset={
                Math.floor(index / columns) * (cardWidth / aspect.cover + CARD_CAPTION_HEIGHT)
              }
            />
          )}
          ListFooterComponent={
            (shelf ? shelfQuery.isFetchingNextPage : seasonQuery.isFetchingNextPage) ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}
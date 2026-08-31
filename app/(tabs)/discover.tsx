import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useDiscoverShelf, useGenres, useSeasonBrowse } from '@/api/hooks';
import type { AniListMediaLite } from '@/api/anilist/types';
import { MediaCard } from '@/features/catalogue/MediaCard';
import { SeasonTile } from '@/features/discover/components/SeasonTile';
import { displayName, useAuthStore } from '@/stores/authStore';
import { currentSeason, seasonLabel } from '@/utils/season';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip } from '@/ui/Chip';
import { ScreenHeader, SectionHeader } from '@/ui/Header';
import { PullToRefresh } from '@/ui/PullToRefresh';
import { Screen, useTabBarClearance } from '@/ui/Screen';
import { SkeletonCard } from '@/ui/Skeleton';
import { ErrorState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-09 discovery shelves plus the F-01 search entry point and the F-08 season
 * grid. Every shelf has its own loading and error state so one failing request
 * never takes the screen down with it.
 */

const RAIL_CARD_MAX_WIDTH = 168;
const RAIL_CARD_WIDTH_RATIO = 0.42;
const MAX_RAIL_ITEMS = 15;
const SEASON_PREVIEW_TILES = 4;
const MAX_GENRE_CHIPS = 18;

export default function DiscoverScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const clearance = useTabBarClearance();
  const scrollY = useSharedValue(0);
  const name = useAuthStore(displayName);

  const season = useMemo(() => currentSeason(), []);

  const trending = useDiscoverShelf('trending');
  const topRated = useDiscoverShelf('topRated');
  const topMovies = useDiscoverShelf('topMovies');
  const airingSoon = useDiscoverShelf('airingSoon');
  const seasonal = useSeasonBrowse(season.season, season.year);
  const genres = useGenres();

  const railCardWidth = Math.min(RAIL_CARD_MAX_WIDTH, width * RAIL_CARD_WIDTH_RATIO);
  const seasonTileWidth = (width - spacing.gutter * 2 - spacing.sm) / 2;

  const refetchTrending = trending.refetch;
  const refetchTopRated = topRated.refetch;
  const refetchTopMovies = topMovies.refetch;
  const refetchAiringSoon = airingSoon.refetch;
  const refetchSeasonal = seasonal.refetch;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetchTrending(),
      refetchTopRated(),
      refetchTopMovies(),
      refetchAiringSoon(),
      refetchSeasonal(),
    ]);
  }, [refetchTrending, refetchTopRated, refetchTopMovies, refetchAiringSoon, refetchSeasonal]);

  const seasonalItems =
    seasonal.data?.pages.flatMap((page) => page.items).slice(0, SEASON_PREVIEW_TILES) ?? [];

  return (
    <Screen>
      <ScreenHeader title="Discover" onAvatarPress={() => router.push('/(tabs)/profile')} avatarLabel={name} />

      <PullToRefresh
        onRefresh={onRefresh}
        scrollYRef={scrollY}
        contentContainerStyle={{ paddingBottom: clearance }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.push('/search')}
          accessibilityRole="search"
          accessibilityLabel="Search titles"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: spacing.gutter,
            marginBottom: spacing.xl,
            paddingHorizontal: spacing.md,
            height: 52,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: hairline,
            backgroundColor: colors.surfaceContainerLow,
          }}
        >
          <Ionicons name="search" size={20} color={colors.onSurfaceVariant} />
          <Text variant="bodyLg" colour="onSurfaceVariant" style={{ marginLeft: spacing.sm + 2 }}>
            Search titles...
          </Text>
        </Pressable>

        <Rail
          title="Trending now"
          query={trending}
          cardWidth={railCardWidth}
          scrollY={scrollY}
          onSeeAll={() => router.push({ pathname: '/season', params: { shelf: 'trending' } })}
        />

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title={seasonLabel(season)}
            actionLabel="See all"
            onAction={() =>
              router.push({
                pathname: '/season',
                params: { season: season.season, year: String(season.year) },
              })
            }
          />

          {seasonal.isError ? (
            <ErrorState error={seasonal.error} onRetry={() => void seasonal.refetch()} compact />
          ) : (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                paddingHorizontal: spacing.gutter,
                gap: spacing.sm,
              }}
            >
              {seasonal.isLoading
                ? Array.from({ length: SEASON_PREVIEW_TILES }, (_, index) => (
                    <View key={index} style={{ width: seasonTileWidth }}>
                      <SkeletonCard width={seasonTileWidth} />
                    </View>
                  ))
                : seasonalItems.map((media) => (
                    <SeasonTile key={media.id} media={media} width={seasonTileWidth} />
                  ))}
            </View>
          )}
        </View>

        <Rail
          title="Top rated"
          query={topRated}
          cardWidth={railCardWidth}
          scrollY={scrollY}
          style={{ marginTop: spacing.xl }}
        />
        <Rail
          title="Top movies"
          query={topMovies}
          cardWidth={railCardWidth}
          scrollY={scrollY}
          style={{ marginTop: spacing.xl }}
        />
        <Rail
          title="Airing soon"
          query={airingSoon}
          cardWidth={railCardWidth}
          scrollY={scrollY}
          style={{ marginTop: spacing.xl }}
        />

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Browse by genre" />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              paddingHorizontal: spacing.gutter,
            }}
          >
            {(genres.data ?? DEFAULT_GENRES).slice(0, MAX_GENRE_CHIPS).map((genre) => (
              <Chip
                key={genre}
                label={genre}
                onPress={() => router.push({ pathname: '/season', params: { genre } })}
              />
            ))}
          </View>
        </View>
      </PullToRefresh>
    </Screen>
  );
}

/** Shown while the genre collection loads, and if it fails outright. */
const DEFAULT_GENRES = [
  'Action',
  'Romance',
  'Sci-Fi',
  'Fantasy',
  'Comedy',
  'Drama',
  'Slice of Life',
  'Horror',
  'Mecha',
];

interface RailQuery {
  data?: { items: AniListMediaLite[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

function Rail({
  title,
  query,
  cardWidth,
  scrollY,
  onSeeAll,
  style,
}: {
  title: string;
  query: RailQuery;
  cardWidth: number;
  scrollY: ReturnType<typeof useSharedValue<number>>;
  onSeeAll?: () => void;
  style?: object;
}) {
  return (
    <View style={style}>
      <SectionHeader title={title} actionLabel={onSeeAll ? 'See all' : undefined} onAction={onSeeAll} />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} compact />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.sm + 4 }}
        >
          {query.isLoading
            ? [0, 1, 2].map((index) => <SkeletonCard key={index} width={cardWidth} />)
            : (query.data?.items ?? []).slice(0, MAX_RAIL_ITEMS).map((media) => (
                <MediaCard key={media.id} media={media} width={cardWidth} scrollY={scrollY} />
              ))}
        </ScrollView>
      )}
    </View>
  );
}

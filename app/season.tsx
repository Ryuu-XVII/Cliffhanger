import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { useGenreShelf, useSeasonBrowse } from '@/api/hooks';
import type { AniListSeason } from '@/api/anilist/types';
import { MediaCard } from '@/features/catalogue/MediaCard';
import {
  currentSeason,
  nextSeason,
  previousSeason,
  seasonLabel,
  type SeasonRef,
} from '@/utils/season';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { SkeletonCard } from '@/ui/Skeleton';
import { EmptyState, ErrorState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-08 season browser, doubling as the "see all" destination for a genre. The
 * season stepper wraps years correctly, which the naive month/4 version does
 * not - December belongs to the next winter.
 */
export default function SeasonScreen() {
  const params = useLocalSearchParams<{ season?: string; year?: string; genre?: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const scrollY = useSharedValue(0);

  const genre = typeof params.genre === 'string' ? params.genre : null;

  const [ref, setRef] = useState<SeasonRef>(() => {
    const fallback = currentSeason();
    const season = typeof params.season === 'string' ? (params.season as AniListSeason) : fallback.season;
    const year = Number(params.year);
    return { season, year: Number.isFinite(year) && year > 1950 ? year : fallback.year };
  });

  const seasonQuery = useSeasonBrowse(ref.season, ref.year);
  const genreQuery = useGenreShelf(genre);

  const items = useMemo(() => {
    if (genre) return genreQuery.data?.items ?? [];
    return seasonQuery.data?.pages.flatMap((page) => page.items) ?? [];
  }, [genre, genreQuery.data, seasonQuery.data]);

  const isLoading = genre ? genreQuery.isLoading : seasonQuery.isLoading;
  const isError = genre ? genreQuery.isError : seasonQuery.isError;
  const error = genre ? genreQuery.error : seasonQuery.error;
  const refetch = genre ? genreQuery.refetch : seasonQuery.refetch;

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const columns = width >= 700 ? 4 : 3;
  const cardWidth = (width - spacing.gutter * 2 - spacing.sm * (columns - 1)) / columns;

  return (
    <Screen>
      <ScreenHeader title={genre ?? 'Season'} showBack />

      {genre ? null : (
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
            label={'Previous season, ' + seasonLabel(previousSeason(ref))}
            onPress={() => setRef(previousSeason(ref))}
          />

          <Text variant="displayLgMobile">{seasonLabel(ref)}</Text>

          <Stepper
            icon="chevron-forward"
            label={'Next season, ' + seasonLabel(nextSeason(ref))}
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
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <SkeletonCard key={index} width={cardWidth} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing listed"
          message={
            genre
              ? 'AniList has no titles for this genre right now.'
              : 'This season has not been catalogued yet. Try the previous one.'
          }
        />
      ) : (
        <FlatList
          data={items}
          key={'season-' + columns}
          numColumns={columns}
          keyExtractor={(item) => String(item.id)}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
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
              itemOffset={Math.floor(index / columns) * (cardWidth * 1.5 + 70)}
            />
          )}
          ListFooterComponent={
            seasonQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

function Stepper({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainerHigh,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}

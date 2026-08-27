import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSearchPage } from '@/api/hooks';
import { MediaCard } from '@/features/catalogue/MediaCard';
import { hairline, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState, ErrorState } from '@/ui/States';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

export default function SearchResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; type?: string; format?: string; genre?: string; tag?: string; status?: string; year?: string; sort?: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);
  const type = params.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const sort = params.sort?.split(',').filter(Boolean) ?? ['SEARCH_MATCH', 'POPULARITY_DESC'];
  const search = useSearchPage(params.q ?? '', page, {
    type,
    format: params.format || undefined,
    genre: params.genre || undefined,
    tag: params.tag || undefined,
    status: params.status || undefined,
    seasonYear: params.year ? Number(params.year) : undefined,
    sort,
  });
  const results = search.data?.items ?? [];
  const columns = width >= 700 ? 4 : 3;
  const cardWidth = (width - spacing.gutter * 2 - spacing.sm * (columns - 1)) / columns;
  const summary = [type === 'MANGA' ? 'Manga' : 'Anime', params.genre, params.tag, params.status, params.year].filter(Boolean).join(' · ');

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: hairline }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to search">
          <Text variant="labelLg" colour={colors.primary}>BACK</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="headlineSm" numberOfLines={1}>{params.q?.trim() || 'Filtered results'}</Text>
          <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={1}>{summary}</Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit search filters">
          <Text variant="labelLg" colour={colors.primary}>EDIT</Text>
        </Pressable>
      </View>

      {search.isError ? <ErrorState error={search.error} onRetry={() => void search.refetch()} /> : search.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
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
          ListFooterComponent={
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
              <Pressable
                disabled={page === 1 || search.isFetching}
                onPress={() => setPage((value) => Math.max(1, value - 1))}
                accessibilityRole="button"
                accessibilityLabel="Previous results page"
                style={{ opacity: page === 1 ? 0.35 : 1 }}
              >
                <Text variant="labelLg" colour={colors.primary}>PREVIOUS</Text>
              </Pressable>
              <Text variant="labelLg" colour="onSurfaceVariant">{'Page ' + page}</Text>
              <Pressable
                disabled={!search.data?.hasNextPage || search.isFetching}
                onPress={() => setPage((value) => value + 1)}
                accessibilityRole="button"
                accessibilityLabel="Next results page"
                style={{ opacity: !search.data?.hasNextPage ? 0.35 : 1 }}
              >
                <Text variant="labelLg" colour={colors.primary}>NEXT</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </Screen>
  );
}

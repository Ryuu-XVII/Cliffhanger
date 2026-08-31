import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import type { AiringScheduleItem } from '@/api/anilist';
import { useAiringWindow } from '@/api/hooks';
import { isActiveEntry } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { AiringRow } from '@/features/home/components/AiringRow';
import { JumpBackIn } from '@/features/home/components/JumpBackIn';
import { RosterCard } from '@/features/home/components/RosterCard';
import { UpgradePrompt } from '@/features/account/UpgradePrompt';
import { SyncBanner } from '@/features/library/components/SyncBanner';
import { displayName, useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { spacing } from '@/theme/tokens';
import { ScreenHeader, SectionHeader } from '@/ui/Header';
import { PullToRefresh } from '@/ui/PullToRefresh';
import { Screen, useTabBarClearance } from '@/ui/Screen';
import { SkeletonRow } from '@/ui/Skeleton';
import { EmptyState, ErrorState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * Home exists to answer one question in under a second: what do I watch next,
 * and can I log it without going anywhere? Everything else on this screen is
 * secondary to the +1 (F-05).
 */

// §12 caps how much we ask the airing API; a week matches the "airing soon" framing.
const AIRING_WINDOW_HOURS = 24 * 7;
const MAX_AIRING_ROWS = 6;

export default function HomeScreen() {
  const router = useRouter();
  const entries = useLibraryStore((state) => state.entries);
  const sync = useLibraryStore((state) => state.sync);
  const name = useAuthStore(displayName);
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const tabBarClearance = useTabBarClearance();

  const watching = useMemo(
    () =>
      Object.values(entries)
        .filter(isActiveEntry)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );

  const hero = watching[0] ?? null;
  const roster = hero ? watching.slice(1) : watching;

  const airingQuery = useAiringWindow(AIRING_WINDOW_HOURS);

  const trackedIds = useMemo(
    () =>
      new Set(
        Object.values(entries)
          .filter((entry) => isActiveEntry(entry) || entry.status === 'PLANNING')
          .map((entry) => entry.anilistId),
      ),
    [entries],
  );

  // Only surface airings for titles the user actually tracks - a generic
  // schedule is noise.
  const trackedAiring = useMemo(
    () =>
      (airingQuery.data ?? [])
        .filter((item) => item.media && trackedIds.has(item.media.id))
        .slice(0, MAX_AIRING_ROWS),
    [airingQuery.data, trackedIds],
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([sync(), airingQuery.refetch()]);
  }, [sync, airingQuery.refetch]);

  const heroNextLabel = hero
    ? `${hero.mediaType === 'MANGA' ? 'Chapter' : 'Episode'} ${hero.progress + 1} up next`
    : null;

  return (
    <Screen>
      <ScreenHeader
        title="Home"
        onAvatarPress={() => router.push('/(tabs)/profile')}
        avatarLabel={name}
      />

      <PullToRefresh
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
      >
        <SyncBanner />
        <UpgradePrompt />

        {hero ? (
          <>
            <SectionHeader title="Jump back in" />
            <JumpBackIn entry={hero} nextEpisodeLabel={heroNextLabel} />
          </>
        ) : (
          <EmptyState
            icon="play-circle-outline"
            title="Nothing on the go"
            message="Find a series and add it to Watching. It will show up right here with a plus button."
            actionLabel="Find something"
            onAction={() => router.push('/search')}
          />
        )}

        {roster.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader
              title="Active roster"
              actionLabel="See all"
              onAction={() => router.push('/(tabs)/library')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.sm + 4 }}
              // A rail this short does not need virtualisation; keeping it a
              // ScrollView avoids the nested-list warning and the jank with it.
              removeClippedSubviews
            >
              {roster.map((entry) => (
                <RosterCard key={entry.anilistId} entry={entry} />
              ))}
              <View style={{ width: spacing.xs }} />
            </ScrollView>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Airing soon" />

          {renderAiringSection({
            isLoading: airingQuery.isLoading,
            isError: airingQuery.isError,
            error: airingQuery.error,
            onRetry: () => void airingQuery.refetch(),
            items: trackedAiring,
            hasHero: hero !== null,
          })}
        </View>

        {hero ? (
          <Text
            variant="labelSm"
            colour="onSurfaceVariant"
            style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl }}
          >
            {`Last logged: ${resolveTitle(hero.snapshot.title, language)}`}
          </Text>
        ) : null}
      </PullToRefresh>
    </Screen>
  );
}

function renderAiringSection(props: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  items: AiringScheduleItem[];
  hasHero: boolean;
}) {
  const { isLoading, isError, error, onRetry, items, hasHero } = props;

  if (isLoading) {
    return (
      <View style={{ paddingHorizontal: spacing.gutter }}>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={onRetry} compact />;
  }

  if (items.length > 0) {
    return (
      <>
        {items.map((item) => (
          <AiringRow key={`${item.id}:${item.episode}`} item={item} />
        ))}
      </>
    );
  }

  return (
    <Text variant="bodyMd" colour="onSurfaceVariant" style={{ paddingHorizontal: spacing.gutter }}>
      {hasHero
        ? 'No episodes scheduled for your list in the next week.'
        : 'Track an airing series to see countdowns here.'}
    </Text>
  );
}

import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useAiringWindow } from '@/api/hooks';
import { resolveTitle } from '@/data/titles';
import { AiringRow } from '@/features/home/components/AiringRow';
import { JumpBackIn } from '@/features/home/components/JumpBackIn';
import { ROSTER_CARD_WIDTH, RosterCard } from '@/features/home/components/RosterCard';
import { SyncBanner } from '@/features/library/components/SyncBanner';
import { UpgradePrompt } from '@/features/account/UpgradePrompt';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { spacing } from '@/theme/tokens';
import { EmptyState } from '@/ui/States';
import { Screen, useTabBarClearance } from '@/ui/Screen';
import { ScreenHeader, SectionHeader } from '@/ui/Header';
import { SkeletonRow } from '@/ui/Skeleton';
import { PullToRefresh } from '@/ui/PullToRefresh';
import { Text } from '@/ui/Text';

/**
 * Home exists to answer one question in under a second: what do I watch next,
 * and can I log it without going anywhere? Everything else on this screen is
 * secondary to the +1 (F-05).
 */
export default function HomeScreen() {
  const router = useRouter();
  const entries = useLibraryStore((state) => state.entries);
  const sync = useLibraryStore((state) => state.sync);
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const clearance = useTabBarClearance();
  const scrollY = useSharedValue(0);

  const watching = useMemo(
    () =>
      Object.values(entries)
        .filter((entry) => entry.status === 'WATCHING' || entry.status === 'REWATCHING')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );

  const hero = watching[0] ?? null;
  const roster = hero ? watching.slice(1) : watching;

  const airing = useAiringWindow(168);

  // Only surface airings for titles the user actually tracks - a generic
  // schedule is noise, and §12 caps how much we ask of the API anyway.
  const relevantAiring = useMemo(() => {
    const tracked = new Set(
      Object.values(entries)
        .filter((entry) => entry.status === 'WATCHING' || entry.status === 'PLANNING' || entry.status === 'REWATCHING')
        .map((entry) => entry.anilistId),
    );
    return (airing.data ?? [])
      .filter((item) => item.media && tracked.has(item.media.id))
      .slice(0, 6);
  }, [airing.data, entries]);

  const onRefresh = useCallback(async () => {
    await Promise.all([sync(), airing.refetch()]);
  }, [sync, airing]);

  const heroNextLabel = hero
    ? (hero.mediaType === 'MANGA' ? 'Chapter ' : 'Episode ') + (hero.progress + 1) + ' up next'
    : null;

  return (
    <Screen>
      <ScreenHeader
        title="Home"
        onAvatarPress={() => router.push('/(tabs)/profile')}
        avatarLabel="A"
      />

      <PullToRefresh
        onRefresh={onRefresh}
        scrollYRef={scrollY}
        contentContainerStyle={{ paddingBottom: clearance }}
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
              <View style={{ width: ROSTER_CARD_WIDTH * 0 + spacing.xs }} />
            </ScrollView>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Airing soon" />

          {airing.isLoading ? (
            <View style={{ paddingHorizontal: spacing.gutter }}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : relevantAiring.length > 0 ? (
            relevantAiring.map((item) => (
              <AiringRow key={item.id + ':' + item.episode} item={item} />
            ))
          ) : (
            <Text
              variant="bodyMd"
              colour="onSurfaceVariant"
              style={{ paddingHorizontal: spacing.gutter }}
            >
              {hero
                ? 'No episodes scheduled for your list in the next week.'
                : 'Track an airing series to see countdowns here.'}
            </Text>
          )}
        </View>

        {hero ? (
          <Text
            variant="labelSm"
            colour="onSurfaceVariant"
            style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl }}
          >
            {'Last logged: ' + resolveTitle(hero.snapshot.title, language)}
          </Text>
        ) : null}
      </PullToRefresh>
    </Screen>
  );
}

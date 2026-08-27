import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { isFirebaseConfigured } from '@/data/firebase';
import { computeStats } from '@/features/stats/compute';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/time';
import { Button } from '@/ui/Button';
import { ScreenHeader } from '@/ui/Header';
import { Row } from '@/ui/Row';
import { Screen, useTabBarClearance } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * Profile is the hub for everything that is not a title: identity, the stats
 * summary, linked services, and the doors to settings and data management.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const clearance = useTabBarClearance();

  const user = useAuthStore((state) => state.user);
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const linked = useAuthStore((state) => state.linked);

  const entries = useLibraryStore((state) => state.entries);
  const lastSyncedAt = useLibraryStore((state) => state.lastSyncedAt);
  const pending = useLibraryStore((state) => state.pending);

  const stats = useMemo(() => computeStats(Object.values(entries)), [entries]);

  const displayName = user?.displayName ?? (isAnonymous ? 'Guest' : (user?.email ?? 'You'));

  return (
    <Screen>
      <ScreenHeader title="Profile" />

      <ScrollView contentContainerStyle={{ paddingBottom: clearance }} showsVerticalScrollIndicator={false}>
        <View
          style={{
            marginHorizontal: spacing.gutter,
            padding: spacing.lg,
            borderRadius: radii.md,
            backgroundColor: colors.surfaceContainerLow,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceContainerHighest,
              }}
            >
              <Text variant="headlineMd" colour={colors.primary}>
                {displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text variant="headlineSm" numberOfLines={1}>
                {displayName}
              </Text>
              <Text variant="labelSm" colour="onSurfaceVariant">
                {isAnonymous
                  ? isFirebaseConfigured()
                    ? 'Local library, not synced'
                    : 'Local library. Add Firebase config to sync.'
                  : lastSyncedAt
                    ? 'Synced ' + relativeTime(lastSyncedAt)
                    : 'Not synced yet'}
              </Text>
            </View>
          </View>

          {isAnonymous ? (
            <Button
              label="Create account"
              onPress={() => router.push('/auth')}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          ) : null}

          {pending > 0 ? (
            <Text variant="labelSm" colour={colors.onHoldYellow} style={{ marginTop: spacing.sm }}>
              {pending + (pending === 1 ? ' change' : ' changes') + ' waiting to sync'}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter, marginTop: spacing.md }}>
          <StatTile label="Titles" value={String(stats.totalEntries)} />
          <StatTile label="Episodes" value={String(stats.episodesWatched)} />
          <StatTile
            label="Days"
            value={stats.daysWatched >= 1 ? stats.daysWatched.toFixed(1) : stats.daysWatched.toFixed(2)}
          />
        </View>

        <Group title="Your library">
          <Row
            icon="stats-chart-outline"
            label="Stats"
            hint="Episodes, scores, genres"
            onPress={() => router.push('/stats')}
          />
          <Row
            icon="bookmarks-outline"
            label="Custom lists"
            hint="Beyond the six standard lists"
            onPress={() => router.push('/lists')}
          />
          <Row
            icon="swap-horizontal-outline"
            label="Import and export"
            hint="Take your data anywhere"
            onPress={() => router.push('/settings/data')}
          />
        </Group>

        <Group title="Connections">
          <Row
            icon="link-outline"
            label="AniList"
            hint={linked.anilist ? 'Linked as ' + linked.anilist.userName : 'Not linked'}
            onPress={() => router.push('/settings/account')}
          />
          <Row
            icon="notifications-outline"
            label="Notifications"
            hint="Airing alerts and quiet hours"
            onPress={() => router.push('/settings/notifications')}
          />
        </Group>

        <Group title="App">
          <Row
            icon="settings-outline"
            label="Settings"
            hint="Titles, scores, theme, motion"
            onPress={() => router.push('/settings')}
          />
          <Row
            icon="person-circle-outline"
            label="Account"
            hint="Sign in, sign out, delete account"
            onPress={() => router.push('/settings/account')}
          />
        </Group>

        <Text
          variant="labelSm"
          colour="onSurfaceVariant"
          align="center"
          style={{ marginTop: spacing.xl }}
        >
          Cliffhanger 1.0 · Data from AniList and MyAnimeList
        </Text>
      </ScrollView>
    </Screen>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Text variant="headlineMd">{value}</Text>
      <Text variant="labelSm" colour="onSurfaceVariant" uppercase>
        {label}
      </Text>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text
        variant="labelLg"
        colour="onSurfaceVariant"
        uppercase
        style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}
      >
        {title}
      </Text>
      <View style={{ marginHorizontal: spacing.gutter, borderRadius: radii.md, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

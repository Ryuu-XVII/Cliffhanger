import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { View } from 'react-native';

import type { LibraryEntry } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { captureHero } from '@/features/title/hero';
import { totalUnits, unitNoun, unitNounCapitalised } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip } from '@/ui/Chip';
import { Cover } from '@/ui/Cover';
import { IncrementButton } from '@/ui/Incrementer';
import { ProgressBar } from '@/ui/Indicators';
import { PressableScale } from '@/ui/PressableScale';
import { Scrim } from '@/ui/Surfaces';
import { Text } from '@/ui/Text';

/**
 * The hero card at the top of Home. It carries the single most likely action in
 * the app - log the next episode of the thing you are actually watching - and
 * puts it one tap from launch (F-05).
 */
export function JumpBackIn({
  entry,
  nextEpisodeLabel,
}: {
  entry: LibraryEntry;
  nextEpisodeLabel?: string | null;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const { logEpisode } = useProgressActions();
  const heroRef = useRef<View>(null);

  const title = resolveTitle(entry.snapshot.title, language);
  const total = totalUnits(entry);
  const noun = unitNoun(entry);
  const nounCapitalised = unitNounCapitalised(entry);
  const atEnd = total !== null && entry.progress >= total;
  const percent = total ? Math.round((entry.progress / total) * 100) : null;
  const heroUri = entry.snapshot.bannerImage ?? entry.snapshot.coverImage;

  const open = useCallback(async () => {
    await captureHero(heroRef.current, entry.anilistId, heroUri);
    router.push({ pathname: '/title/[id]', params: { id: String(entry.anilistId) } });
  }, [router, entry.anilistId, heroUri]);

  return (
    <PressableScale
      onPress={open}
      scaleTo={0.985}
      rotateTo={0.2}
      radiusFrom={radii.lg}
      radiusTo={radii.xl}
      accessibilityLabel={`Continue ${title}`}
      accessibilityHint={`Opens details for ${title}`}
      style={{
        marginHorizontal: spacing.gutter,
        height: 300,
        backgroundColor: colors.surfaceContainerLow,
        overflow: 'hidden',
      }}
    >
      <View ref={heroRef} collapsable={false} style={{ flex: 1 }}>
        <Cover
          uri={heroUri}
          radius={radii.lg}
          accessibilityLabel={`${title} artwork`}
        />
        <Scrim height="72%" />

        <View style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
            {entry.snapshot.genres.slice(0, 2).map((genre, index) => (
              <Chip
                key={genre}
                label={genre}
                compact
                tint={index === 0 ? colors.secondary : undefined}
              />
            ))}
          </View>

          <Text variant="displayLgMobile" numberOfLines={2}>
            {title}
          </Text>

          <Text variant="bodyMd" colour="onSurfaceVariant" numberOfLines={1} style={{ marginTop: 2 }}>
            {nextEpisodeLabel ??
              `${nounCapitalised} ${entry.progress + 1} up next`}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md }}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="labelLg" colour={colors.primary}>
                  {percent !== null ? `${percent}% complete` : 'In progress'}
                </Text>
                <Text variant="labelLg" colour="onSurfaceVariant">
                  {total ? `${entry.progress} / ${total}` : String(entry.progress)}
                </Text>
              </View>
              <ProgressBar
                value={total ? entry.progress / total : 0}
                height={6}
                style={{ marginTop: spacing.sm }}
                accessibilityLabel={`${percent ?? 0} percent complete`}
              />
            </View>

            <IncrementButton
              size={56}
              disabled={atEnd}
              celebrate={!atEnd}
              onIncrement={() => logEpisode(entry.anilistId)}
              accessibilityLabel={`Log one ${noun} of ${title}`}
            />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

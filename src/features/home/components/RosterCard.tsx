import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { View } from 'react-native';

import type { LibraryEntry } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { captureHero } from '@/features/title/hero';
import { totalUnits, unitNoun } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Cover } from '@/ui/Cover';
import { IncrementButton } from '@/ui/Incrementer';
import { ProgressBar } from '@/ui/Indicators';
import { PressableScale } from '@/ui/PressableScale';
import { Scrim } from '@/ui/Surfaces';
import { Text } from '@/ui/Text';

export const ROSTER_CARD_WIDTH = 168;

/**
 * A card in the Active Roster rail: cover, current episode, and the +1. Every
 * currently-watching title is reachable and loggable without leaving Home.
 */
export function RosterCard({ entry }: { entry: LibraryEntry }) {
  const router = useRouter();
  const { colors } = useTheme();
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const { logEpisode } = useProgressActions();
  const coverRef = useRef<View>(null);

  const title = resolveTitle(entry.snapshot.title, language);
  const total = totalUnits(entry);
  const noun = unitNoun(entry);
  const atEnd = total !== null && entry.progress >= total;
  const height = ROSTER_CARD_WIDTH * 1.32;

  const open = useCallback(async () => {
    await captureHero(coverRef.current, entry.anilistId, entry.snapshot.coverImage);
    router.push({ pathname: '/title/[id]', params: { id: String(entry.anilistId) } });
  }, [router, entry.anilistId, entry.snapshot.coverImage]);

  return (
    <PressableScale
      onPress={open}
      radiusFrom={radii.md}
      radiusTo={radii.lg}
      accessibilityLabel={title + ', ' + noun + ' ' + entry.progress + (total ? ' of ' + total : '')}
      style={{ width: ROSTER_CARD_WIDTH }}
    >
      <View ref={coverRef} collapsable={false} style={{ width: ROSTER_CARD_WIDTH, height }}>
        <Cover
          uri={entry.snapshot.coverImage}
          width={ROSTER_CARD_WIDTH}
          height={height}
          radius={radii.md}
        />
        <Scrim height="46%" />

        <View
          style={{
            position: 'absolute',
            left: spacing.sm + 2,
            right: spacing.sm,
            bottom: spacing.sm + 4,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <View>
            <Text variant="bodyMd">
              {(entry.mediaType === 'MANGA' ? 'Ch ' : 'Ep ') + entry.progress}
            </Text>
            <Text variant="labelSm" colour="onSurfaceVariant">
              {total ? 'of ' + total : 'ongoing'}
            </Text>
          </View>

          <IncrementButton
            size={36}
            disabled={atEnd}
            celebrate={!atEnd}
            onIncrement={() => logEpisode(entry.anilistId)}
            accessibilityLabel={'Log one ' + noun + ' of ' + title}
          />
        </View>

        {total ? (
          <ProgressBar
            value={entry.progress / total}
            height={3}
            tint={colors.primary}
            trackColour="rgba(0,0,0,0.5)"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
      </View>

      <Text variant="bodyMd" numberOfLines={1} style={{ marginTop: spacing.sm }}>
        {title}
      </Text>
    </PressableScale>
  );
}

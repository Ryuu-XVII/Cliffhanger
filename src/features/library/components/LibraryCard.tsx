import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { LibraryEntry } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { captureHero } from '@/features/title/hero';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { totalUnits, unitNoun } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { aspect, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Cover } from '@/ui/Cover';
import { IncrementButton } from '@/ui/Incrementer';
import { ProgressBar, STATUS_COLOURS, StatusDot } from '@/ui/Indicators';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

/**
 * The library grid card from the mockup: a 2:3 wall of art, an episode badge
 * with the status dot, a progress hairline pinned to the bottom of the cover,
 * and the title and genres beneath.
 *
 * The +1 sits on the card itself so logging never requires a detour into the
 * detail screen (F-05).
 */
export interface LibraryCardProps {
  entry: LibraryEntry;
  width: number;
  scrollY?: SharedValue<number>;
  itemOffset?: number;
  showIncrement?: boolean;
  style?: ViewStyle;
}

export function LibraryCard({
  entry,
  width,
  scrollY,
  itemOffset,
  showIncrement = true,
  style,
}: LibraryCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const { logEpisode } = useProgressActions();
  const coverRef = useRef<View>(null);

  const title = resolveTitle(entry.snapshot.title, language);
  const total = totalUnits(entry);
  const height = width / aspect.cover;
  const noun = unitNoun(entry);
  const atEnd = total !== null && entry.progress >= total;

  const open = useCallback(async () => {
    await captureHero(coverRef.current, entry.anilistId, entry.snapshot.coverImage);
    router.push({ pathname: '/title/[id]', params: { id: String(entry.anilistId) } });
  }, [router, entry.anilistId, entry.snapshot.coverImage]);

  return (
    <PressableScale
      onPress={open}
      style={[{ width }, style ?? {}]}
      radiusFrom={radii.md}
      radiusTo={radii.lg}
      accessibilityLabel={`${title}, ${noun} ${entry.progress}${total ? ` of ${total}` : ''}`}
      accessibilityHint={`Opens details for ${title}`}
    >
      <View ref={coverRef} collapsable={false} style={{ width, height }}>
        <Cover
          uri={entry.snapshot.coverImage}
          width={width}
          height={height}
          radius={radii.md}
          scrollY={scrollY}
          itemOffset={itemOffset}
        />

        <View
          style={{
            position: 'absolute',
            top: spacing.sm,
            left: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.68)',
            borderRadius: radii.full,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
          }}
        >
          <StatusDot status={entry.status} size={7} />
          <Text
            variant="labelLg"
            colour={STATUS_COLOURS[entry.status]}
            style={{ marginLeft: spacing.xs + 2 }}
          >
            {`${entry.mediaType === 'MANGA' ? 'Ch' : 'Ep'} ${entry.progress}`}
          </Text>
        </View>

        {showIncrement ? (
          <IncrementButton
            size={36}
            disabled={atEnd}
            celebrate={!atEnd}
            onIncrement={() => logEpisode(entry.anilistId)}
            accessibilityLabel={`Log one ${noun} of ${title}`}
            style={{ position: 'absolute', right: spacing.sm, bottom: spacing.sm + 6 }}
          />
        ) : null}

        {total ? (
          <ProgressBar
            value={entry.progress / total}
            height={3}
            tint={colors.primary}
            trackColour="rgba(0,0,0,0.55)"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
            accessibilityLabel={`${Math.round((entry.progress / total) * 100)} percent watched`}
          />
        ) : null}
      </View>

      <Text variant="bodyMd" numberOfLines={1} style={{ marginTop: spacing.sm }}>
        {title}
      </Text>
      <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={1} style={{ marginTop: 2 }}>
        {entry.snapshot.genres.slice(0, 2).join(' · ') || '—'}
      </Text>
    </PressableScale>
  );
}

import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { View } from 'react-native';

import type { LibraryEntry } from '@/data/models';
import { formatScore } from '@/data/score';
import { resolveTitle } from '@/data/titles';
import { formatLabel } from '@/data/transforms';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { captureHero } from '@/features/title/hero';
import { totalUnits, unitNoun } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Cover } from '@/ui/Cover';
import { IncrementButton } from '@/ui/Incrementer';
import { ProgressBar, StatusPill } from '@/ui/Indicators';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

/** The list layout of the library (F-07). Denser, and better for long lists. */
export function LibraryRow({ entry }: { entry: LibraryEntry }) {
  const router = useRouter();
  const { colors } = useTheme();
  const settings = useSettingsStore((state) => state.settings);
  const { logEpisode } = useProgressActions();
  const coverRef = useRef<View>(null);

  const title = resolveTitle(entry.snapshot.title, settings.titleLanguage);
  const total = totalUnits(entry);
  const noun = unitNoun(entry);
  const atEnd = total !== null && entry.progress >= total;

  const open = useCallback(async () => {
    await captureHero(coverRef.current, entry.anilistId, entry.snapshot.coverImage);
    router.push({ pathname: '/title/[id]', params: { id: String(entry.anilistId) } });
  }, [router, entry.anilistId, entry.snapshot.coverImage]);

  return (
    <PressableScale
      onPress={open}
      scaleTo={0.985}
      rotateTo={0}
      radiusFrom={radii.md}
      radiusTo={radii.lg}
      accessibilityLabel={`${title}, ${noun} ${entry.progress}${total ? ` of ${total}` : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.sm,
        marginBottom: spacing.sm,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <View ref={coverRef} collapsable={false}>
        <Cover uri={entry.snapshot.coverImage} width={54} height={81} radius={radii.sm} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text variant="bodyMd" numberOfLines={1}>
          {title}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: spacing.sm }}>
          <StatusPill status={entry.status} />
          <Text variant="labelSm" colour="onSurfaceVariant">
            {formatLabel(entry.snapshot.format)}
          </Text>
          {entry.score !== null ? (
            <Text variant="labelSm" colour={colors.secondary}>
              {formatScore(entry.score, settings.scoreFormat)}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
          <ProgressBar
            value={total ? entry.progress / total : 0}
            style={{ flex: 1 }}
            accessibilityLabel={
              total
                ? `${Math.round((entry.progress / total) * 100)} percent watched`
                : `${entry.progress} watched`
            }
          />
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginLeft: spacing.sm }}>
            {total ? `${entry.progress}/${total}` : String(entry.progress)}
          </Text>
        </View>
      </View>

      <IncrementButton
        size={40}
        disabled={atEnd}
        celebrate={!atEnd}
        onIncrement={() => logEpisode(entry.anilistId)}
        accessibilityLabel={`Log one ${noun} of ${title}`}
        style={{ marginLeft: spacing.md }}
      />
    </PressableScale>
  );
}

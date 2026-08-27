import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { AniListMediaLite } from '@/api/anilist/types';
import { formatLabel } from '@/data/transforms';
import { resolveTitle } from '@/data/titles';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { aspect, radii, spacing } from '@/theme/tokens';
import { Cover } from '@/ui/Cover';
import { PressableScale } from '@/ui/PressableScale';
import { ScoreBadge, StatusDot } from '@/ui/Indicators';
import { Text } from '@/ui/Text';
import { captureHero } from '@/features/title/hero';

/**
 * The poster card used by Discover, Search and the season browser. Cover art is
 * the primary material, so the card frames it and adds only what a decision
 * needs: score, format, and whether it is already in the library.
 */
export interface MediaCardProps {
  media: AniListMediaLite;
  width: number;
  /** Drives the in-card parallax during scroll (§9). */
  scrollY?: SharedValue<number>;
  itemOffset?: number;
  showMeta?: boolean;
  style?: ViewStyle;
}

export function MediaCard({
  media,
  width,
  scrollY,
  itemOffset,
  showMeta = true,
  style,
}: MediaCardProps) {
  const router = useRouter();
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const entry = useLibraryStore((state) => state.entries[String(media.id)]);
  const coverRef = useRef<View>(null);

  const title = resolveTitle(media.title, language);
  const height = width / aspect.cover;
  const score = media.averageScore ? (media.averageScore / 10).toFixed(1) : null;

  const open = useCallback(async () => {
    await captureHero(coverRef.current, media.id, media.coverImage?.extraLarge ?? media.coverImage?.large ?? null);
    router.push({ pathname: '/title/[id]', params: { id: String(media.id) } });
  }, [router, media]);

  return (
    <PressableScale
      onPress={open}
      style={[{ width }, style ?? {}]}
      radiusFrom={radii.md}
      radiusTo={radii.lg}
      accessibilityLabel={title}
      accessibilityHint={'Opens details for ' + title}
    >
      <View ref={coverRef} collapsable={false} style={{ width, height }}>
        <Cover
          uri={media.coverImage?.extraLarge ?? media.coverImage?.large ?? null}
          width={width}
          height={height}
          radius={radii.md}
          scrollY={scrollY}
          itemOffset={itemOffset}
        />

        {score ? (
          <ScoreBadge score={score} compact style={{ position: 'absolute', top: spacing.sm, right: spacing.sm }} />
        ) : null}

        {entry ? (
          <View
            accessible
            accessibilityLabel={'In your library'}
            style={{
              position: 'absolute',
              top: spacing.sm,
              left: spacing.sm,
              padding: 5,
              borderRadius: radii.full,
              backgroundColor: 'rgba(0,0,0,0.65)',
            }}
          >
            <StatusDot status={entry.status} size={7} />
          </View>
        ) : null}
      </View>

      <Text variant="bodyMd" numberOfLines={2} style={{ marginTop: spacing.sm }}>
        {title}
      </Text>

      {showMeta ? (
        <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={1} style={{ marginTop: 2 }}>
          {[formatLabel(media.format), media.seasonYear ?? media.startDate?.year ?? null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </PressableScale>
  );
}

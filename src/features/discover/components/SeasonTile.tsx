import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import type { AniListMediaLite } from '@/api/anilist/types';
import { resolveTitle } from '@/data/titles';
import { airingLabel, formatLabel } from '@/data/transforms';
import { useSettingsStore } from '@/stores/settingsStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Cover } from '@/ui/Cover';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

/**
 * The landscape seasonal tile from the Discover mockup - a wide crop of the
 * banner with the format and airing status above the title.
 */
/** The banner crop is a wide landscape rather than the 2:3 of a poster. */
const BANNER_ASPECT = 0.62;

export function SeasonTile({ media, width }: { media: AniListMediaLite; width: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const language = useSettingsStore((state) => state.settings.titleLanguage);

  const title = resolveTitle(media.title, language);
  const releasing = media.status === 'RELEASING';
  const bannerWidth = width - spacing.sm * 2;

  const open = useCallback(() => {
    router.push({ pathname: '/title/[id]', params: { id: String(media.id) } });
  }, [router, media.id]);

  return (
    <PressableScale
      onPress={open}
      radiusFrom={radii.md}
      radiusTo={radii.lg}
      accessibilityLabel={title}
      style={{
        width,
        padding: spacing.sm,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <View>
        <Cover
          uri={media.bannerImage ?? media.coverImage?.extraLarge ?? media.coverImage?.large ?? null}
          width={bannerWidth}
          height={bannerWidth * BANNER_ASPECT}
          radius={radii.sm}
        />
      </View>

      <Text
        variant="labelLg"
        colour={releasing ? colors.primary : colors.onSurfaceVariant}
        style={{ marginTop: spacing.sm }}
        numberOfLines={1}
      >
        {`${formatLabel(media.format)} · ${airingLabel(media.status)}`}
      </Text>

      <Text variant="bodyMd" numberOfLines={1} style={{ marginTop: 2 }}>
        {title}
      </Text>
    </PressableScale>
  );
}

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { AiringScheduleItem } from '@/api/anilist';
import { resolveTitle } from '@/data/titles';
import { useSettingsStore } from '@/stores/settingsStore';
import { airingDayLabel, formatCountdown } from '@/utils/time';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Cover } from '@/ui/Cover';
import { PressableScale } from '@/ui/PressableScale';
import { Scrim } from '@/ui/Surfaces';
import { Text } from '@/ui/Text';

/**
 * F-14 - the airing countdown. It ticks once a minute rather than once a
 * second: the extra precision is invisible and §9 forbids a continuously
 * running ambient animation on Home for battery reasons.
 */
export function AiringRow({ item }: { item: AiringScheduleItem }) {
  const router = useRouter();
  const { colors } = useTheme();
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const media = item.media;
  if (!media) return null;

  const title = resolveTitle(media.title, language);
  const secondsUntil = item.airingAt - Math.floor(now / 1000);
  const dayLabel = airingDayLabel(item.airingAt, new Date(now));
  const isToday = dayLabel === 'Today';

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/title/[id]', params: { id: String(media.id) } })}
      scaleTo={0.98}
      rotateTo={0}
      radiusFrom={radii.md}
      radiusTo={radii.lg}
      accessibilityLabel={`${title}, episode ${item.episode}, airs ${dayLabel} in ${formatCountdown(secondsUntil)}`}
      style={{
        height: 92,
        marginHorizontal: spacing.gutter,
        marginBottom: spacing.sm,
        backgroundColor: colors.surfaceContainerLow,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '52%' }}>
        <Cover uri={media.bannerImage ?? media.coverImage?.large ?? null} radius={0} />
        <Scrim
          height="100%"
          from="rgba(18,18,20,1)"
          to="rgba(18,18,20,0)"
          style={{ top: 0, bottom: 0, height: undefined, width: '70%', right: undefined }}
        />
      </View>

      <View style={{ flex: 1, justifyContent: 'space-between', padding: spacing.md }}>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderRadius: radii.sm,
            backgroundColor: isToday ? colors.tertiaryContainer : colors.secondaryContainer,
          }}
        >
          <Text
            variant="labelSm"
            uppercase
            colour={isToday ? colors.onTertiaryContainer : colors.onSecondaryContainer}
          >
            {dayLabel}
          </Text>
        </View>

        <Text variant="bodyMd" numberOfLines={1} style={{ maxWidth: '78%' }}>
          {`${title} · Ep ${item.episode}`}
        </Text>
      </View>

      <View style={{ position: 'absolute', right: spacing.md, top: 0, bottom: 0, justifyContent: 'center' }}>
        <Text variant="headlineMd">{formatCountdown(secondsUntil)}</Text>
      </View>
    </PressableScale>
  );
}

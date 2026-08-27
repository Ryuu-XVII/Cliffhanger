import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { describeDelay, type AiringInfo } from '@/api/animeschedule';
import type { AniListAiringSchedule } from '@/api/anilist/types';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCountdown } from '@/utils/time';
import { Text } from '@/ui/Text';

/**
 * F-14, with the thing AniList cannot tell you.
 *
 * AniList's `nextAiringEpisode` is authoritative for the episode number but it
 * has no notion of a broadcast slipping or a series going on break - it simply
 * keeps counting down to a slot that nothing will air in. AnimeSchedule tracks
 * exactly that, so when it reports a delay the countdown is demoted and the
 * delay is what the user sees.
 */
export function AiringPanel({
  nextAiring,
  info,
}: {
  nextAiring: AniListAiringSchedule | null;
  info: AiringInfo | null | undefined;
}) {
  const { colors } = useTheme();

  const delay = describeDelay(info?.delay ?? null);
  const subAt = info?.subAt ?? null;
  const showSub = subAt !== null && subAt > Date.now();

  if (!nextAiring && !delay && !showSub) return null;

  return (
    <View
      style={{
        marginHorizontal: spacing.gutter,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: delay ? colors.onHoldYellow + '55' : hairline,
        backgroundColor: delay ? colors.onHoldYellow + '14' : 'transparent',
      }}
    >
      {delay ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="pause-circle-outline" size={16} color={colors.onHoldYellow} />
          <Text variant="bodyMd" colour={colors.onHoldYellow} style={{ marginLeft: spacing.sm, flex: 1 }}>
            {delay}
          </Text>
        </View>
      ) : null}

      {nextAiring ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: delay ? spacing.sm : 0,
            // A delayed show still shows its scheduled slot, just quietly.
            opacity: delay ? 0.65 : 1,
          }}
        >
          <Ionicons name="time-outline" size={16} color={colors.tertiary} />
          <Text variant="bodyMd" colour="onSurfaceVariant" style={{ marginLeft: spacing.sm, flex: 1 }}>
            {'Episode ' +
              nextAiring.episode +
              ' in ' +
              formatCountdown(nextAiring.timeUntilAiring) +
              (delay ? ' (as scheduled)' : '')}
          </Text>
        </View>
      ) : null}

      {showSub ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: nextAiring || delay ? spacing.sm : 0,
          }}
        >
          <Ionicons name="language-outline" size={16} color={colors.onSurfaceVariant} />
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginLeft: spacing.sm, flex: 1 }}>
            {'Subs in ' + formatCountdown(Math.floor((subAt - Date.now()) / 1000))}
          </Text>
        </View>
      ) : null}

      {info?.episodesAired && info.totalEpisodes ? (
        <Text variant="labelSm" colour={colors.outline} style={{ marginTop: spacing.sm }}>
          {info.episodesAired + ' of ' + info.totalEpisodes + ' episodes aired'}
        </Text>
      ) : null}
    </View>
  );
}

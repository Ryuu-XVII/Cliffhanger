import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { AniListAiringSchedule } from '@/api/anilist/types';
import type { LibraryEntry } from '@/data/models';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDate } from '@/utils/time';
import { Text } from '@/ui/Text';

/**
 * The episode list from the detail mockup: watched episodes carry a filled
 * check, the next one is marked "Up next" with an accent rail, and tapping any
 * row sets progress to that episode - which is far faster than tapping +1 nine
 * times after a binge.
 */
const PAGE = 12;
/** Later pages are bigger: someone who asked for more is browsing, not glancing. */
const PAGE_MORE = PAGE * 2;

function episodeStatusLabel(options: {
  watched: boolean;
  upNext: boolean;
  future: boolean;
  airedAt: number | undefined;
}): string {
  const { watched, upNext, future, airedAt } = options;
  if (watched) return 'Watched';
  if (future && airedAt !== undefined) return `Airs ${formatDate(airedAt * 1000)}`;
  if (upNext) return 'Up next';
  if (airedAt) return `Aired ${formatDate(airedAt * 1000)}`;
  return 'Not watched';
}

export function EpisodeList({
  entry,
  totalEpisodes,
  schedule,
  onRequireEntry,
  mediaType = 'ANIME',
}: {
  entry: LibraryEntry | null;
  totalEpisodes: number | null;
  schedule: AniListAiringSchedule[] | null | undefined;
  /** Called when the user taps an episode on a title not yet in the library. */
  onRequireEntry: () => void;
  mediaType?: 'ANIME' | 'MANGA';
}) {
  const { colors } = useTheme();
  const { setEpisode } = useProgressActions();
  const [limit, setLimit] = useState(PAGE);

  const airedAtByEpisode = useMemo(() => {
    const map = new Map<number, number>();
    for (const node of schedule ?? []) map.set(node.episode, node.airingAt);
    return map;
  }, [schedule]);

  const count =
    totalEpisodes ?? (schedule?.length ? Math.max(...schedule.map((node) => node.episode)) : 0);
  if (count <= 0) return null;

  const progress = entry?.progress ?? 0;
  const episodes = Array.from({ length: Math.min(limit, count) }, (_, index) => index + 1);
  const unitLabel = mediaType === 'MANGA' ? 'Chapter' : 'Episode';

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text variant="displayLgMobile" style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.md }}>
        {mediaType === 'MANGA' ? 'Chapters' : 'Episodes'}
      </Text>

      {episodes.map((episode) => {
        const watched = episode <= progress;
        const upNext = episode === progress + 1;
        const aired = airedAtByEpisode.get(episode);
        const future = aired !== undefined && aired * 1000 > Date.now();

        return (
          <Pressable
            key={episode}
            onPress={() => {
              if (!entry) {
                onRequireEntry();
                return;
              }
              // Tapping the episode you just finished toggles it back off.
              setEpisode(entry.anilistId, watched && episode === progress ? episode - 1 : episode);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${unitLabel} ${episode}${watched ? ', read' : ''}`}
            accessibilityHint={
              watched ? 'Marks this episode unwatched' : 'Marks everything up to here watched'
            }
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginHorizontal: spacing.gutter,
              marginBottom: spacing.sm,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: colors.surfaceContainerLow,
              borderLeftWidth: upNext ? 3 : 0,
              borderLeftColor: colors.primary,
              opacity: future ? 0.55 : 1,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="bodyMd" numberOfLines={1}>
                {`${episode}. ${unitLabel} ${episode}`}
              </Text>
              <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 2 }}>
                {episodeStatusLabel({ watched, upNext, future, airedAt: aired })}
              </Text>
            </View>

            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: watched ? colors.watchingGreen : colors.outlineVariant,
                backgroundColor: watched ? colors.watchingGreen + '22' : 'transparent',
              }}
            >
              <Ionicons
                name={watched ? 'checkmark' : upNext ? 'play' : 'ellipse-outline'}
                size={watched ? 16 : 12}
                color={watched ? colors.watchingGreen : colors.onSurfaceVariant}
              />
            </View>
          </Pressable>
        );
      })}

      {count > limit ? (
        <Pressable
          onPress={() => setLimit((value) => value + PAGE_MORE)}
          accessibilityRole="button"
          accessibilityLabel={`Show more episodes, ${count - limit} remaining`}
          style={{ paddingVertical: spacing.md, alignItems: 'center' }}
        >
          <Text variant="labelLg" colour={colors.primary} uppercase>
            {`Show ${Math.min(PAGE_MORE, count - limit)} more`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { useAiringInfo, useMalStats, useMedia } from '@/api/hooks';
import { mergeStreamingSources, streamingOptions } from '@/api/streaming';
import { formatScore } from '@/data/score';
import { resolveAlternateTitle, resolveTitle } from '@/data/titles';
import { airingLabel, formatLabel, toSnapshot } from '@/data/transforms';
import { STATUS_LABELS, STATUS_ORDER, type ListStatus } from '@/data/models';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { AiringPanel } from '@/features/title/components/AiringPanel';
import { EpisodeList } from '@/features/title/components/EpisodeList';
import {
  CharactersRail,
  RecommendationsRail,
  RelationsRail,
  StaffRail,
  StreamingRow,
} from '@/features/title/components/Rails';
import { Synopsis } from '@/features/title/components/Synopsis';
import { totalUnits, unitNoun, useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { aspect, hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { formatFuzzyDate } from '@/utils/time';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Cover } from '@/ui/Cover';
import { ScreenHeader } from '@/ui/Header';
import { ProgressBar, ScoreBadge, StatusPill } from '@/ui/Indicators';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Skeleton } from '@/ui/Skeleton';
import { ErrorState } from '@/ui/States';
import { Scrim } from '@/ui/Surfaces';
import { Text } from '@/ui/Text';

/**
 * F-02. The screen renders from the library snapshot the instant it opens - so
 * an offline user still sees cover, title and progress - then fills in the full
 * AniList payload when it arrives.
 */
export default function TitleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const anilistId = Number(id);
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  const settings = useSettingsStore((state) => state.settings);
  const entry = useLibraryStore((state) => state.entries[String(anilistId)] ?? null);
  const add = useLibraryStore((state) => state.add);
  const setStatus = useLibraryStore((state) => state.setStatus);
  const update = useLibraryStore((state) => state.update);
  const remove = useLibraryStore((state) => state.remove);
  const { logEpisode } = useProgressActions();

  const media = useMedia(Number.isFinite(anilistId) ? anilistId : null);
  const mal = useMalStats(media.data?.idMal ?? entry?.malId ?? null);
  // AnimeSchedule is looked up by AniList id, so no title matching (§4.6).
  const airing = useAiringInfo(Number.isFinite(anilistId) ? anilistId : null);

  const [statusOpen, setStatusOpen] = useState(false);

  const title = useMemo(
    () => resolveTitle(media.data?.title ?? entry?.snapshot.title, settings.titleLanguage),
    [media.data, entry, settings.titleLanguage],
  );
  const alternate = resolveAlternateTitle(
    media.data?.title ?? entry?.snapshot.title,
    settings.titleLanguage,
  );

  const coverUri =
    media.data?.coverImage?.extraLarge ??
    media.data?.coverImage?.large ??
    entry?.snapshot.coverImage ??
    null;
  const bannerUri = media.data?.bannerImage ?? entry?.snapshot.bannerImage ?? coverUri;

  const total = entry ? totalUnits(entry) : (media.data?.episodes ?? null);
  const nextAiring = media.data?.nextAiringEpisode ?? null;

  const streaming = useMemo(
    () =>
      mergeStreamingSources(
        streamingOptions(media.data?.externalLinks, settings.streamingRegion),
        airing.data?.streams ?? [],
        settings.streamingRegion,
      ),
    [media.data?.externalLinks, airing.data?.streams, settings.streamingRegion],
  );

  const recommendations = useMemo(
    () =>
      (media.data?.recommendations?.edges ?? [])
        .map((edge) => edge.node?.mediaRecommendation)
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [media.data?.recommendations],
  );

  const mainStudio = media.data?.studios?.edges?.find((edge) => edge.isMain)?.node.name ?? null;

  const addToLibrary = useCallback(
    (status: ListStatus) => {
      if (!media.data) {
        toast.error('Still loading this title. Try again in a second.');
        return;
      }
      if (entry) {
        setStatus(anilistId, status);
        toast.show('Moved to ' + STATUS_LABELS[status].toLowerCase(), 'success');
      } else {
        const created = add(media.data, status);
        // Fill in the AniList id cross-reference for Jikan lookups (§4.6).
        update(created.anilistId, { malId: media.data.idMal ?? null, snapshot: toSnapshot(media.data) });
        toast.show('Added to ' + STATUS_LABELS[status].toLowerCase(), 'success');
      }
      setStatusOpen(false);
    },
    [media.data, entry, anilistId, add, setStatus, update],
  );

  if (!Number.isFinite(anilistId)) {
    return (
      <Screen>
        <ScreenHeader title="Series details" showBack />
        <ErrorState error={new Error('Bad id')} />
      </Screen>
    );
  }

  if (media.isError && !entry) {
    return (
      <Screen>
        <ScreenHeader title="Series details" showBack />
        <ErrorState error={media.error} onRetry={() => void media.refetch()} />
      </Screen>
    );
  }

  const coverWidth = width * 0.32;
  const coverHeight = coverWidth / aspect.cover;

  return (
    <Screen>
      <ScreenHeader title="Series details" showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}
      >
        <View style={{ height: width * 0.52 }}>
          <Cover uri={bannerUri} radius={0} accessibilityLabel={title + ' banner'} />
          <Scrim height="70%" to="rgba(19,19,20,1)" />
        </View>

        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: spacing.gutter,
            marginTop: -coverHeight * 0.42,
          }}
        >
          <View>
            <Cover
              uri={coverUri}
              width={coverWidth}
              height={coverHeight}
              radius={radii.md}
              accessibilityLabel={title + ' cover art'}
            />
          </View>

          <View style={{ flex: 1, marginLeft: spacing.md, justifyContent: 'flex-end' }}>
            <Text variant="displayLgMobile" numberOfLines={3}>
              {title}
            </Text>
            {alternate ? (
              <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={1} style={{ marginTop: 2 }}>
                {alternate}
              </Text>
            ) : null}
            <Text variant="bodyMd" colour="onSurfaceVariant" style={{ marginTop: spacing.xs }}>
              {[
                formatLabel(media.data?.format ?? entry?.snapshot.format),
                media.data?.seasonYear ?? media.data?.startDate?.year ?? null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.gutter,
            marginTop: spacing.lg,
          }}
        >
          {entry ? (
            <Pressable
              onPress={() => setStatusOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={'Status: ' + STATUS_LABELS[entry.status] + '. Change it'}
            >
              <StatusPill status={entry.status} />
            </Pressable>
          ) : (
            <Chip label={airingLabel(media.data?.status)} />
          )}

          {media.data?.averageScore ? (
            <ScoreBadge score={(media.data.averageScore / 10).toFixed(1)} />
          ) : null}

          {entry?.score !== null && entry?.score !== undefined ? (
            <Chip
              label={'You: ' + formatScore(entry.score, settings.scoreFormat)}
              tint={colors.secondary}
            />
          ) : null}
        </View>

        <AiringPanel nextAiring={nextAiring} info={airing.data} />

        <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.lg }}>
          {entry ? (
            <>
              <Button
                label={
                  total !== null && entry.progress >= total
                    ? 'All ' + unitNoun(entry, true) + ' logged'
                    : 'Update progress (' + (entry.mediaType === 'MANGA' ? 'Ch ' : 'Ep ') + (entry.progress + 1) + ')'
                }
                icon={<Ionicons name="add" size={18} color={colors.onPrimary} />}
                disabled={total !== null && entry.progress >= total}
                onPress={() => logEpisode(entry.anilistId)}
                fullWidth
              />

              {total ? (
                <View style={{ marginTop: spacing.md }}>
                  <ProgressBar
                    value={entry.progress / total}
                    height={6}
                    accessibilityLabel={
                      Math.round((entry.progress / total) * 100) + ' percent watched'
                    }
                  />
                  <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: spacing.xs }}>
                    {entry.progress + ' of ' + total + ' ' + unitNoun(entry, true)}
                  </Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <Button
                  label="Edit entry"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/entry/[id]', params: { id: String(anilistId) } })
                  }
                />
                <Button label="Change list" variant="secondary" onPress={() => setStatusOpen(true)} />
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Start watching"
                icon={<Ionicons name="play" size={16} color={colors.onPrimary} />}
                onPress={() => addToLibrary('WATCHING')}
              />
              <Button label="Add to planning" variant="secondary" onPress={() => addToLibrary('PLANNING')} />
            </View>
          )}
        </View>

        {media.isLoading && !media.data ? (
          <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl, gap: spacing.sm }}>
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} width="70%" />
          </View>
        ) : (
          <>
            <View style={{ marginTop: spacing.xl }}>
              <Synopsis description={media.data?.description} />
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                paddingHorizontal: spacing.gutter,
                marginTop: spacing.md,
              }}
            >
              {(media.data?.genres ?? entry?.snapshot.genres ?? []).slice(0, 5).map((genre) => (
                <Chip key={genre} label={genre} compact />
              ))}
              {mainStudio ? <Chip label={mainStudio} compact tint={colors.tertiary} /> : null}
              {(media.data?.tags ?? [])
                .filter((tag) => !tag.isMediaSpoiler && !tag.isGeneralSpoiler)
                .slice(0, 8)
                .map((tag) => <Chip key={tag.id} label={tag.name} compact tint={colors.secondary} />)}
            </View>

            <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.lg, gap: spacing.xs }}>
              <MetaRow label="Aired" value={formatFuzzyDate(media.data?.startDate)} />
              <MetaRow label="Status" value={airingLabel(media.data?.status)} />
              <MetaRow
                label="Episodes"
                value={media.data?.episodes ? String(media.data.episodes) : 'Ongoing'}
              />
              {media.data?.duration ? (
                <MetaRow label="Runtime" value={media.data.duration + ' min'} />
              ) : null}
              {mal.data?.score ? (
                <MetaRow
                  label="MyAnimeList"
                  value={mal.data.score.toFixed(2) + (mal.data.rank ? '  ·  #' + mal.data.rank : '')}
                />
              ) : null}
            </View>

            <StreamingRow options={streaming} />

            <EpisodeList
              entry={entry}
              totalEpisodes={
                media.data?.type === 'MANGA'
                  ? media.data.chapters ?? entry?.snapshot.totalChapters ?? null
                  : media.data?.episodes ?? entry?.snapshot.totalEpisodes ?? null
              }
              schedule={media.data?.airingSchedule?.nodes}
              mediaType={media.data?.type ?? entry?.mediaType ?? 'ANIME'}
              onRequireEntry={() => addToLibrary('WATCHING')}
            />

            <CharactersRail edges={media.data?.characters?.edges} />
            <StaffRail edges={media.data?.staff?.edges} />
            <RelationsRail edges={media.data?.relations?.edges} />
            <RecommendationsRail items={recommendations} />

            {entry ? (
              <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl }}>
                <Button
                  label="Remove from library"
                  variant="danger"
                  fullWidth
                  onPress={() => {
                    const removed = remove(anilistId);
                    if (removed) {
                      toast.undo('Removed ' + title, () => useLibraryStore.getState().restore(removed));
                    }
                  }}
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* DIAGNOSTIC PROBE: hero overlay disabled entirely */ null}

      <Sheet visible={statusOpen} onClose={() => setStatusOpen(false)} title="Move to list">
        {STATUS_ORDER.map((status) => (
          <Pressable
            key={status}
            onPress={() => addToLibrary(status)}
            accessibilityRole="radio"
            accessibilityState={{ selected: entry?.status === status }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: hairline,
            }}
          >
            <StatusPill status={status} />
            <View style={{ flex: 1 }} />
            {entry?.status === status ? (
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
        {label}
      </Text>
      <Text variant="bodyMd">{value}</Text>
    </View>
  );
}

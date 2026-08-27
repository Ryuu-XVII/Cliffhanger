import React, { useMemo } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { STATUS_LABELS, STATUS_ORDER } from '@/data/models';
import { formatScore } from '@/data/score';
import { computeStats } from '@/features/stats/compute';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { STATUS_COLOURS } from '@/ui/Indicators';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-19. Charts are drawn with plain SVG rather than a charting dependency: the
 * shapes are simple, and every mark can then use the theme accent so the
 * screen reads as part of the same system.
 */
export default function StatsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const entries = useLibraryStore((state) => state.entries);
  const scoreFormat = useSettingsStore((state) => state.settings.scoreFormat);

  const stats = useMemo(() => computeStats(Object.values(entries)), [entries]);
  const chartWidth = width - spacing.gutter * 2 - spacing.md * 2;

  if (stats.totalEntries === 0) {
    return (
      <Screen>
        <ScreenHeader title="Stats" showBack />
        <EmptyState
          icon="stats-chart-outline"
          title="Nothing to measure yet"
          message="Log a few episodes and this fills up with your watch history."
        />
      </Screen>
    );
  }

  const maxHistogram = Math.max(...stats.scoreHistogram.map((bar) => bar.count), 1);
  const totalStatus = Object.values(stats.statusCounts).reduce((sum, count) => sum + count, 0);

  return (
    <Screen>
      <ScreenHeader title="Stats" showBack />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter }}>
          <Tile label="Episodes" value={String(stats.episodesWatched)} />
          <Tile
            label="Days watched"
            value={stats.daysWatched >= 1 ? stats.daysWatched.toFixed(1) : stats.daysWatched.toFixed(2)}
            hint="Estimated"
          />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter, marginTop: spacing.sm }}>
          <Tile
            label="Mean score"
            value={stats.meanScore === null ? '--' : formatScore(stats.meanScore, scoreFormat)}
            hint={stats.scoredCount + ' scored'}
          />
          <Tile
            label="Completion"
            value={Math.round(stats.completionRate * 100) + '%'}
            hint="Of everything started"
          />
        </View>

        <Card title="Your lists">
          {STATUS_ORDER.map((status) => {
            const count = stats.statusCounts[status];
            const share = totalStatus > 0 ? count / totalStatus : 0;
            return (
              <View key={status} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodyMd">{STATUS_LABELS[status]}</Text>
                  <Text variant="bodyMd" colour="onSurfaceVariant">
                    {String(count)}
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    marginTop: 4,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Number((share * 100).toFixed(1))}%`,
                      height: '100%',
                      backgroundColor: STATUS_COLOURS[status],
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Card>

        <Card title="Score spread" hint="How you rate, out of 100">
          <Svg width={chartWidth} height={140}>
            {stats.scoreHistogram.map((bar, index) => {
              const barWidth = chartWidth / stats.scoreHistogram.length - 4;
              const height = (bar.count / maxHistogram) * 120;
              return (
                <Rect
                  key={bar.bucket}
                  x={index * (chartWidth / stats.scoreHistogram.length)}
                  y={130 - height}
                  width={barWidth}
                  height={Math.max(height, bar.count > 0 ? 3 : 1)}
                  rx={3}
                  fill={bar.count > 0 ? colors.primary : 'rgba(255,255,255,0.07)'}
                />
              );
            })}
          </Svg>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="labelSm" colour="onSurfaceVariant">
              10
            </Text>
            <Text variant="labelSm" colour="onSurfaceVariant">
              100
            </Text>
          </View>
        </Card>

        <Card title="Genres" hint="Across everything in your library">
          {stats.genreBreakdown.map((genre) => (
            <View key={genre.genre} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodyMd">{genre.genre}</Text>
                <Text variant="bodyMd" colour="onSurfaceVariant">
                  {Math.round(genre.share * 100) + '%'}
                </Text>
              </View>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  marginTop: 4,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Number((genre.share * 100).toFixed(1))}%`,
                    height: '100%',
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            </View>
          ))}
        </Card>

        <Card title="Rewatches">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width={64} height={64}>
              <Circle cx={32} cy={32} r={26} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
              <Circle
                cx={32}
                cy={32}
                r={26}
                stroke={colors.tertiary}
                strokeWidth={6}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={
                  2 * Math.PI * 26 * (1 - Math.min(1, stats.rewatchTotal / Math.max(stats.totalEntries, 1)))
                }
                transform="rotate(-90 32 32)"
              />
            </Svg>
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text variant="headlineMd">{String(stats.rewatchTotal)}</Text>
              <Text variant="labelSm" colour="onSurfaceVariant">
                {stats.rewatchTotal === 1 ? 'rewatch logged' : 'rewatches logged'}
              </Text>
            </View>
          </View>
        </Card>

        <Text
          variant="labelSm"
          colour="onSurfaceVariant"
          style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.lg }}
        >
          Days watched assumes 24 minutes an episode and 105 minutes a film, since AniList does not
          publish a runtime for every entry.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Text variant="displayLgMobile">{value}</Text>
      <Text variant="labelSm" colour="onSurfaceVariant" uppercase>
        {label}
      </Text>
      {hint ? (
        <Text variant="labelSm" colour={colors.outline}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginHorizontal: spacing.gutter,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Text variant="headlineSm">{title}</Text>
      {hint ? (
        <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginBottom: spacing.md }}>
          {hint}
        </Text>
      ) : (
        <View style={{ height: spacing.md }} />
      )}
      {children}
    </View>
  );
}

import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spring, timing, useReducedMotion } from '@/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { hairline, palette, radii, spacing } from '@/theme/tokens';
import type { ListStatus } from '@/data/models';
import { STATUS_LABELS } from '@/data/models';
import { Text } from './Text';

/** Status colours come from DESIGN.md and are deliberately desaturated. */
export const STATUS_COLOURS: Record<ListStatus, string> = {
  WATCHING: palette.watchingGreen,
  PLANNING: palette.planningBlue,
  COMPLETED: palette.primary,
  ON_HOLD: palette.onHoldYellow,
  DROPPED: palette.droppedRed,
  REWATCHING: palette.tertiary,
};

export function StatusDot({ status, size = 8 }: { status: ListStatus; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: STATUS_COLOURS[status],
      }}
    />
  );
}

/** Hex alpha suffixes for the pill's tonal border and fill. */
const PILL_BORDER_ALPHA = '55';
const PILL_FILL_ALPHA = '1F';

export function StatusPill({ status, style }: { status: ListStatus; style?: ViewStyle }) {
  const colour = STATUS_COLOURS[status];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${STATUS_LABELS[status]}`}
      style={[
        styles.pill,
        {
          borderColor: `${colour}${PILL_BORDER_ALPHA}`,
          backgroundColor: `${colour}${PILL_FILL_ALPHA}`,
        },
        style ?? {},
      ]}
    >
      <StatusDot status={status} />
      <Text variant="labelSm" colour={colour} uppercase style={{ marginLeft: spacing.xs + 2 }}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

export function ScoreBadge({
  score,
  style,
  compact = false,
}: {
  score: string;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Score ${score}`}
      style={[
        styles.score,
        {
          backgroundColor: 'rgba(0,0,0,0.6)',
          paddingVertical: compact ? 2 : spacing.xs,
          paddingHorizontal: compact ? spacing.xs + 2 : spacing.sm,
        },
        style ?? {},
      ]}
    >
      <Text variant="labelSm" colour={colors.secondary}>
        {'★'}
      </Text>
      <Text variant={compact ? 'labelSm' : 'labelLg'} colour="onSurface" style={{ marginLeft: 4 }}>
        {score}
      </Text>
    </View>
  );
}

export interface ProgressBarProps {
  /** 0 to 1. Values outside are clamped rather than overflowing the track. */
  value: number;
  height?: number;
  tint?: string;
  trackColour?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * Springs to its new fill so incrementing an episode reads as motion, not a
 * jump - and collapses to a timing curve under reduced motion.
 *
 * The fill's width is static at 100%; only `transform: scaleX` animates,
 * anchored to the left edge via `transformOrigin`. `width` is a layout
 * property on Fabric and animating it drives a relayout every frame - the
 * same class of native-thread cost that produced a genuine ANR in the
 * shared-element hero transition (see src/features/title/hero.tsx). This
 * component renders once per library card, so the cost would have multiplied
 * by however many are on screen; `transform` is compositor-only regardless
 * of instance count.
 */
export function ProgressBar({
  value,
  height = 4,
  tint,
  trackColour,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const target = clamp(value);
  const progress = useSharedValue(target);

  useEffect(() => {
    progress.value = reduced
      ? withTiming(target, timing.reduced)
      : withSpring(target, spring.snappy);
  }, [target, reduced, progress]);

  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(target * 100), min: 0, max: 100 }}
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: trackColour ?? 'rgba(255,255,255,0.10)',
          overflow: 'hidden',
        },
        style ?? {},
      ]}
    >
      <Animated.View
        style={[
          {
            width: '100%',
            height: '100%',
            borderRadius: height / 2,
            backgroundColor: tint ?? colors.primary,
            transformOrigin: 'left',
          },
          fill,
        ]}
      />
    </View>
  );
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    alignSelf: 'flex-start',
  },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    alignSelf: 'flex-start',
  },
});

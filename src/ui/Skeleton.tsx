import React, { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/motion';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * §7 requires skeletons, not spinners, wherever the content shape is known.
 * The shimmer is a single looping opacity - cheap, and it stops entirely under
 * reduced motion so nothing pulses at a user who asked for stillness.
 */
export function Skeleton({
  width,
  height,
  radius = radii.DEFAULT,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse);
      pulse.value = 0.45;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.25 }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width ?? '100%',
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceContainerHigh,
        },
        style ?? {},
        animated,
      ]}
    />
  );
}

/** Matches the 2:3 library card so the swap from skeleton to art is seamless. */
export function SkeletonCard({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <Skeleton width={width} height={width * 1.5} radius={radii.md} />
      <Skeleton height={14} style={{ marginTop: spacing.sm }} />
      <Skeleton width={width * 0.6} height={12} style={{ marginTop: spacing.xs }} />
    </View>
  );
}

export function SkeletonRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
      <Skeleton width={56} height={84} radius={radii.DEFAULT} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Skeleton height={16} />
        <Skeleton width={'50%'} height={12} style={{ marginTop: spacing.sm }} />
        <Skeleton height={4} style={{ marginTop: spacing.md }} />
      </View>
    </View>
  );
}

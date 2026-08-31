import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics, spring, timing, useReducedMotion } from '@/motion';
import { hairlineStrong, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/**
 * THE signature interaction (F-05, §9).
 *
 * One tap from the home screen logs an episode. The response is a spring-driven
 * pop, a burst of accent particles and a haptic tick - all on the UI thread, so
 * it lands well inside the 100ms feedback budget even while the JS thread is
 * busy writing to storage and queueing a sync.
 */

const PARTICLE_COUNT = 8;

export interface IncrementButtonProps {
  onIncrement: () => void;
  disabled?: boolean;
  size?: number;
  /** Rendered inside the ring, e.g. "12 / 24". */
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
  /** Suppresses the burst when the tap was a no-op (already at the last episode). */
  celebrate?: boolean;
}

export function IncrementButton({
  onIncrement,
  disabled = false,
  size = 52,
  accessibilityLabel,
  accessibilityHint = 'Logs one episode',
  style,
  testID,
  celebrate = true,
}: IncrementButtonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const scale = useSharedValue(1);
  const burst = useSharedValue(0);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
        return { x: Math.cos(angle), y: Math.sin(angle), key: `p${index}` };
      }),
    [],
  );

  const handlePress = useCallback(() => {
    if (disabled) return;

    // Feedback first, work second. The state update below is synchronous but
    // the animation must not wait on it under any circumstance.
    haptics.tick();

    if (reduced) {
      scale.value = withSequence(
        withTiming(0.94, timing.reduced),
        withTiming(1, timing.reduced),
      );
    } else {
      scale.value = withSequence(
        withSpring(0.88, { damping: 14, stiffness: 500 }),
        withSpring(1, spring.pop),
      );
      if (celebrate) {
        burst.value = 0;
        burst.value = withTiming(1, { duration: 520 });
      }
    }

    onIncrement();
  }, [disabled, reduced, onIncrement, scale, burst, celebrate]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[{ width: size, height: size }, style ?? {}]}>
      {!reduced &&
        particles.map((particle) => (
          <Particle key={particle.key} progress={burst} vector={particle} size={size} colour={colors.primary} />
        ))}

      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        <Pressable
          testID={testID}
          onPress={handlePress}
          disabled={disabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: disabled ? 'rgba(255,255,255,0.08)' : colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: hairlineStrong,
          }}
        >
          <Ionicons
            name="add"
            size={size * 0.46}
            color={disabled ? colors.outline : colors.onPrimary}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Particle({
  progress,
  vector,
  size,
  colour,
}: {
  progress: SharedValue<number>;
  vector: { x: number; y: number };
  size: number;
  colour: string;
}) {
  const style = useAnimatedStyle(() => {
    const distance = size * 0.85 * progress.value;
    return {
      opacity: progress.value === 0 ? 0 : 1 - progress.value,
      transform: [
        { translateX: vector.x * distance },
        { translateY: vector.y * distance },
        { scale: 1 - progress.value * 0.6 },
      ],
    };
  }, [size]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: size / 2 - 3,
          top: size / 2 - 3,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colour,
        },
        style,
      ]}
    />
  );
}

export interface EpisodeCounterProps {
  progress: number;
  total: number | null;
  onIncrement: () => void;
  onDecrement: () => void;
  unit?: string;
  disabled?: boolean;
}

/**
 * The large counter used on the detail and edit screens. The number itself
 * springs on change (DESIGN.md, The Incrementer) and announces politely to
 * screen readers rather than firing on every tap.
 */
export function EpisodeCounter({
  progress,
  total,
  onIncrement,
  onDecrement,
  unit = 'Episodes',
  disabled = false,
}: EpisodeCounterProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const previous = useRef(progress);

  useEffect(() => {
    if (previous.current === progress) return;
    previous.current = progress;
    if (reduced) return;
    pop.value = withSequence(
      withSpring(1.18, { damping: 10, stiffness: 420 }),
      withSpring(1, spring.pop),
    );
  }, [progress, reduced, pop]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const atStart = progress <= 0;
  const atEnd = total !== null && progress >= total;
  const singularUnit = unit.toLowerCase().replace(/s$/, '');

  return (
    <View style={styles.counter}>
      <StepButton
        icon="remove"
        onPress={onDecrement}
        disabled={disabled || atStart}
        label={`Remove one ${singularUnit}`}
      />

      <View style={{ alignItems: 'center', minWidth: 128 }}>
        <Animated.View style={numberStyle}>
          <Text variant="displayLg" colour={colors.onSurface}>
            {progress}
            <Text variant="headlineSm" colour="onSurfaceVariant">
              {total ? ` / ${total}` : ''}
            </Text>
          </Text>
        </Animated.View>
        <Text variant="labelSm" colour="onSurfaceVariant" uppercase>
          {unit}
        </Text>
      </View>

      <StepButton
        icon="add"
        onPress={onIncrement}
        disabled={disabled || atEnd}
        label={`Add one ${singularUnit}`}
        primary
      />
    </View>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
  label,
  primary = false,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
  disabled: boolean;
  label: string;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function resolveBackground(): string {
    if (!primary) return 'rgba(255,255,255,0.06)';
    if (disabled) return 'rgba(255,255,255,0.08)';
    return colors.primary;
  }

  const press = () => {
    if (disabled) return;
    haptics.tick();
    scale.value = reduced
      ? withTiming(1, timing.reduced)
      : withSequence(withSpring(0.86, { damping: 16, stiffness: 500 }), withSpring(1, spring.pop));
    onPress();
  };

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={press}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        hitSlop={8}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: hairlineStrong,
          backgroundColor: resolveBackground(),
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Ionicons
          name={icon}
          size={24}
          color={primary && !disabled ? colors.onPrimary : colors.onSurface}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
  },
});


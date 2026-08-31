import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics, spring, timing, useReducedMotion } from '@/motion';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

/**
 * §9 "Completing a series: an orchestrated moment - one well-designed
 * celebration beats scattered confetti."
 *
 * One expanding ring, one settling checkmark, one line of copy. Reduced motion
 * gets the same moment as a still card, and the overlay never blocks input for
 * longer than it takes to read.
 */
export interface CelebrationProps {
  visible: boolean;
  title: string;
  /** Shown when the completion closed out a rewatch (F-17). */
  rewatchCount?: number;
  onDismiss: () => void;
  onRate?: () => void;
}

export function Celebration({
  visible,
  title,
  rewatchCount,
  onDismiss,
  onRate,
}: CelebrationProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const ring = useSharedValue(0);
  const mark = useSharedValue(0);
  const card = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      ring.value = 0;
      mark.value = 0;
      card.value = 0;
      return;
    }

    haptics.celebrate();

    if (reduced) {
      ring.value = withTiming(1, timing.reduced);
      mark.value = withTiming(1, timing.reduced);
      card.value = withTiming(1, timing.reduced);
      return;
    }

    ring.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    mark.value = withDelay(
      160,
      withSequence(withSpring(1.15, { damping: 9, stiffness: 300 }), withSpring(1, spring.pop)),
    );
    card.value = withDelay(240, withSpring(1, spring.weighty));
  }, [visible, reduced, ring, mark, card]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - ring.value,
    transform: [{ scale: 0.4 + ring.value * 2.2 }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mark.value }],
    opacity: mark.value === 0 ? 0 : 1,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: card.value,
    transform: [{ translateY: (1 - card.value) * 24 }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <LinearGradient
          colors={['rgba(0,0,0,0.86)', 'rgba(20,0,40,0.94)']}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.centre} accessible accessibilityLiveRegion="assertive">
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              { borderColor: colors.primary },
              ringStyle,
            ]}
          />

          <Animated.View
            style={[styles.mark, { backgroundColor: colors.primary }, markStyle]}
          >
            <Ionicons name="checkmark" size={44} color={colors.onPrimary} />
          </Animated.View>

          <Animated.View style={[{ alignItems: 'center', marginTop: spacing.xl }, cardStyle]}>
            <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
              {rewatchCount !== undefined && rewatchCount > 0
                ? `Rewatch ${rewatchCount} finished`
                : 'Series complete'}
            </Text>
            <Text
              variant="displayLgMobile"
              align="center"
              style={{ marginTop: spacing.sm, maxWidth: 300 }}
              numberOfLines={3}
            >
              {title}
            </Text>

            <View style={{ flexDirection: 'row', marginTop: spacing.lg, gap: spacing.sm }}>
              {onRate ? <Button label="Rate it" onPress={onRate} /> : null}
              <Button label="Done" variant="secondary" onPress={onDismiss} />
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  ring: {
    position: 'absolute',
    top: '32%',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  mark: {
    width: 88,
    height: 88,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react';
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spring, timing, useReducedMotion } from '@/motion';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/**
 * A physics-based bottom sheet. The drag tracks the finger one-to-one and the
 * dismiss decision uses velocity, not just distance, so a quick flick closes it
 * the way the platform sheets do.
 */
/** Drag distance (px) past which releasing dismisses the sheet. */
const DISMISS_DISTANCE = 120;
/** Flick speed (px/s) that dismisses regardless of how far the sheet moved. */
const DISMISS_VELOCITY = 900;
/** Far enough below the fold that the sheet is off screen on any phone. */
const OFFSCREEN_Y = 600;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Sheet({ visible, onClose, title, children, style }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const translateY = useSharedValue(0);

  const close = () => {
    translateY.value = 0;
    onClose();
  };

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldClose =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        translateY.value = withTiming(
          OFFSCREEN_Y,
          reduced ? timing.reduced : { duration: 180 },
          () => runOnJS(close)(),
        );
      } else {
        translateY.value = withSpring(0, spring.weighty);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'fade' : 'slide'}
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
        </Pressable>

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surfaceContainerLow,
                paddingBottom: insets.bottom + spacing.lg,
                borderColor: hairline,
              },
              sheetStyle,
              style ?? {},
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.outlineVariant }]} />
            {title ? (
              <Text variant="headlineSm" style={{ marginBottom: spacing.md }}>
                {title}
              </Text>
            ) : null}
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
});

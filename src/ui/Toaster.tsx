import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOutDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/motion';
import { useToastStore, type Toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Glass } from './Surfaces';
import { Text } from './Text';

/**
 * Toasts sit above the floating tab bar and never block input (§9 constraint).
 * The Undo action is a real button so screen-reader users can reach it.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: insets.bottom + 96 }]}
    >
      {toasts.map((toast) => (
        <ToastRow
          key={toast.id}
          toast={toast}
          onDismiss={() => dismiss(toast.id)}
          reduced={reduced}
        />
      ))}
    </View>
  );
}

function ToastRow({
  toast,
  onDismiss,
  reduced,
}: {
  toast: Toast;
  onDismiss: () => void;
  reduced: boolean;
}) {
  const { colors } = useTheme();

  const toneColour = {
    neutral: colors.onSurface,
    success: colors.watchingGreen,
    warning: colors.onHoldYellow,
    error: colors.error,
  }[toast.tone];

  return (
    <Animated.View
      entering={reduced ? undefined : SlideInDown.springify().damping(20).stiffness(240)}
      exiting={reduced ? undefined : FadeOutDown.duration(180)}
      accessibilityLiveRegion="polite"
      style={{ marginTop: spacing.sm }}
    >
      <Glass radius={radii.md} style={{ borderColor: hairline }}>
        <View style={styles.row}>
          <View style={[styles.tone, { backgroundColor: toneColour }]} />
          <Text variant="bodyMd" style={{ flex: 1, marginHorizontal: spacing.md }} numberOfLines={2}>
            {toast.message}
          </Text>

          {toast.action ? (
            <Pressable
              onPress={() => {
                toast.action?.onPress();
                onDismiss();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
            >
              <Text variant="labelLg" colour={colors.primary} uppercase>
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.gutter,
    right: spacing.gutter,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md - 2,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  tone: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable } from 'react-native';

import { radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A circular icon button for stepping through an ordered sequence: seasons,
 * result pages, anything with a clear previous/next. One shared control so
 * every "step through a list" interaction in the app looks and taps the same
 * way, rather than some screens using this and others using bare text links
 * (which read as lower-priority actions and give the thumb a much smaller
 * target than a real button).
 */
export function Stepper({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: 40,
        height: 40,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainerHigh,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  /** Tonal accent, e.g. a status colour. */
  tint?: string;
  compact?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * Pill-shaped, low-contrast tonal background (DESIGN.md, Chips). Genres and
 * filters use these; they must never compete with cover art.
 */
export function Chip({
  label,
  onPress,
  selected = false,
  tint,
  compact = false,
  style,
  accessibilityLabel,
}: ChipProps) {
  const { colors } = useTheme();

  const background = selected
    ? (tint ?? colors.primaryContainer)
    : 'rgba(255,255,255,0.06)';
  const foreground = selected
    ? tint
      ? colors.onSurface
      : colors.onPrimaryContainer
    : (tint ?? colors.onSurfaceVariant);

  const body = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: background,
          borderColor: selected ? 'transparent' : hairline,
          paddingVertical: compact ? spacing.xs : spacing.sm,
          paddingHorizontal: compact ? spacing.sm + 2 : spacing.md,
        },
        style ?? {},
      ]}
    >
      <Text variant={compact ? 'labelSm' : 'labelLg'} colour={foreground}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? label}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      rotateTo={0}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={{ borderRadius: radii.full }}
    >
      {body}
    </PressableScale>
  );
}

export type TriChipState = 'neutral' | 'included' | 'excluded';

/**
 * A chip that cycles neutral -> included -> excluded on tap.
 *
 * Filters like genres and tags need both "must have" and "must not have", and
 * two parallel lists of the same 400 values would double an already long
 * screen. Exclusion reads as a struck-through label on an error-tinted pill so
 * it is never mistaken for a selection.
 */
export function TriChip({
  label,
  state,
  onPress,
  compact = true,
  style,
}: {
  label: string;
  state: TriChipState;
  onPress: () => void;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();

  const background =
    state === 'included'
      ? colors.primaryContainer
      : state === 'excluded'
        ? colors.errorContainer
        : 'rgba(255,255,255,0.06)';
  const foreground =
    state === 'included'
      ? colors.onPrimaryContainer
      : state === 'excluded'
        ? colors.onErrorContainer
        : colors.onSurfaceVariant;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      rotateTo={0}
      accessibilityRole="button"
      accessibilityLabel={
        label +
        (state === 'included' ? ', included' : state === 'excluded' ? ', excluded' : '')
      }
      accessibilityHint={
        state === 'neutral'
          ? 'Tap to include'
          : state === 'included'
            ? 'Tap to exclude'
            : 'Tap to clear'
      }
      accessibilityState={{ selected: state !== 'neutral' }}
      style={{ borderRadius: radii.full }}
    >
      <View
        style={[
          styles.chip,
          {
            backgroundColor: background,
            borderColor: state === 'neutral' ? hairline : 'transparent',
            paddingVertical: compact ? spacing.xs : spacing.sm,
            paddingHorizontal: compact ? spacing.sm + 2 : spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
          },
          style ?? {},
        ]}
      >
        {state === 'excluded' ? (
          <Text variant={compact ? 'labelSm' : 'labelLg'} colour={foreground} style={{ marginRight: 3 }}>
            −
          </Text>
        ) : null}
        <Text
          variant={compact ? 'labelSm' : 'labelLg'}
          colour={foreground}
          style={state === 'excluded' ? { textDecorationLine: 'line-through' } : undefined}
        >
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

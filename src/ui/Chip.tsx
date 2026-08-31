import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

function chipPadding(compact: boolean) {
  return {
    paddingVertical: compact ? spacing.xs : spacing.sm,
    paddingHorizontal: compact ? spacing.sm + 2 : spacing.md,
  };
}

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

  function resolveForeground(): string {
    if (!selected) return tint ?? colors.onSurfaceVariant;
    if (tint) return colors.onSurface;
    return colors.onPrimaryContainer;
  }

  const background = selected
    ? (tint ?? colors.primaryContainer)
    : 'rgba(255,255,255,0.06)';
  const foreground = resolveForeground();

  const body = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: background,
          borderColor: selected ? 'transparent' : hairline,
          ...chipPadding(compact),
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

  const backgrounds: Record<TriChipState, string> = {
    neutral: 'rgba(255,255,255,0.06)',
    included: colors.primaryContainer,
    excluded: colors.errorContainer,
  };
  const foregrounds: Record<TriChipState, string> = {
    neutral: colors.onSurfaceVariant,
    included: colors.onPrimaryContainer,
    excluded: colors.onErrorContainer,
  };
  const stateSuffixes: Record<TriChipState, string> = {
    neutral: '',
    included: ', included',
    excluded: ', excluded',
  };
  const hints: Record<TriChipState, string> = {
    neutral: 'Tap to include',
    included: 'Tap to exclude',
    excluded: 'Tap to clear',
  };

  const background = backgrounds[state];
  const foreground = foregrounds[state];

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      rotateTo={0}
      accessibilityRole="button"
      accessibilityLabel={`${label}${stateSuffixes[state]}`}
      accessibilityHint={hints[state]}
      accessibilityState={{ selected: state !== 'neutral' }}
      style={{ borderRadius: radii.full }}
    >
      <View
        style={[
          styles.chip,
          {
            backgroundColor: background,
            borderColor: state === 'neutral' ? hairline : 'transparent',
            ...chipPadding(compact),
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

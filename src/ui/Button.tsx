import React from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';

import { hairlineStrong, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * DESIGN.md buttons: primary is solid with high-contrast text and no shadow;
 * secondary is a glass tint; tertiary is a ghost with a bold Syne label.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();

  const tones: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: 'transparent' },
    secondary: { bg: 'rgba(255,255,255,0.10)', fg: colors.onSurface, border: hairlineStrong },
    tertiary: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.errorContainer, fg: colors.onErrorContainer, border: 'transparent' },
  };

  const tone = tones[variant];
  const inactive = disabled || loading;

  return (
    <PressableScale
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      scaleTo={0.97}
      rotateTo={0}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: inactive ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style ?? {},
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={tone.fg} />
        ) : (
          <>
            {icon}
            <Text
              variant={variant === 'tertiary' ? 'headlineSm' : 'labelLg'}
              colour={tone.fg}
              style={icon ? { marginLeft: spacing.sm } : undefined}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.DEFAULT,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48, // Touch target floor.
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

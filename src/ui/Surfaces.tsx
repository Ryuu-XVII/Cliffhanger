import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { blurIntensity, hairline, radii, spacing } from '@/theme/tokens';

/**
 * The elevation levels from DESIGN.md, as components.
 * Level 0 The Void, 2 The Glass, 3 The Focus (shared-element hero, handled by
 * the transition itself rather than a container). Level 1 "The Plate" had a
 * component here too, but nothing ever rendered it - screens compose that
 * surface inline - so it was removed rather than left as a decoy.
 */

export interface GlassProps extends ViewProps {
  radius?: number;
  intensity?: number;
  /** Falls back to a solid tint where blur is unavailable or too costly. */
  solidFallback?: boolean;
}

/** Level 2 - semi-transparent, 20px backdrop blur. Nav bars and floating controls. */
export function Glass({
  radius = radii.lg,
  intensity = blurIntensity.glass,
  solidFallback = false,
  style,
  children,
  ...rest
}: GlassProps) {
  const { colors } = useTheme();

  const shell: ViewStyle = {
    borderRadius: radius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
  };

  // Android blur is expensive and can drop frames on long lists; the tinted
  // surface reads almost identically against the near-black background.
  if (solidFallback || Platform.OS === 'android') {
    return (
      <View {...rest} style={[shell, { backgroundColor: colors.surfaceGlass }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View {...rest} style={[shell, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={{ backgroundColor: 'rgba(24,24,27,0.35)' }}>{children}</View>
    </View>
  );
}

/**
 * The scrim that lets white type sit on arbitrary cover art and still clear AA
 * contrast. Cover art is the primary material (§10) so we darken rather than
 * cover it.
 */
export function Scrim({
  height,
  style,
  from = 'rgba(0,0,0,0)',
  to = 'rgba(0,0,0,0.92)',
}: {
  height?: DimensionValue;
  style?: ViewStyle;
  from?: string;
  to?: string;
}) {
  return (
    <LinearGradient
      colors={[from, to]}
      locations={[0, 1]}
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height ?? '60%' }, style]}
    />
  );
}

/** Thin divider used sparingly - depth is tonal, not lines. */
export function Divider({ style }: { style?: ViewStyle }) {
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: hairline, marginVertical: spacing.md },
        style,
      ]}
    />
  );
}

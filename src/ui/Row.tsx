import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { hairline, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** A settings/navigation row. One implementation, used by every list screen. */
export function Row({
  icon,
  label,
  hint,
  onPress,
  destructive = false,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: colors.surfaceContainerLow,
        borderBottomWidth: 1,
        borderBottomColor: hairline,
        // Row is used interchangeably for navigation and plain info display -
        // without a visual cue, an info-only row (no onPress) sitting next to
        // tappable ones in the same list reads as a broken link rather than
        // as intentionally inert.
        opacity: onPress ? 1 : 0.55,
      }}
    >
      <Ionicons name={icon} size={20} color={destructive ? colors.error : colors.primary} />

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text variant="bodyMd" colour={destructive ? colors.error : colors.onSurface}>
          {label}
        </Text>
        {hint ? (
          <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>

      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.outline} /> : null)}
    </Pressable>
  );
}

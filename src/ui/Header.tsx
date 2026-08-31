import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/**
 * The app bar from the mockups: a small brand tile, a Syne uppercase title, and
 * the account avatar on the right. Back-capable screens swap the tile for an
 * arrow. Deliberately flat - depth belongs to the content, not the chrome.
 */
export interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  onAvatarPress?: () => void;
  avatarLabel?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({
  title,
  showBack = false,
  onAvatarPress,
  avatarLabel = 'A',
  right,
  style,
}: ScreenHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + spacing.sm, backgroundColor: colors.background },
        style ?? {},
      ]}
    >
      <View style={styles.left}>
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ marginRight: spacing.sm }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>
        ) : null}

        <View style={[styles.brand, { backgroundColor: colors.surfaceContainerHigh }]}>
          <Ionicons name="albums" size={14} color={colors.primary} />
        </View>

        <Text variant="headlineMd" uppercase numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
      </View>

      <View style={styles.right}>
        {right}
        {onAvatarPress ? (
          <Pressable
            onPress={onAvatarPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            style={[styles.avatar, { borderColor: hairline, backgroundColor: colors.surfaceContainerHigh }]}
          >
            <Text variant="labelLg" colour={colors.primary}>
              {avatarLabel.slice(0, 1).toUpperCase()}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, style ?? {}]}>
      <Text variant="displayLgMobile" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${title}`}
        >
          <Text variant="labelLg" colour={colors.primary}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: {
    width: 30,
    height: 30,
    borderRadius: radii.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    marginBottom: spacing.md,
  },
});

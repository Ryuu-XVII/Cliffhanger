import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

/**
 * §5 - prompt to upgrade an anonymous session after a meaningful amount of
 * logging, never on first launch. It is dismissible and it never blocks the
 * app; the anonymous library keeps working either way.
 */
export function UpgradePrompt() {
  const router = useRouter();
  const { colors } = useTheme();

  const entryCount = useLibraryStore((state) => Object.keys(state.entries).length);
  const shouldPrompt = useAuthStore((state) => state.shouldPromptUpgrade(entryCount));
  const dismiss = useAuthStore((state) => state.markUpgradePromptShown);

  if (!shouldPrompt) return null;

  return (
    <View
      style={{
        marginHorizontal: spacing.gutter,
        marginBottom: spacing.md,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="cloud-done-outline" size={18} color={colors.primary} />
        <Text variant="headlineSm" style={{ flex: 1, marginLeft: spacing.sm }}>
          Keep this library safe
        </Text>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <Text variant="bodyMd" colour="onSurfaceVariant" style={{ marginTop: spacing.sm }}>
        {`${entryCount} titles are stored on this device only. Create an account and they sync everywhere, with nothing lost.`}
      </Text>

      <Button
        label="Create account"
        onPress={() => {
          dismiss();
          router.push('/auth');
        }}
        style={{ marginTop: spacing.md }}
      />
    </View>
  );
}

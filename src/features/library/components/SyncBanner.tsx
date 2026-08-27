import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { useLibraryStore } from '@/stores/libraryStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui/Text';

/**
 * F-10 requires a clear sync-pending indicator. It appears only when there is
 * something to say - queued writes or a conflict - and never as permanent
 * chrome, because a badge that is always there stops being read.
 */
export function SyncBanner() {
  const pending = useLibraryStore((state) => state.pending);
  const syncing = useLibraryStore((state) => state.syncing);
  const conflict = useLibraryStore((state) => state.conflictWarning);
  const dismissConflict = useLibraryStore((state) => state.dismissConflict);
  const sync = useLibraryStore((state) => state.sync);
  const { colors } = useTheme();

  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected !== true);
    });
    return unsubscribe;
  }, []);

  if (conflict) {
    return (
      <Banner
        icon="git-compare-outline"
        tone={colors.onHoldYellow}
        message={conflict}
        actionLabel="Dismiss"
        onPress={dismissConflict}
      />
    );
  }

  if (offline) {
    return (
      <Banner
        icon="cloud-offline-outline"
        tone={colors.outline}
        message={
          pending > 0
            ? 'Offline. ' + pending + (pending === 1 ? ' change' : ' changes') + ' will sync when you reconnect.'
            : 'Offline. Your library is still here.'
        }
      />
    );
  }

  if (pending > 0) {
    return (
      <Banner
        icon={syncing ? 'sync-outline' : 'cloud-upload-outline'}
        tone={colors.primary}
        message={
          syncing
            ? 'Syncing your changes'
            : pending + (pending === 1 ? ' change waiting to sync' : ' changes waiting to sync')
        }
        actionLabel={syncing ? undefined : 'Sync now'}
        onPress={syncing ? undefined : () => void sync()}
      />
    );
  }

  return null;
}

function Banner({
  icon,
  tone,
  message,
  actionLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  message: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: spacing.gutter,
        marginBottom: spacing.md,
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radii.DEFAULT,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Ionicons name={icon} size={16} color={tone} />
      <Text variant="labelSm" colour="onSurfaceVariant" style={{ flex: 1, marginLeft: spacing.sm }}>
        {message}
      </Text>

      {actionLabel && onPress ? (
        <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text variant="labelSm" colour={colors.primary} uppercase>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

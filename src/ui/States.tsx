import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { describeError } from '@/api/errors';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

/**
 * §7 - every screen needs an empty state with a clear next action and an error
 * state that says what went wrong and how to fix it. "An empty screen is an
 * invitation to act, not an apology", so the copy here never says sorry.
 */

function stateContainer(compact: boolean): ViewStyle {
  return {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: compact ? spacing.lg : spacing.xl,
    paddingHorizontal: spacing.lg,
  };
}

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  message,
  actionLabel,
  onAction,
  style,
  compact = false,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${message}`}
      style={[stateContainer(compact), style ?? {}]}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.05)',
          marginBottom: spacing.md,
        }}
      >
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>

      <Text variant="headlineSm" align="center">
        {title}
      </Text>
      <Text
        variant="bodyMd"
        colour="onSurfaceVariant"
        align="center"
        style={{ marginTop: spacing.sm, maxWidth: 320 }}
      >
        {message}
      </Text>

      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  error,
  onRetry,
  style,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const described = describeError(error);
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${described.title}. ${described.detail}`}
      style={[stateContainer(compact), style ?? {}]}
    >
      <Ionicons name="cloud-offline-outline" size={30} color={colors.error} />
      <Text variant="headlineSm" align="center" style={{ marginTop: spacing.md }}>
        {described.title}
      </Text>
      <Text
        variant="bodyMd"
        colour="onSurfaceVariant"
        align="center"
        style={{ marginTop: spacing.sm, maxWidth: 320 }}
      >
        {described.detail}
      </Text>

      {described.retryable && onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          onPress={onRetry}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
    </View>
  );
}

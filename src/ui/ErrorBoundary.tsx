import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { captureException } from '@/observability/crashReporter';
import { palette, radii, spacing } from '@/theme/tokens';

/**
 * The last line of defence. Without this, one thrown error during render blanks
 * the app to a white screen with no way back - and in a release build, with no
 * trace either.
 *
 * Deliberately context-free: it reads the static palette and uses plain
 * `react-native` primitives rather than the app's themed `Text`/`Button`,
 * because the thing that broke may well *be* the theme provider or a UI
 * component. A fallback that depends on the system it is catching for is not a
 * fallback.
 */

interface Props {
  children: React.ReactNode;
  /** Distinguishes a whole-app boundary from a screen-level one in reports. */
  boundary?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureException(error, {
      severity: 'fatal',
      source: 'error-boundary',
      context: {
        boundary: this.props.boundary ?? 'root',
        componentStack: (info.componentStack ?? '').slice(0, 2000),
      },
    });
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center', padding: spacing.gutter }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Ionicons name="warning-outline" size={44} color={palette.primary} />
        </View>

        <Text
          style={{
            color: palette.onSurface,
            fontSize: 24,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: spacing.sm,
          }}
        >
          Something broke
        </Text>

        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontSize: 15,
            lineHeight: 22,
            textAlign: 'center',
            marginBottom: spacing.xl,
          }}
        >
          Your library is safe - it is stored on this device and nothing was lost. The report has
          been logged so this can be fixed.
        </Text>

        {__DEV__ ? (
          <ScrollView
            style={{
              maxHeight: 180,
              backgroundColor: palette.surfaceContainerLow,
              borderRadius: radii.md,
              padding: spacing.md,
              marginBottom: spacing.xl,
            }}
          >
            <Text style={{ color: palette.error, fontSize: 12, fontFamily: 'monospace' }}>
              {`${error.message}\n\n${error.stack ?? ''}`}
            </Text>
          </ScrollView>
        ) : null}

        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={{
            height: 52,
            borderRadius: radii.full,
            backgroundColor: palette.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.onPrimary, fontSize: 16, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

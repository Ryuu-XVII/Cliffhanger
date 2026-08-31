import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * Landing pad for `cliffhanger://auth-callback` - the redirect target for
 * email confirmation, password recovery, magic links, and OAuth.
 *
 * The actual session-establishing work happens in data/authLinking.ts, wired
 * up globally in the root layout, and it runs independently of which screen
 * is on top when the link lands. Before this file existed there was no
 * `auth-callback` route at all, so Expo Router had nowhere to put the
 * incoming link and fell through to +not-found - "that screen does not
 * exist" - even though the session was quietly being set up underneath it.
 * This screen exists so there is a real destination, and so the user sees
 * something happening instead of a dead end while it catches up.
 */

const CONFIRMATION_DWELL_MS = 600;
const GIVE_UP_AFTER_MS = 6000;

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const ready = useAuthStore((state) => state.ready);
  const [timedOut, setTimedOut] = useState(false);

  const signedIn = ready && !isAnonymous;

  useEffect(() => {
    if (!signedIn) return;
    // Brief pause so "You're signed in" is legible instead of an instant cut.
    const timer = setTimeout(() => router.replace('/(tabs)/profile'), CONFIRMATION_DWELL_MS);
    return () => clearTimeout(timer);
  }, [signedIn, router]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  function renderStatus() {
    if (signedIn) {
      return (
        <>
          <Text variant="displayLgMobile" align="center">
            You&apos;re signed in
          </Text>
          <Text variant="bodyMd" colour="onSurfaceVariant" align="center" style={{ marginTop: spacing.sm }}>
            Taking you back to the app.
          </Text>
        </>
      );
    }

    if (timedOut) {
      return (
        <>
          <Text variant="displayLgMobile" align="center">
            That link didn&apos;t work
          </Text>
          <Text
            variant="bodyMd"
            colour="onSurfaceVariant"
            align="center"
            style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}
          >
            It may have expired, or already been used. Try again from the sign-in screen.
          </Text>
          <Button label="Back to the app" onPress={() => router.replace('/(tabs)/profile')} />
        </>
      );
    }

    return (
      <>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="bodyMd" colour="onSurfaceVariant" align="center" style={{ marginTop: spacing.lg }}>
          Signing you in...
        </Text>
      </>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        {renderStatus()}
      </View>
    </Screen>
  );
}

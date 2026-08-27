import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isAppleAvailable,
  isGoogleConfigured,
  resetPassword,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/data/auth';
import { isFirebaseConfigured } from '@/data/firebase';
import { toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * §5 sign-in. Apple Sign-In is offered whenever Google is, because App Store
 * guideline 4.8 makes it mandatory in that case and skipping it fails review.
 */
export default function AuthScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    void isAppleAvailable().then(setAppleReady);
  }, []);

  if (!isFirebaseConfigured()) {
    return (
      <Screen>
        <View style={{ paddingTop: insets.top + spacing.xl }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Accounts are not set up yet"
            message="Add your Firebase keys to .env and restart. Until then your library works fine on this device."
            actionLabel="Back"
            onAction={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  const run = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await work();
      toast.success(mode === 'signUp' ? 'Account created' : 'Signed in');
      router.back();
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + spacing.xl,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="displayXl">{mode === 'signUp' ? 'Create account' : 'Welcome back'}</Text>
          <Text variant="bodyMd" colour="onSurfaceVariant" style={{ marginTop: spacing.sm }}>
            {mode === 'signUp'
              ? 'Everything you have logged so far comes with you.'
              : 'Sign in to sync your library across devices.'}
          </Text>

          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            {mode === 'signUp' ? (
              <Field
                label="Name"
                value={name}
                onChange={setName}
                autoComplete="name"
                placeholder="What should we call you?"
              />
            ) : null}

            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              secure
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              placeholder="At least 8 characters"
            />
          </View>

          <Button
            label={mode === 'signUp' ? 'Create account' : 'Sign in'}
            fullWidth
            loading={busy === 'email'}
            style={{ marginTop: spacing.lg }}
            onPress={() =>
              void run('email', () =>
                mode === 'signUp'
                  ? signUpWithEmail(email.trim(), password, name.trim())
                  : signInWithEmail(email.trim(), password),
              )
            }
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
            <Pressable
              onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={mode === 'signUp' ? 'Switch to sign in' : 'Switch to create account'}
            >
              <Text variant="labelLg" colour={colors.primary}>
                {mode === 'signUp' ? 'I already have an account' : 'Create an account'}
              </Text>
            </Pressable>

            {mode === 'signIn' ? (
              <Pressable
                onPress={() =>
                  void resetPassword(email.trim())
                    .then(() => toast.success('Reset email sent'))
                    .catch((error) => toast.error(friendlyAuthError(error)))
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reset password"
              >
                <Text variant="labelLg" colour="onSurfaceVariant">
                  Forgot password
                </Text>
              </Pressable>
            ) : null}
          </View>

          {isGoogleConfigured() || appleReady ? (
            <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, height: 1, backgroundColor: hairline }} />
                <Text variant="labelSm" colour="onSurfaceVariant" uppercase>
                  or
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: hairline }} />
              </View>

              {isGoogleConfigured() ? (
                <Button
                  label="Continue with Google"
                  variant="secondary"
                  fullWidth
                  loading={busy === 'google'}
                  onPress={() => void run('google', signInWithGoogle)}
                />
              ) : null}

              {appleReady ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={radii.DEFAULT}
                  style={{ height: 48 }}
                  onPress={() => void run('apple', signInWithApple)}
                />
              ) : null}
            </View>
          ) : null}

          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Continue without an account"
            style={{ marginTop: spacing.xl, alignSelf: 'center' }}
          >
            <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
              Keep using it as a guest
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
  keyboardType,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoComplete?: 'email' | 'name' | 'new-password' | 'current-password';
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Text variant="labelSm" colour="onSurfaceVariant" uppercase style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
        secureTextEntry={secure}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoComplete={autoComplete}
        autoCorrect={false}
        accessibilityLabel={label}
        style={{
          height: 52,
          paddingHorizontal: spacing.md,
          borderRadius: radii.DEFAULT,
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: 1,
          borderColor: hairline,
          color: colors.onSurface,
          fontFamily: 'HankenGrotesk_400Regular',
          fontSize: 16,
        }}
      />
    </View>
  );
}

/** Firebase error codes are not user-facing copy. Translate them (§10). */
function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/weak-password':
      return 'Use at least 8 characters.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Wrong email or password.';
    case 'auth/user-not-found':
      return 'No account with that email.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Try again when you are online.';
    default:
      return error instanceof Error ? error.message : 'That did not work.';
  }
}

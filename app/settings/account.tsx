import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import { getViewer, setAniListToken } from '@/api/anilist';
import {
  clearAniListToken,
  deleteAccount,
  isAniListConfigured,
  linkAniList,
  signOutUser,
  updateDisplayName,
  updateEmail,
  updatePassword,
} from '@/data/auth';
import { supabaseConfigured } from '@/data/supabase';
import { deleteAllUserData, remoteAvailable } from '@/data/remote';
import { localStore } from '@/data/localStore';
import { clearQueue } from '@/data/syncQueue';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { ScreenHeader } from '@/ui/Header';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * §5 account management, including the self-service deletion that both stores
 * and POPIA/GDPR require. Deletion removes the stored user data first, then the
 * auth record - the reverse order would orphan the data.
 */
export default function AccountSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const user = useAuthStore((state) => state.user);
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const linked = useAuthStore((state) => state.linked);
  const setLinked = useAuthStore((state) => state.setLinked);
  const uid = useAuthStore((state) => state.uid);

  const clearSession = useLibraryStore((state) => state.clearSession);
  const resetSettings = useSettingsStore((state) => state.reset);

  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<'name' | 'password' | 'email' | null>(null);

  const link = async () => {
    if (!isAniListConfigured()) {
      toast.error('Set EXPO_PUBLIC_ANILIST_CLIENT_ID to enable AniList linking');
      return;
    }
    setBusy(true);
    try {
      const token = await linkAniList();
      setAniListToken(token);
      const viewer = await getViewer();
      setLinked({ anilist: { userId: viewer.id, userName: viewer.name, linkedAt: Date.now() } });
      toast.success(`Linked as ${viewer.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Linking failed');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    await clearAniListToken();
    setAniListToken(null);
    setLinked({ anilist: null });
    toast.show('AniList unlinked');
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      'This erases your library, settings and account for good. Export your data first if you want to keep it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void runDelete(),
        },
      ],
    );
  };

  const runDelete = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      if (remoteAvailable() && !isAnonymous) {
        await deleteAllUserData();
      }
      localStore.clear(uid);
      clearQueue(uid);
      clearSession();
      resetSettings();
      await clearAniListToken();
      setAniListToken(null);

      if (supabaseConfigured) {
        await deleteAccount().catch(() => {
          // Supabase may require a recent session before deleting the account.
          toast.error('Sign in again, then delete. Your data has already been removed.');
        });
      }

      toast.success('Account deleted');
      router.replace('/(tabs)');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Deletion failed');
    } finally {
      setBusy(false);
    }
  };

  function storageLabel(): string {
    if (!supabaseConfigured) return 'Supabase is not configured, so everything stays on this device.';
    if (isAnonymous) return 'Your library lives on this device only.';
    return 'Your library syncs across your devices.';
  }

  function anilistHint(): string {
    if (linked.anilist) {
      return `Linked as ${linked.anilist.userName}. Your edits sync to AniList automatically.`;
    }
    if (isAniListConfigured()) return 'Two-way sync with your real AniList list';
    return 'Not configured in this build';
  }

  return (
    <Screen>
      <ScreenHeader title="Account" showBack />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
        <View
          style={{
            marginHorizontal: spacing.gutter,
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: colors.surfaceContainerLow,
          }}
        >
          <Text variant="bodyMd">
            {isAnonymous ? 'Signed in as a guest' : (user?.email ?? user?.user_metadata?.display_name ?? 'Signed in')}
          </Text>
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 4 }}>
            {storageLabel()}
          </Text>

          {isAnonymous ? (
            <Button
              label="Create account or sign in"
              onPress={() => router.push('/auth')}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <Button
              label="Sign out"
              variant="secondary"
              fullWidth
              style={{ marginTop: spacing.md }}
              onPress={() =>
                void signOutUser()
                  .then(() => toast.show('Signed out'))
                  .catch(() => toast.error('Could not sign out'))
              }
            />
          )}
        </View>

        {!isAnonymous && supabaseConfigured ? (
          <Group title="Security">
            <Row
              icon="person-outline"
              label="Change display name"
              hint="Shown in headers and to other AniList-linked users"
              onPress={() => setExpanded(expanded === 'name' ? null : 'name')}
            />
            {expanded === 'name' ? (
              <CredentialForm
                key="name"
                busy={busy}
                setBusy={setBusy}
                fieldLabel="Display name"
                placeholder="What should we call you?"
                submitLabel="Save name"
                onSubmit={async (value) => {
                  await updateDisplayName(value.trim());
                  toast.success('Name updated');
                  setExpanded(null);
                }}
              />
            ) : null}

            <Row
              icon="key-outline"
              label="Change password"
              hint="Update the password you sign in with"
              onPress={() => setExpanded(expanded === 'password' ? null : 'password')}
            />
            {expanded === 'password' ? (
              <CredentialForm
                key="password"
                busy={busy}
                setBusy={setBusy}
                fieldLabel="New password"
                secure
                placeholder="At least 8 characters"
                submitLabel="Update password"
                onSubmit={async (value) => {
                  await updatePassword(value);
                  toast.success('Password updated');
                  setExpanded(null);
                }}
              />
            ) : null}

            <Row
              icon="mail-outline"
              label="Change email"
              hint="We will send a confirmation link to the new address"
              onPress={() => setExpanded(expanded === 'email' ? null : 'email')}
            />
            {expanded === 'email' ? (
              <CredentialForm
                key="email"
                busy={busy}
                setBusy={setBusy}
                fieldLabel="New email"
                keyboardType="email-address"
                placeholder="you@example.com"
                submitLabel="Send confirmation link"
                onSubmit={async (value) => {
                  await updateEmail(value.trim());
                  toast.success(`Check ${value.trim()} to confirm the change`);
                  setExpanded(null);
                }}
              />
            ) : null}
          </Group>
        ) : null}

        <Group title="Linked services">
          <Row
            icon="link-outline"
            label="AniList"
            hint={anilistHint()}
            onPress={linked.anilist ? () => void unlink() : () => void link()}
          />
          <Row
            icon="server-outline"
            label="MyAnimeList"
            hint="Read-only stats via Jikan. Two-way sync needs the official API."
          />
        </Group>

        <Group title="Your data">
          <Row
            icon="download-outline"
            label="Export your library"
            hint="JSON or MAL-compatible XML"
            onPress={() => router.push('/settings/data')}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy policy"
            hint="What we store, and what we never collect"
            onPress={() => router.push('/settings/privacy')}
          />
          <Row
            icon="trash-outline"
            label="Delete account and data"
            hint="Permanent. Nothing is kept."
            destructive
            onPress={busy ? undefined : confirmDelete}
          />
        </Group>

        <Text
          variant="labelSm"
          colour="onSurfaceVariant"
          style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.lg }}
        >
          Cliffhanger stores your lists, progress, scores and notes. Title metadata comes from
          AniList and is never redistributed. Deleting your account removes every document we hold
          for you.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function CredentialForm({
  fieldLabel,
  placeholder,
  submitLabel,
  onSubmit,
  busy,
  setBusy,
  secure = false,
  keyboardType,
}: {
  fieldLabel: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  secure?: boolean;
  keyboardType?: 'email-address' | 'default';
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(value);
      setValue('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceContainerLow,
        borderBottomWidth: 1,
        borderBottomColor: hairline,
        gap: spacing.sm,
      }}
    >
      <Text variant="labelSm" colour="onSurfaceVariant" uppercase>
        {fieldLabel}
      </Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.outline}
          secureTextEntry={secure && !revealed}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={false}
          accessibilityLabel={fieldLabel}
          style={{
            height: 52,
            paddingHorizontal: spacing.md,
            paddingRight: secure ? spacing.xl + spacing.md : spacing.md,
            borderRadius: radii.DEFAULT,
            backgroundColor: colors.surfaceContainerHigh,
            borderWidth: 1,
            borderColor: hairline,
            color: colors.onSurface,
            fontFamily: 'HankenGrotesk_400Regular',
            fontSize: 16,
          }}
        />
        {secure ? (
          <Pressable
            onPress={() => setRevealed((previous) => !previous)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: spacing.md }}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.onSurfaceVariant}
            />
          </Pressable>
        ) : null}
      </View>
      <Button label={submitLabel} onPress={() => void submit()} loading={busy} fullWidth />
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text
        variant="labelLg"
        colour="onSurfaceVariant"
        uppercase
        style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}
      >
        {title}
      </Text>
      <View style={{ marginHorizontal: spacing.gutter, borderRadius: radii.md, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

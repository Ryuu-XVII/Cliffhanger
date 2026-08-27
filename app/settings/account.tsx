import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { setAniListToken } from '@/api/anilist';
import { getViewer } from '@/api/anilist';
import { clearAniListToken, deleteAccount, isAniListConfigured, linkAniList, signOutUser } from '@/data/auth';
import { isFirebaseConfigured } from '@/data/firebase';
import { deleteAllUserData, remoteAvailable } from '@/data/remote';
import { localStore } from '@/data/localStore';
import { clearQueue } from '@/data/syncQueue';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { ScreenHeader } from '@/ui/Header';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * §5 account management, including the self-service deletion that both stores
 * and POPIA/GDPR require. Deletion removes the Firestore documents first, then
 * the auth record - the reverse order would orphan the data.
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
      toast.success('Linked as ' + viewer.name);
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
        await deleteAllUserData(uid);
      }
      localStore.clear(uid);
      clearQueue(uid);
      clearSession();
      resetSettings();
      await clearAniListToken();
      setAniListToken(null);

      if (isFirebaseConfigured()) {
        await deleteAccount().catch(() => {
          // Firebase requires a recent login before deleting the auth record.
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
            {isAnonymous ? 'Signed in as a guest' : (user?.email ?? user?.displayName ?? 'Signed in')}
          </Text>
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 4 }}>
            {isFirebaseConfigured()
              ? isAnonymous
                ? 'Your library lives on this device only.'
                : 'Your library syncs across your devices.'
              : 'Firebase is not configured, so everything stays on this device.'}
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

        <Group title="Linked services">
          <Row
            icon="link-outline"
            label="AniList"
            hint={
              linked.anilist
                ? 'Linked as ' + linked.anilist.userName
                : isAniListConfigured()
                  ? 'Read and write your real AniList list'
                  : 'Not configured in this build'
            }
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

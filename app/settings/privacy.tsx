import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { spacing } from '@/theme/tokens';
import { Button } from '@/ui/Button';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * §12 and §16: a privacy policy is required by both stores and by POPIA/GDPR,
 * and the store data-safety form has to match it. Keeping it in-app rather than
 * as a web link means it cannot silently drift out of sync with the build, and
 * it stays readable offline.
 *
 * Everything below describes what the code actually does. If a data flow
 * changes, this screen changes with it.
 */

const UPDATED = '27 August 2026';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <Screen>
      <ScreenHeader title="Privacy" showBack />

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl * 2 }}>
        <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginBottom: spacing.lg }}>
          {`Last updated ${UPDATED}`}
        </Text>

        <Para>
          Cliffhanger tracks what you watch. This policy explains exactly what leaves your device
          and what does not.
        </Para>

        <Heading>What is stored on your device</Heading>
        <Para>
          Your library, progress, scores, notes, custom lists and settings are written to this
          device first and always. The app is fully usable offline and without an account, and in
          that mode none of it is transmitted anywhere.
        </Para>

        <Heading>What is stored on our servers</Heading>
        <Para>
          If you create an account or sign in, the data above is copied to our backend (Supabase,
          hosted in the EU) so it can sync between your devices. It is protected by row-level
          security: your rows are readable and writable only by your own authenticated account.
        </Para>
        <Para>
          If you enable airing notifications, we also store a push token for each device and its
          timezone offset, so an episode alert can reach you at a sensible local hour.
        </Para>

        <Heading>Crash reports</Heading>
        <Para>
          When the app hits an unexpected error it records the error message, a stack trace, your
          app version and your platform, and uploads them against your account. Crash reports never
          include your library, your notes or your credentials, and they are used only to fix
          faults.
        </Para>

        <Heading>What we never collect</Heading>
        <Para>
          No advertising identifiers. No location. No contacts. No behavioural analytics or
          third-party tracking SDKs. Cliffhanger contains no advertising and does not sell or share
          your data with anyone.
        </Para>

        <Heading>Third-party services</Heading>
        <Para>
          Title metadata comes from AniList, and from Jikan and AnimeSchedule for supplementary
          scores and airing times. These requests identify the app, not you: they carry no account
          identifier, no device identifier and no personal data. If you link your AniList account,
          requests you make to AniList are additionally authenticated as you, by your choice.
        </Para>
        <Para>
          Push notifications are delivered through Expo's push service and Google's Firebase Cloud
          Messaging, which receive the notification content and your push token in order to deliver
          the message.
        </Para>

        <Heading>Your rights</Heading>
        <Para>
          You can export your entire library at any time as JSON or MAL-compatible XML from Settings
          → Import and export. You can permanently delete your account and every server-side record
          we hold from Settings → Account. Deletion is immediate and is not recoverable.
        </Para>
        <Para>
          Under POPIA and the GDPR you may also request access to, correction of, or deletion of
          your personal information by contacting us.
        </Para>

        <Heading>Children</Heading>
        <Para>
          Cliffhanger is not directed at children under 13, and we do not knowingly collect their
          personal information.
        </Para>

        <Heading>Contact</Heading>
        <Para>
          Cliffhanger is a personal project without a support team. For a data request, reach the
          developer directly through whatever channel you already have.
        </Para>

        <View style={{ marginTop: spacing.xl }}>
          <Button
            label="Export my data"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/settings/data')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
      {children}
    </Text>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="bodyMd" style={{ marginBottom: spacing.md, lineHeight: 22 }}>
      {children}
    </Text>
  );
}

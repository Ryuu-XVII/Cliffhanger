import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';

import { cacheClear } from '@/api/cache';
import type { ScoreFormat, TitleLanguage } from '@/data/models';
import { resetOnboarding } from '@/features/onboarding/state';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { accents, hairline, radii, spacing, type AccentId } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip } from '@/ui/Chip';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { PressableScale } from '@/ui/PressableScale';
import { Row } from '@/ui/Row';

const STREAMING_REGIONS: Array<[string, string]> = [
  ['ZA', 'South Africa'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['JP', 'Japan'],
];

/**
 * F-11 title language, F-06 score format, F-28 theming, plus the motion and
 * haptics switches that back the reduced-motion requirement in §9.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);

  const knownRegion = STREAMING_REGIONS.some(([code]) => code === settings.streamingRegion);
  const [customRegion, setCustomRegion] = useState(knownRegion ? '' : settings.streamingRegion);

  return (
    <Screen>
      <ScreenHeader title="Settings" showBack />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
        <Section
          title="Title language"
          hint="Applied everywhere, notifications included."
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(
              [
                ['romaji', 'Romaji'],
                ['english', 'English'],
                ['native', 'Native'],
              ] as Array<[TitleLanguage, string]>
            ).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={settings.titleLanguage === value}
                onPress={() => update({ titleLanguage: value })}
              />
            ))}
          </View>
        </Section>

        <Section title="Score format" hint="Scores are stored the same way regardless.">
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(
              [
                ['POINT_10', '10 point'],
                ['POINT_100', '100 point'],
                ['POINT_5', '5 star'],
              ] as Array<[ScoreFormat, string]>
            ).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                selected={settings.scoreFormat === value}
                onPress={() => update({ scoreFormat: value })}
              />
            ))}
          </View>
        </Section>

        <Section title="Theme">
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <Chip
              label="Obsidian"
              selected={settings.theme === 'obsidian'}
              onPress={() => update({ theme: 'obsidian' })}
            />
            <Chip
              label="OLED black"
              selected={settings.theme === 'oled'}
              onPress={() => update({ theme: 'oled' })}
            />
          </View>

          <Text variant="labelSm" colour="onSurfaceVariant" uppercase style={{ marginBottom: spacing.sm }}>
            Accent
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(Object.keys(accents) as AccentId[]).map((id) => (
              <PressableScale
                key={id}
                onPress={() => update({ accent: id })}
                scaleTo={0.9}
                rotateTo={0}
                accessibilityRole="radio"
                accessibilityLabel={id + ' accent'}
                accessibilityState={{ selected: settings.accent === id }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.full,
                  backgroundColor: accents[id].primary,
                  borderWidth: settings.accent === id ? 3 : 0,
                  borderColor: colors.onSurface,
                }}
              />
            ))}
          </View>
        </Section>

        <Section title="Motion and feedback">
          <ToggleRow
            label="Reduce motion"
            hint="Also honours your device accessibility setting."
            value={settings.reduceMotion}
            onChange={(value) => update({ reduceMotion: value })}
          />
          <ToggleRow
            label="Haptics"
            hint="The tick when you log an episode."
            value={settings.hapticsEnabled}
            onChange={(value) => update({ hapticsEnabled: value })}
          />
        </Section>

        <Section title="Content">
          <ToggleRow
            label="Show adult titles"
            value={settings.showAdult}
            onChange={(value) => update({ showAdult: value })}
          />
        </Section>

        <Section title="Streaming region" hint="Orders streaming links on a title's page by what's likely available there.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
            {STREAMING_REGIONS.map(([code, label]) => (
              <Chip
                key={code}
                label={label}
                selected={settings.streamingRegion === code}
                onPress={() => {
                  setCustomRegion('');
                  update({ streamingRegion: code });
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TextInput
              value={customRegion}
              onChangeText={(value) => setCustomRegion(value.toUpperCase())}
              placeholder="Other ISO code, e.g. DE"
              placeholderTextColor={colors.outline}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={2}
              accessibilityLabel="Custom streaming region code"
              style={{
                flex: 1,
                height: 44,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.DEFAULT,
                backgroundColor: colors.surfaceContainerHigh,
                borderWidth: 1,
                borderColor: hairline,
                color: colors.onSurface,
                fontFamily: 'HankenGrotesk_400Regular',
                fontSize: 16,
              }}
            />
            <PressableScale
              onPress={() => {
                if (customRegion.trim().length !== 2) {
                  toast.error('Use a 2-letter ISO region code, like DE');
                  return;
                }
                update({ streamingRegion: customRegion.trim() });
                toast.success('Streaming region updated');
              }}
              scaleTo={0.95}
              accessibilityRole="button"
              accessibilityLabel="Set custom streaming region"
              style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
            >
              <Text variant="labelLg" colour={colors.primary} uppercase>
                Set
              </Text>
            </PressableScale>
          </View>
        </Section>

        <Section title="More">
          <Row
            icon="notifications-outline"
            label="Notifications"
            hint="Airing alerts, quiet hours"
            onPress={() => router.push('/settings/notifications')}
          />
          <Row
            icon="download-outline"
            label="Import and export"
            hint="JSON and MAL-compatible XML"
            onPress={() => router.push('/settings/data')}
          />
          <Row
            icon="person-circle-outline"
            label="Account"
            hint="Sign in, linked services, deletion"
            onPress={() => router.push('/settings/account')}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy"
            hint="What we store, and what we never collect"
            onPress={() => router.push('/settings/privacy')}
          />
          <Row
            icon="refresh-outline"
            label="Replay the intro"
            onPress={() => {
              resetOnboarding();
              toast.show('The intro will show next launch');
            }}
          />
          <Row
            icon="trash-bin-outline"
            label="Clear cache"
            hint="Titles, seasons and search results only - your library is untouched"
            onPress={() => {
              cacheClear();
              toast.show('Cache cleared');
            }}
          />
          <Row
            icon="information-circle-outline"
            label="About"
            hint="Version, build"
            onPress={() => router.push('/settings/about')}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl }}>
      <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
        {title}
      </Text>
      {hint ? (
        <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 2 }}>
          {hint}
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.md }}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text variant="bodyMd">{label}</Text>
        {hint ? (
          <Text variant="labelSm" colour="onSurfaceVariant">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceContainerHighest, true: colors.primaryContainer }}
        thumbColor={value ? colors.primary : colors.outline}
      />
    </View>
  );
}

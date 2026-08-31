import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';

import {
  cancelAll,
  checkPermission,
  registerPushToken,
  scheduledCount,
  syncAiringNotifications,
} from '@/features/notifications/notifications';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * F-13 controls. Defaults follow §15: on for Watching, off for Planning, with
 * quiet hours available so a 3am JST broadcast does not wake anyone up.
 */

type QuietWindow = { start: string; end: string } | null;

const QUIET_PRESETS: Array<{ label: string; value: QuietWindow }> = [
  { label: 'Off', value: null },
  { label: '22:00 - 07:00', value: { start: '22:00', end: '07:00' } },
  { label: '23:00 - 08:00', value: { start: '23:00', end: '08:00' } },
  { label: '00:00 - 06:00', value: { start: '00:00', end: '06:00' } },
];

function isSameWindow(a: QuietWindow, b: QuietWindow): boolean {
  if (a === null || b === null) return a === b;
  return a.start === b.start && a.end === b.end;
}

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);

  const [granted, setGranted] = useState<boolean | null>(null);
  const [queued, setQueued] = useState(scheduledCount());
  const [working, setWorking] = useState(false);

  const matchesPreset = QUIET_PRESETS.some((preset) =>
    isSameWindow(preset.value, settings.quietHours),
  );
  const [customOpen, setCustomOpen] = useState(!matchesPreset && settings.quietHours !== null);
  const [customStart, setCustomStart] = useState(settings.quietHours?.start ?? '');
  const [customEnd, setCustomEnd] = useState(settings.quietHours?.end ?? '');

  const applyCustom = () => {
    if (!TIME_PATTERN.test(customStart) || !TIME_PATTERN.test(customEnd)) {
      toast.error('Use 24-hour HH:MM, like 22:30');
      return;
    }
    update({ quietHours: { start: customStart, end: customEnd } });
    toast.success('Quiet hours updated');
  };

  useEffect(() => {
    void checkPermission().then(setGranted);
  }, []);

  const resync = useCallback(async () => {
    setWorking(true);
    try {
      const count = await syncAiringNotifications();
      setQueued(scheduledCount());
      toast.success(count > 0 ? `${count} alerts scheduled` : 'Nothing to schedule right now');
    } catch {
      toast.error('Could not reach the airing schedule. Try again when you are online.');
    } finally {
      setWorking(false);
    }
  }, []);

  const enableNotifications = useCallback(async () => {
    await registerPushToken();
    const allowed = await checkPermission();
    if (!allowed) {
      update({ notificationsEnabled: false });
      setGranted(false);
      toast.error('Notifications are blocked. Enable them in device settings first.');
      return;
    }
    await resync();
  }, [resync, update]);

  return (
    <Screen>
      <ScreenHeader title="Notifications" showBack />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
        {granted === false ? (
          <View
            style={{
              marginHorizontal: spacing.gutter,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: colors.surfaceContainerLow,
            }}
          >
            <Text variant="bodyMd">Notifications are blocked</Text>
            <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 4 }}>
              Turn them on for Cliffhanger in your device settings, then come back here.
            </Text>
          </View>
        ) : null}

        <Section title="Airing alerts">
          <ToggleRow
            label="Tell me when an episode airs"
            hint="Applies to everything in Watching unless you turn it off per title."
            value={settings.notificationsEnabled}
            onChange={(value) => {
              update({ notificationsEnabled: value });
              if (value) {
                void enableNotifications();
              } else {
                void cancelAll();
                setQueued(0);
              }
            }}
          />
          <ToggleRow
            label="On by default for new entries"
            hint="Planning entries stay silent either way."
            value={settings.notifyOnAiringDefault}
            onChange={(value) => update({ notifyOnAiringDefault: value })}
          />
        </Section>

        <Section title="Quiet hours" hint="Alerts inside this window are skipped, not delayed.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {QUIET_PRESETS.map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                selected={!customOpen && isSameWindow(preset.value, settings.quietHours)}
                onPress={() => {
                  setCustomOpen(false);
                  update({ quietHours: preset.value });
                }}
              />
            ))}
            <Chip
              label="Custom"
              selected={customOpen}
              onPress={() => setCustomOpen(true)}
            />
          </View>

          {customOpen ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
              <TimeField label="Start" value={customStart} onChange={setCustomStart} />
              <Text variant="bodyMd" colour="onSurfaceVariant">
                to
              </Text>
              <TimeField label="End" value={customEnd} onChange={setCustomEnd} />
              <Pressable
                onPress={applyCustom}
                accessibilityRole="button"
                accessibilityLabel="Apply custom quiet hours"
                style={{ justifyContent: 'center', paddingHorizontal: spacing.sm }}
              >
                <Text variant="labelLg" colour={colors.primary} uppercase>
                  Set
                </Text>
              </Pressable>
            </View>
          ) : null}
        </Section>

        <Section title="Scheduled on this device">
          <Text variant="bodyMd" colour="onSurfaceVariant">
            {queued === 0
              ? 'No alerts queued.'
              : `${queued} ${queued === 1 ? 'alert' : 'alerts'} queued for the next seven days.`}
          </Text>
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: spacing.xs }}>
            Alerts are scheduled locally so they still fire offline. Push notifications cover
            titles airing beyond this seven-day window.
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Button
              label="Refresh schedule"
              variant="secondary"
              loading={working}
              onPress={() => void resync()}
            />
            <Pressable
              onPress={() => {
                void cancelAll();
                setQueued(0);
                toast.show('Alerts cleared');
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear all scheduled alerts"
              style={{ justifyContent: 'center', paddingHorizontal: spacing.md }}
            >
              <Text variant="labelLg" colour={colors.error} uppercase>
                Clear
              </Text>
            </Pressable>
          </View>
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

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      placeholderTextColor={colors.outline}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      accessibilityLabel={`${label} time, 24-hour HH:MM`}
      style={{
        width: 76,
        height: 44,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.DEFAULT,
        backgroundColor: colors.surfaceContainerHigh,
        borderWidth: 1,
        borderColor: hairline,
        color: colors.onSurface,
        fontFamily: 'HankenGrotesk_400Regular',
        fontSize: 16,
        textAlign: 'center',
      }}
    />
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

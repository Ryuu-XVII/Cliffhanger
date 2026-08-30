import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkPermission, registerPushToken, syncAiringNotifications } from '@/features/notifications/notifications';
import { markOnboarded } from '@/features/onboarding/state';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import type { TitleLanguage } from '@/data/models';

/**
 * F-12: at most three screens, skippable from the first frame, and it never
 * asks for an account. The only thing it collects is the title language, and
 * only because getting that wrong is visible on every screen afterwards (§4.6).
 */

const PAGES = [
  {
    icon: 'flash' as const,
    title: 'One tap logs an episode',
    body: 'Your current shows sit on the home screen. Tap the plus. That is the whole ritual.',
  },
  {
    icon: 'notifications' as const,
    title: 'Know when the next one drops',
    body: 'Countdowns for everything you are watching, and an alert the moment an episode airs.',
  },
  {
    icon: 'language' as const,
    title: 'Titles, your way',
    body: 'Pick how titles read. You can change this any time in settings.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const titleLanguage = useSettingsStore((state) => state.settings.titleLanguage);
  const update = useSettingsStore((state) => state.update);
  const [notifChoice, setNotifChoice] = useState<'enabled' | 'declined' | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);

  const enableNotifications = async () => {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      update({ notificationsEnabled: true, notifyOnAiringDefault: true });
      await registerPushToken();
      const allowed = await checkPermission();
      if (!allowed) {
        update({ notificationsEnabled: false, notifyOnAiringDefault: false });
        toast.error('Notifications are blocked. Enable them in device settings if you change your mind.');
        setNotifChoice('declined');
        return;
      }
      void syncAiringNotifications();
      setNotifChoice('enabled');
    } finally {
      setNotifBusy(false);
    }
  };

  const declineNotifications = () => {
    update({ notificationsEnabled: false, notifyOnAiringDefault: false });
    setNotifChoice('declined');
  };

  const finish = () => {
    markOnboarded();
    router.replace('/(tabs)');
  };

  const next = () => {
    if (page >= PAGES.length - 1) {
      finish();
      return;
    }
    const target = page + 1;
    setPage(target);
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
  };

  return (
    <Screen>
      <LinearGradient
        colors={['rgba(132,43,210,0.35)', 'rgba(0,0,0,0)']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420 }}
      />

      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.gutter, alignItems: 'flex-end' }}>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip onboarding">
          <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        style={{ flex: 1 }}
      >
        {PAGES.map((item, index) => (
          <View
            key={item.title}
            style={{ width, paddingHorizontal: spacing.lg, justifyContent: 'center' }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.06)',
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name={item.icon} size={32} color={colors.primary} />
            </View>

            <Text variant="displayXl" style={{ marginBottom: spacing.md }}>
              {item.title}
            </Text>
            <Text variant="bodyLg" colour="onSurfaceVariant" style={{ maxWidth: 340 }}>
              {item.body}
            </Text>

            {index === 1 ? (
              notifChoice ? (
                <Text
                  variant="labelLg"
                  colour={colors.primary}
                  style={{ marginTop: spacing.xl }}
                >
                  {notifChoice === 'enabled'
                    ? 'Notifications on. Change this any time in settings.'
                    : 'Off for now. Turn these on any time in settings.'}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
                  <Button
                    label="Enable notifications"
                    loading={notifBusy}
                    onPress={() => void enableNotifications()}
                  />
                  <Button label="Not now" variant="secondary" onPress={declineNotifications} />
                </View>
              )
            ) : null}

            {index === 2 ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
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
                    selected={titleLanguage === value}
                    onPress={() => update({ titleLanguage: value })}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {PAGES.map((item, index) => (
            <View
              key={item.title}
              style={{
                width: index === page ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === page ? colors.primary : colors.outlineVariant,
              }}
            />
          ))}
        </View>

        <Button
          label={page >= PAGES.length - 1 ? 'Start tracking' : 'Next'}
          onPress={next}
          fullWidth
        />
      </View>
    </Screen>
  );
}

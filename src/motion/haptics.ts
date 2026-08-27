import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Haptics are opt-out (settings) and silently no-op where unsupported.
 * Never awaited by callers — a haptic must never delay visual feedback.
 */
function enabled(): boolean {
  return useSettingsStore.getState().settings.hapticsEnabled && Platform.OS !== 'web';
}

function safe(run: () => Promise<void>): void {
  if (!enabled()) return;
  run().catch(() => {
    /* Haptic engine unavailable — not worth surfacing. */
  });
}

export const haptics = {
  /** The +1 tap (F-05). Light, immediate. */
  tick: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Press-in on a card. */
  press: () => safe(() => Haptics.selectionAsync()),
  /** Crossing a milestone (halfway, final episode armed). */
  bump: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Series completed — the orchestrated moment. */
  celebrate: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

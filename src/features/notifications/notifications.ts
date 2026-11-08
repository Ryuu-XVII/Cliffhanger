import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { getAiringSchedule } from '@/api/anilist';
import { readJson, writeJson } from '@/api/kv';
import { isActiveEntry } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { isWithinQuietHours } from '@/utils/time';
import { palette } from '@/theme/tokens';
import { supabase } from '@/data/supabase';

/** Airing alerts have exactly one delivery transport per device/build.
 * Local (default) works offline and for guests. Push requires an authenticated
 * account and the deployed Edge Function. We never silently switch transports.
 */
export const AIRING_DELIVERY_MODE = process.env.EXPO_PUBLIC_AIRING_DELIVERY_MODE === 'push' ? 'push' : 'local';

const SCHEDULED_KEY = 'notify:scheduled';
const TOKEN_KEY = 'notify:push-token';
const SCHEDULE_WINDOW_SECONDS = 7 * 24 * 3600;
/** A week of airings never fills this many pages; the cap is a runaway guard. */
const MAX_SCHEDULE_PAGES = 10;

interface ScheduledRecord {
  /** idempotency key -> expo notification id */
  [key: string]: { id: string; airingAt: number; signature?: string };
}

export function registerNotificationHandlers(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('airing', {
      name: 'New episodes',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120, 80, 120],
      sound: 'default',
      lightColor: palette.primary,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // §11: deep-link straight to the title detail screen.
  const handleResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as { anilistId?: number } | undefined;
    if (data?.anilistId) {
      router.push({ pathname: '/title/[id]', params: { id: String(data.anilistId) } });
    }
  };
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handleResponse(response);
  });
  return () => responseSubscription.remove();
}

export async function checkPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

/**
 * The FCM/Expo push token, handed to the backend so the scheduled function can
 * reach this device. Failure is non-fatal: local scheduling still works.
 */
export async function registerPushToken(options: { requestPermission?: boolean } = {}): Promise<string | null> {
  const uid = useLibraryStore.getState().uid;
  try {
    if (!(await (options.requestPermission === false ? checkPermission() : requestPermission()))) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    writeJson(TOKEN_KEY, token.data);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user && userData.user.id === uid && useLibraryStore.getState().uid === uid) {
      const { error } = await supabase.from('devices').upsert({
        user_id: userData.user.id,
        token: token.data,
        platform: Platform.OS,
        timezone_offset_minutes: -new Date().getTimezoneOffset(),
        delivery_mode: AIRING_DELIVERY_MODE,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,token' });
      if (error) throw error;
    }
    return token.data;
  } catch {
    return null;
  }
}

function idempotencyKey(anilistId: number, episode: number): string {
  return `${anilistId}:${episode}`;
}

/**
 * Schedules local alerts for the next week of episodes belonging to titles the
 * user is actively watching. Idempotent: re-running never double-schedules.
 */
async function scheduleAiringNotifications(options: { requestPermission?: boolean } = {}): Promise<number> {
  const settings = useSettingsStore.getState().settings;
  const uid = useLibraryStore.getState().uid;
  const signature = watchSignature();
  const current = () => useLibraryStore.getState().uid === uid && watchSignature() === signature;
  if (AIRING_DELIVERY_MODE === 'push' || !settings.notificationsEnabled) {
    await cancelAll();
    return 0;
  }

  const allowed = options.requestPermission === false ? await checkPermission() : await requestPermission();
  if (!allowed || !current()) return 0;

  const entries = Object.values(useLibraryStore.getState().entries).filter((entry) => {
    if (entry.mediaType !== 'ANIME') return false;
    if (!isActiveEntry(entry)) return false;
    // Per-title override wins; otherwise fall back to the global default.
    return entry.notify ?? settings.notifyOnAiringDefault;
  });

  if (entries.length === 0) {
    await cancelAll();
    return 0;
  }

  const watched = new Map(entries.map((entry) => [entry.anilistId, entry]));
  const from = Math.floor(Date.now() / 1000);
  const to = from + SCHEDULE_WINDOW_SECONDS;

  const scheduleItems = [] as Awaited<ReturnType<typeof getAiringSchedule>>['items'];
  for (let schedulePage = 1; schedulePage <= MAX_SCHEDULE_PAGES; schedulePage += 1) {
    const page = await getAiringSchedule(from, to, schedulePage);
    if (!current()) return 0;
    scheduleItems.push(...page.items);
    if (!page.hasNextPage) break;
  }
  const existing = readJson<ScheduledRecord>(SCHEDULED_KEY) ?? {};
  const next: ScheduledRecord = {};
  let scheduled = 0;

  for (const item of scheduleItems) {
    const media = item.media;
    if (!media) continue;

    const entry = watched.get(media.id);
    if (!entry) continue;

    const key = idempotencyKey(media.id, item.episode);
    const already = existing[key];

    if (already && already.airingAt === item.airingAt && already.signature === signature) {
      next[key] = already;
      continue;
    }
    if (already) {
      // The broadcast moved - cancel the stale alert before rescheduling.
      await Notifications.cancelScheduledNotificationAsync(already.id).catch(() => undefined);
    }

    const fireAt = new Date(item.airingAt * 1000);
    if (fireAt.getTime() <= Date.now()) continue;
    if (isWithinQuietHours(fireAt, settings.quietHours)) continue;

    const title = resolveTitle(entry.snapshot.title, settings.titleLanguage);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: `Episode ${item.episode} is out.`,
        sound: 'default',
        data: { anilistId: media.id, episode: item.episode },
        ...(Platform.OS === 'android' ? { channelId: 'airing' } : null),
      },
      trigger: {
        ...(Platform.OS === 'android' ? { channelId: 'airing' } : null),
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });

    if (!current()) {
      await Notifications.cancelScheduledNotificationAsync(id);
      for (const record of Object.values(next)) await Notifications.cancelScheduledNotificationAsync(record.id).catch(() => undefined);
      return 0;
    }
    next[key] = { id, airingAt: item.airingAt, signature };
    scheduled += 1;
  }

  // Anything the user stopped watching still holds a scheduled alert - drop it.
  for (const [key, record] of Object.entries(existing)) {
    if (!next[key]) {
      await Notifications.cancelScheduledNotificationAsync(record.id).catch(() => undefined);
    }
  }

  writeJson(SCHEDULED_KEY, next);
  return scheduled;
}

let scheduling: Promise<unknown> = Promise.resolve();
export function syncAiringNotifications(options: { requestPermission?: boolean } = {}): Promise<number> {
  const next = scheduling.catch(() => undefined).then(() => scheduleAiringNotifications(options));
  scheduling = next;
  return next;
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  writeJson(SCHEDULED_KEY, {});
}

/** Count of alerts currently queued on the device, for the settings screen. */
export function scheduledCount(): number {
  return Object.keys(readJson<ScheduledRecord>(SCHEDULED_KEY) ?? {}).length;
}

const LAST_RUN_KEY = 'notify:last-run';
const SIGNATURE_KEY = 'notify:signature';
const MIN_INTERVAL_MS = 60 * 60 * 1000;
let tokenRefresh: Promise<string | null> | null = null;
let registeredUid: string | null = null;
let registeredAt = 0;
async function refreshPushRegistration(): Promise<void> {
  const uid = useLibraryStore.getState().uid;
  if (registeredUid === uid && Date.now() - registeredAt < MIN_INTERVAL_MS) return;
  if (tokenRefresh) { await tokenRefresh; return; }
  tokenRefresh = registerPushToken({ requestPermission: false });
  try {
    if (await tokenRefresh && useLibraryStore.getState().uid === uid) { registeredUid = uid; registeredAt = Date.now(); }
  } finally { tokenRefresh = null; }
}

/**
 * A signature of what the schedule depends on: which titles are being watched
 * and whether each one wants alerts. Adding a show has to reschedule straight
 * away; a plain app resume does not.
 */
function watchSignature(): string {
  const settings = useSettingsStore.getState().settings;
  const ids = Object.values(useLibraryStore.getState().entries)
    .filter(isActiveEntry)
    .map((entry) => `${entry.anilistId}:${entry.notify ?? 'default'}`)
    .sort()
    .join(',');

  return [
    useLibraryStore.getState().uid ?? 'no-account',
    AIRING_DELIVERY_MODE,
    ids,
    settings.notificationsEnabled ? 'on' : 'off',
    settings.notifyOnAiringDefault ? 'default-on' : 'default-off',
    settings.titleLanguage,
    settings.quietHours ? `${settings.quietHours.start}-${settings.quietHours.end}` : 'no-quiet',
  ].join('|');
}

/**
 * The entry point the app calls on launch and on resume. Without this, alerts
 * would only ever be scheduled by visiting the notification settings screen -
 * which no one does - and F-13 would be dead on a fresh install.
 *
 * It reschedules when the watched set or the relevant settings change, and
 * otherwise at most once an hour, which matches the airing cache tier (§4.5.2)
 * so a resume costs nothing.
 */
export async function maybeSyncAiringNotifications(): Promise<number | null> {
  const settings = useSettingsStore.getState().settings;
  if (settings.notificationsEnabled) await refreshPushRegistration();
  const signature = watchSignature();
  const previousSignature = readJson<string>(SIGNATURE_KEY);

  if (!settings.notificationsEnabled) {
    if (previousSignature !== signature) {
      await cancelAll();
      writeJson(SIGNATURE_KEY, signature);
    }
    return null;
  }

  const lastRun = readJson<number>(LAST_RUN_KEY) ?? 0;
  const stale = Date.now() - lastRun > MIN_INTERVAL_MS;
  if (!stale && previousSignature === signature) return null;

  try {
    const scheduled = await syncAiringNotifications({ requestPermission: false });
    writeJson(LAST_RUN_KEY, Date.now());
    writeJson(SIGNATURE_KEY, signature);
    return scheduled;
  } catch {
    // Offline, or AniList is down. The existing schedule stays as it is and
    // the next resume tries again - this must never surface as an error.
    return null;
  }
}

import { syncAiringNotifications } from '@/features/notifications/notifications';
import { getAiringSchedule } from '@/api/anilist';
import { emptyEntry, DEFAULT_SETTINGS } from '@/data/models';
import { kv } from '@/api/kv';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import * as Notifications from 'expo-notifications';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-constants', () => ({ expoConfig: {} }));
jest.mock('@/data/supabase', () => ({ supabase: {} }));
jest.mock('@/api/anilist', () => ({ getAiringSchedule: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
const title = { english: 'English title', romaji: 'Romaji title', native: null };
const entry = { ...emptyEntry(21, { title, coverImage: null, bannerImage: null, totalEpisodes: 12,
  format: 'TV', airingStatus: 'RELEASING', genres: [], averageScore: null }), status: 'WATCHING' as const, notify: true };
const airingAt = Math.floor(Date.now() / 1000) + 3600;
const page = { items: [{ media: { id: 21 }, episode: 2, airingAt }], hasNextPage: false };
beforeEach(() => {
  kv().delete('notify:scheduled');
  jest.clearAllMocks();
  useLibraryStore.setState({ uid: 'local-a', entries: { '21': entry } });
  useSettingsStore.setState({ uid: 'local-a', settings: { ...DEFAULT_SETTINGS, notificationsEnabled: true, notifyOnAiringDefault: true } });
  jest.mocked(getAiringSchedule).mockResolvedValue(page as Awaited<ReturnType<typeof getAiringSchedule>>);
});

test('concurrent reschedules create only one local notification', async () => {
  await Promise.all([syncAiringNotifications(), syncAiringNotifications()]);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('changing title language replaces an existing alert at the same airing time', async () => {
  await syncAiringNotifications();
  useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, titleLanguage: 'romaji' } });
  await syncAiringNotifications();
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-id');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.objectContaining({ title: 'Romaji title' }) }));
});

test('changing quiet hours cancels an existing alert that now falls in quiet hours', async () => {
  await syncAiringNotifications();
  const time = new Date(airingAt * 1000);
  const hour = time.getHours();
  const start = `${String(hour).padStart(2, '0')}:00`;
  const end = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
  useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, quietHours: { start, end } } });
  await syncAiringNotifications();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalled();
});

test('an account change while fetching prevents the old account scheduling an alert', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getAiringSchedule>>) => void;
  jest.mocked(getAiringSchedule).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const scheduling = syncAiringNotifications();
  // Allow the serialized run and permission check to start its fetch.
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  useLibraryStore.setState({ uid: 'local-b', entries: {} });
  resolve(page as Awaited<ReturnType<typeof getAiringSchedule>>);
  await scheduling;
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

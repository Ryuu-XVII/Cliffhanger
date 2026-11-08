import { setOnline } from '@/api/http';
import { localStore } from '@/data/localStore';
import { DEFAULT_SETTINGS, emptyEntry, type LibraryEntry } from '@/data/models';
import { syncNow } from '@/data/sync';
import { clearQueue, enqueue, markFailed, readQueue, removeOp } from '@/data/syncQueue';
import { emptyTitleSet } from '@/data/titles';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import * as remote from '@/data/remote';

jest.mock('@/data/remote', () => ({
  remoteAvailable: () => true,
  pushEntry: jest.fn(async () => true), deleteEntry: jest.fn(async () => true),
  pushList: jest.fn(async () => true), deleteList: jest.fn(async () => true),
  pushSettings: jest.fn(async () => undefined), pushProfile: jest.fn(async () => undefined),
  pullEntries: jest.fn(async () => []), pullLists: jest.fn(async () => []),
  pullProfile: jest.fn(async () => null),
}));
jest.mock('@/api/anilist', () => ({
  hasAniListToken: () => false, saveMediaListEntry: jest.fn(), deleteMediaListEntryByMediaId: jest.fn(),
}));

const UID = 'sync-user-a';
const OTHER = 'sync-user-b';
function entry(progress = 1, updatedAt = 100): LibraryEntry {
  return { ...emptyEntry(21, { title: emptyTitleSet(), coverImage: null, bannerImage: null,
    totalEpisodes: 12, format: 'TV', airingStatus: 'FINISHED', genres: [], averageScore: null }), progress, updatedAt };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const uid of [UID, OTHER, 'local-guest']) { localStore.clear(uid); clearQueue(uid); }
  useLibraryStore.getState().clearSession();
  useLibraryStore.getState().hydrate(UID);
  useSettingsStore.setState({ uid: UID, settings: DEFAULT_SETTINGS });
  setOnline(true);
});

test('an older completion and failure cannot remove or penalize a replacement operation', () => {
  enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entry(1) });
  const first = readQueue(UID)[0]!;
  enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entry(2) });
  removeOp(UID, first.key, first);
  markFailed(UID, first.key, 'old failure', first);
  expect(readQueue(UID)[0]).toMatchObject({ payload: { progress: 2 }, attempts: 0 });
});

test('an edit during upload remains queued and survives the following pull', async () => {
  const upload = deferred<boolean>();
  jest.mocked(remote.pushEntry).mockReturnValueOnce(upload.promise);
  localStore.writeEntries(UID, { '21': entry(1) });
  enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entry(1) });
  const syncing = syncNow(UID);
  localStore.writeEntries(UID, { '21': entry(2, 200) });
  enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entry(2, 200) });
  upload.resolve(true);
  await syncing;
  expect(readQueue(UID)[0]?.payload).toMatchObject({ progress: 2 });
  expect(localStore.readEntries(UID)['21']?.progress).toBe(2);
});

test('an edit during pull is protected even when the remote snapshot is older', async () => {
  const pull = deferred<LibraryEntry[]>();
  jest.mocked(remote.pullEntries).mockReturnValueOnce(pull.promise);
  const syncing = syncNow(UID);
  localStore.writeEntries(UID, { '21': entry(4, 400) });
  enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entry(4, 400) });
  pull.resolve([entry(1)]);
  await syncing;
  expect(localStore.readEntries(UID)['21']?.progress).toBe(4);
});

test('server deletions remove acknowledged entries and lists', async () => {
  localStore.writeEntries(UID, { '21': entry() });
  localStore.writeLists(UID, [{ id: 'gone', name: 'Deleted remotely', order: 0, createdAt: 1 }]);
  await syncNow(UID);
  expect(localStore.readEntries(UID)).toEqual({});
  expect(localStore.readLists(UID)).toEqual([]);
});

test('remote list renames replace an existing local list', async () => {
  const list = { id: 'list', name: 'Old', order: 0, createdAt: 1 };
  localStore.writeLists(UID, [list]);
  jest.mocked(remote.pullLists).mockResolvedValueOnce([{ ...list, name: 'New' }]);
  await syncNow(UID);
  expect(localStore.readLists(UID)[0]?.name).toBe('New');
});

test('a pending local deletion is not resurrected by a stale remote snapshot', async () => {
  jest.mocked(remote.deleteEntry).mockRejectedValueOnce(new Error('offline'));
  jest.mocked(remote.pullEntries).mockResolvedValueOnce([entry()]);
  enqueue(UID, { key: 'entry:21', type: 'entry.delete', payload: 21 });
  await syncNow(UID);
  expect(localStore.readEntries(UID)).toEqual({});
  expect(readQueue(UID)).toHaveLength(1);
});

test('guest migration queues entries and lists for the real account', () => {
  localStore.writeEntries('local-guest', { '21': entry() });
  localStore.writeLists('local-guest', [{ id: 'guest-list', name: 'Guest', order: 0, createdAt: 1 }]);
  localStore.migrate('local-guest', UID, { overwrite: false });
  expect(readQueue(UID).map((op) => op.type)).toEqual(['entry.upsert', 'list.upsert']);
});

test('different accounts do not share one single-flight promise', async () => {
  const pull = deferred<LibraryEntry[]>();
  jest.mocked(remote.pullEntries).mockReturnValueOnce(pull.promise);
  const first = syncNow(UID);
  const second = syncNow(OTHER);
  expect(first).not.toBe(second);
  await second;
  pull.resolve([]);
  await first;
});

test('account switch during sync cannot publish old entries or preferences', async () => {
  const pull = deferred<LibraryEntry[]>();
  jest.mocked(remote.pullEntries).mockReturnValueOnce(pull.promise);
  const syncing = useLibraryStore.getState().sync();
  useLibraryStore.getState().hydrate(OTHER);
  useSettingsStore.setState({ uid: OTHER, settings: { ...DEFAULT_SETTINGS, accent: 'cyan' } });
  pull.resolve([entry()]);
  await syncing;
  expect(useLibraryStore.getState()).toMatchObject({ uid: OTHER, entries: {}, syncing: false });
  expect(useSettingsStore.getState().settings.accent).toBe('cyan');
  expect(remote.pullProfile).not.toHaveBeenCalled();
});

test('settings edited while profile is fetching are not overwritten', async () => {
  const profile = deferred<Awaited<ReturnType<typeof remote.pullProfile>>>();
  jest.mocked(remote.pullProfile).mockReturnValueOnce(profile.promise);
  const syncing = syncNow(UID);
  // Entry/list reads run first; allow both to settle before the profile response.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  useSettingsStore.setState({ uid: UID, settings: { ...DEFAULT_SETTINGS, accent: 'cyan' } });
  enqueue(UID, { key: 'settings', type: 'settings.update', payload: useSettingsStore.getState().settings });
  profile.resolve({ settings: { ...DEFAULT_SETTINGS, accent: 'sunset' } });
  await syncing;
  expect(useSettingsStore.getState().settings.accent).toBe('cyan');
});

test('a persisted queue recovers a mutation whose snapshot write was interrupted', () => {
  enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entry(8, 800) });
  useLibraryStore.getState().clearSession();
  useLibraryStore.getState().hydrate(UID);
  expect(useLibraryStore.getState().entries['21']?.progress).toBe(8);
  localStore.clear(UID);
  expect(localStore.readEntries(UID)).toEqual({});
});

import {
  deleteMediaListEntryByMediaId,
  hasAniListToken,
  saveMediaListEntry,
} from '@/api/anilist';
import { getAniListTokenVersion } from '@/api/anilist/client';
import { isOnline } from '@/api/http';
import { timestampToFuzzyDate } from '@/utils/time';
import { localStore } from './localStore';
import type { CustomList, LibraryEntry, UserSettings } from './models';
import * as remote from './remote';
import { toAniListStatus } from './transforms';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  markFailed,
  MAX_SYNC_ATTEMPTS,
  readQueue,
  removeOp,
  type SyncOp,
} from './syncQueue';

/**
 * Drains the offline write queue, then reconciles a full Supabase snapshot.
 *
 * Conflict strategy (§6.3 F-23): last write wins, decided by `updatedAt`, and a
 * conflict is *reported* rather than swallowed so the UI can warn the user.
 */

export interface SyncResult {
  pushed: number;
  pulled: number;
  failed: number;
  conflicts: Conflict[];
  skipped: 'offline' | 'no-remote' | null;
}

export interface Conflict {
  anilistId: number;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
  winner: 'local' | 'remote';
}

const running = new Map<string, { promise: Promise<SyncResult>; current: () => boolean }>();

/** Coalesce only work belonging to the same live account session. */
export function syncNow(uid: string, current: () => boolean = () => true): Promise<SyncResult> {
  const existing = running.get(uid);
  if (existing?.current()) return existing.promise;
  const promise = run(uid, current).finally(() => {
    if (running.get(uid)?.promise === promise) running.delete(uid);
  });
  running.set(uid, { promise, current });
  return promise;
}

async function run(uid: string, current: () => boolean): Promise<SyncResult> {
  const tokenVersion = getAniListTokenVersion();
  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, conflicts: [], skipped: null };
  const hadPendingSettings = readQueue(uid).some((op) => op.type === 'settings.update');
  const mayMirror = () => current() && getAniListTokenVersion() === tokenVersion;

  // Guest libraries stay local until Supabase returns a real account id.
  if (uid.startsWith('local-')) {
    result.skipped = 'no-remote';
    return result;
  }

  if (!remote.remoteAvailable()) {
    result.skipped = 'no-remote';
    return result;
  }
  if (!isOnline()) {
    result.skipped = 'offline';
    return result;
  }

  for (const op of readQueue(uid)) {
    if (!current()) return result;
    if (op.attempts >= MAX_SYNC_ATTEMPTS) {
      result.failed += 1;
      continue;
    }
    try {
      await apply(uid, op, mayMirror);
      if (!current()) return result;
      removeOp(uid, op.key, op);
      result.pushed += 1;
    } catch (error) {
      if (!current()) return result;
      markFailed(uid, op.key, error instanceof Error ? error.message : String(error), op);
      result.failed += 1;
    }
  }

  if (!current()) return result;
  const remoteEntries = await remote.pullEntries(uid, null);
  if (!current()) return result;
  // The server snapshot is authoritative for acknowledged writes and deletions.
  // Read pending keys *after* the await to protect edits made while fetching.
  const pending = new Set(readQueue(uid).map((op) => op.key));
  const local = localStore.readEntries(uid);
  const merged: Record<string, LibraryEntry> = {};
  for (const incoming of remoteEntries) {
    const key = String(incoming.anilistId);
    if (pending.has(`entry:${key}`)) continue;
    const existing = local[key];
    if (existing && existing.updatedAt !== incoming.updatedAt) {
      result.conflicts.push({ anilistId: incoming.anilistId, localUpdatedAt: existing.updatedAt,
        remoteUpdatedAt: incoming.updatedAt, winner: 'remote' });
    }
    merged[key] = incoming;
    if (!existing || existing.updatedAt !== incoming.updatedAt) result.pulled += 1;
  }
  for (const [key, entry] of Object.entries(local)) {
    if (pending.has(`entry:${key}`)) merged[key] = entry;
  }
  localStore.writeEntries(uid, merged);

  const remoteLists = await remote.pullLists(uid);
  if (!current()) return result;
  const pendingLists = new Set(readQueue(uid).filter((op) => op.key.startsWith('list:')).map((op) => op.key));
  const lists = remoteLists.filter((list) => !pendingLists.has(`list:${list.id}`));
  for (const list of localStore.readLists(uid)) {
    if (pendingLists.has(`list:${list.id}`)) lists.push(list);
  }
  localStore.writeLists(uid, lists);

  const remoteProfile = await remote.pullProfile(uid);
  if (!current()) return result;
  if (remoteProfile?.settings && !hadPendingSettings &&
      !readQueue(uid).some((op) => op.type === 'settings.update') &&
      useSettingsStore.getState().uid === uid) {
    useSettingsStore.getState().replace({ ...useSettingsStore.getState().settings, ...remoteProfile.settings });
  }
  localStore.writeMeta(uid, { lastSyncedAt: Date.now(), lastRemoteUpdatedAt: null });

  return result;
}

async function apply(uid: string, op: SyncOp, mayMirror: () => boolean): Promise<void> {
  switch (op.type) {
    case 'entry.upsert':
      if (await remote.pushEntry(uid, op.payload as LibraryEntry) !== false && mayMirror()) await mirrorToAniList(op);
      return;
    case 'entry.delete':
      if (await remote.deleteEntry(uid, op.payload as number, op.version ?? op.queuedAt) !== false && mayMirror()) await mirrorDeleteToAniList(op);
      return;
    case 'list.upsert':
      await remote.pushList(uid, op.payload as CustomList, (op.payload as CustomList).updatedAt ?? op.queuedAt);
      return;
    case 'list.delete':
      await remote.deleteList(uid, op.payload as string, op.version ?? op.queuedAt);
      return;
    case 'settings.update':
      await remote.pushSettings(uid, op.payload as UserSettings);
      return;
    case 'profile.update':
      await remote.pushProfile(op.payload as Parameters<typeof remote.pushProfile>[0]);
      return;
  }
}

/**
 * F-23 write-back. A linked AniList account is meant to be the user's real
 * list, so every local edit mirrors outward on the same queue drain that
 * pushes to our own backend.
 *
 * Failure here is deliberately swallowed rather than thrown. The queue op has
 * already succeeded against our backend, and rethrowing would mark the whole op
 * failed and replay the backend write forever because AniList is rate limited
 * or the token expired. The local library stays correct either way; the next
 * edit to the same title re-attempts the mirror.
 */
async function mirrorToAniList(op: SyncOp): Promise<void> {
  if (op.origin === 'anilist') return;
  if (!hasAniListToken()) return;

  const entry = op.payload as LibraryEntry;
  try {
    await saveMediaListEntry({
      mediaId: entry.anilistId,
      status: toAniListStatus(entry.status),
      score: entry.score,
      progress: entry.progress,
      progressVolumes: entry.progressVolumes,
      repeat: entry.rewatches,
      notes: entry.notes,
      private: entry.private,
      startedAt: timestampToFuzzyDate(entry.startedAt),
      completedAt: timestampToFuzzyDate(entry.completedAt),
    });
  } catch {
    /* Rate limited, offline, or token revoked - see the note above. */
  }
}

async function mirrorDeleteToAniList(op: SyncOp): Promise<void> {
  if (op.origin === 'anilist') return;
  if (!hasAniListToken()) return;

  try {
    await deleteMediaListEntryByMediaId(op.payload as number);
  } catch {
    /* Same reasoning as mirrorToAniList. */
  }
}

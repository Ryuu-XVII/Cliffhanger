import {
  deleteMediaListEntryByMediaId,
  hasAniListToken,
  saveMediaListEntry,
} from '@/api/anilist';
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
 * Drains the offline write queue, then pulls anything newer from Firestore.
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

let running: Promise<SyncResult> | null = null;

/** Single-flight: concurrent triggers share one pass. */
export function syncNow(uid: string): Promise<SyncResult> {
  if (running) return running;
  running = run(uid).finally(() => {
    running = null;
  });
  return running;
}

async function run(uid: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, conflicts: [], skipped: null };
  const hadPendingSettings = readQueue(uid).some((op) => op.type === 'settings.update');

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
    if (op.attempts >= MAX_SYNC_ATTEMPTS) {
      result.failed += 1;
      continue;
    }
    try {
      await apply(uid, op);
      removeOp(uid, op.key);
      result.pushed += 1;
    } catch (error) {
      markFailed(uid, op.key, error instanceof Error ? error.message : String(error));
      result.failed += 1;
    }
  }

  const meta = localStore.readMeta(uid);
  const remoteEntries = await remote.pullEntries(uid, meta.lastRemoteUpdatedAt);
  // Read local state only now, after the network await - a user edit made
  // while pullEntries was in flight must not be clobbered by a stale snapshot
  // taken before that edit happened. No await follows until the write below,
  // so nothing can slip in between the read and the write.
  const local = localStore.readEntries(uid);
  let newestRemote = meta.lastRemoteUpdatedAt ?? 0;

  for (const incoming of remoteEntries) {
    newestRemote = Math.max(newestRemote, incoming.updatedAt ?? 0);
    const localKey = String(incoming.anilistId);
    const existing = local[localKey];

    if (!existing) {
      local[localKey] = incoming;
      result.pulled += 1;
      continue;
    }

    if (existing.updatedAt === incoming.updatedAt) continue;

    const winner = existing.updatedAt > incoming.updatedAt ? 'local' : 'remote';
    result.conflicts.push({
      anilistId: incoming.anilistId,
      localUpdatedAt: existing.updatedAt,
      remoteUpdatedAt: incoming.updatedAt,
      winner,
    });

    if (winner === 'remote') {
      local[localKey] = incoming;
      result.pulled += 1;
    }
  }

  localStore.writeEntries(uid, local);

  const remoteLists = await remote.pullLists(uid);
  if (remoteLists.length > 0) {
    const byId = new Map<string, CustomList>(
      localStore.readLists(uid).map((list) => [list.id, list]),
    );
    for (const list of remoteLists) if (!byId.has(list.id)) byId.set(list.id, list);
    localStore.writeLists(uid, Array.from(byId.values()));
  }

  // Restore account preferences on a new device, but never overwrite a local
  // settings edit that is still waiting to upload.
  const remoteProfile = await remote.pullProfile(uid);
  if (remoteProfile?.settings && !hadPendingSettings) {
    const settings = { ...useSettingsStore.getState().settings, ...remoteProfile.settings };
    useSettingsStore.getState().replace(settings);
  }

  localStore.writeMeta(uid, {
    lastSyncedAt: Date.now(),
    lastRemoteUpdatedAt: newestRemote || null,
  });

  return result;
}

async function apply(uid: string, op: SyncOp): Promise<void> {
  switch (op.type) {
    case 'entry.upsert':
      await remote.pushEntry(uid, op.payload as LibraryEntry);
      await mirrorToAniList(op);
      return;
    case 'entry.delete':
      await remote.deleteEntry(uid, op.payload as number);
      await mirrorDeleteToAniList(op);
      return;
    case 'list.upsert':
      await remote.pushList(uid, op.payload as CustomList);
      return;
    case 'list.delete':
      await remote.deleteList(uid, op.payload as string);
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

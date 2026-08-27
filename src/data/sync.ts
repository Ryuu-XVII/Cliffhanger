import { isOnline } from '@/api/http';
import { localStore } from './localStore';
import type { CustomList, LibraryEntry, UserSettings } from './models';
import * as remote from './remote';
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
  const local = localStore.readEntries(uid);
  let newestRemote = meta.lastRemoteUpdatedAt ?? 0;

  for (const incoming of remoteEntries) {
    newestRemote = Math.max(newestRemote, incoming.updatedAt ?? 0);
    const existing = local[String(incoming.anilistId)];

    if (!existing) {
      local[String(incoming.anilistId)] = incoming;
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
      local[String(incoming.anilistId)] = incoming;
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
      return;
    case 'entry.delete':
      await remote.deleteEntry(uid, op.payload as number);
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

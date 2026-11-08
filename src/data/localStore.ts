import { kv, readJson, writeJson } from '@/api/kv';
import { clearQueue, enqueue, readQueue } from './syncQueue';
import type { CustomList, LibraryEntry, UserSettings } from './models';

/**
 * The offline source of truth (F-10). Every read the UI performs hits this
 * first; Supabase is a sync target, not a dependency of rendering.
 *
 * Data is namespaced per uid so an anonymous library and a signed-in library
 * never bleed into each other - and so the anonymous-to-account upgrade can
 * copy one namespace onto another (§5).
 */

const ENTRIES = (uid: string): string => `lib:${uid}:entries`;
const LISTS = (uid: string): string => `lib:${uid}:lists`;
const SETTINGS = (uid: string): string => `lib:${uid}:settings`;
const META = (uid: string): string => `lib:${uid}:meta`;

export interface LocalMeta {
  lastSyncedAt: number | null;
  /** Legacy cursor retained for reading metadata written by older clients. */
  lastRemoteUpdatedAt: number | null;
}

export const localStore = {
  readEntries(uid: string): Record<string, LibraryEntry> {
    const entries = readJson<Record<string, LibraryEntry>>(ENTRIES(uid)) ?? {};
    // The durable queue is also a recovery log if the subsequent local
    // snapshot write failed (for example when device storage filled up).
    for (const op of readQueue(uid)) {
      if (op.type === 'entry.upsert') {
        const entry = op.payload as LibraryEntry;
        if (!entries[String(entry.anilistId)] || entries[String(entry.anilistId)]!.updatedAt <= entry.updatedAt) entries[String(entry.anilistId)] = entry;
      } else if (op.type === 'entry.delete') {
        const key = String(op.payload);
        if (!entries[key] || entries[key]!.updatedAt <= (op.version ?? op.queuedAt)) delete entries[key];
      }
    }
    return entries;
  },

  writeEntries(uid: string, entries: Record<string, LibraryEntry>): void {
    writeJson(ENTRIES(uid), entries);
  },

  readLists(uid: string): CustomList[] {
    const lists = new Map((readJson<CustomList[]>(LISTS(uid)) ?? []).map((list) => [list.id, list]));
    for (const op of readQueue(uid)) {
      if (op.type === 'list.upsert') { const list = op.payload as CustomList; lists.set(list.id, list); }
      else if (op.type === 'list.delete') lists.delete(op.payload as string);
    }
    return Array.from(lists.values());
  },

  writeLists(uid: string, lists: CustomList[]): void {
    writeJson(LISTS(uid), lists);
  },

  readSettings(uid: string): Partial<UserSettings> | null {
    return readJson<Partial<UserSettings>>(SETTINGS(uid));
  },

  writeSettings(uid: string, settings: UserSettings): void {
    writeJson(SETTINGS(uid), settings);
  },

  readMeta(uid: string): LocalMeta {
    return readJson<LocalMeta>(META(uid)) ?? { lastSyncedAt: null, lastRemoteUpdatedAt: null };
  },

  writeMeta(uid: string, meta: LocalMeta): void {
    writeJson(META(uid), meta);
  },

  /**
   * Guest-to-account upgrade: copy local data and enqueue it for cloud sync.
   */
  migrate(fromUid: string, toUid: string, options: { overwrite: boolean }): void {
    const source = localStore.readEntries(fromUid);
    const target = options.overwrite ? {} : localStore.readEntries(toUid);
    for (const [id, entry] of Object.entries(source)) {
      const existing = target[id];
      // Last write wins on a per-entry basis so nothing silently regresses.
      if (!existing || existing.updatedAt < entry.updatedAt) target[id] = entry;
    }
    for (const entry of Object.values(target)) {
      enqueue(toUid, { key: `entry:${entry.anilistId}`, type: 'entry.upsert', payload: entry, origin: 'anilist' });
    }
    localStore.writeEntries(toUid, target);

    const lists = localStore.readLists(fromUid);
    if (lists.length > 0) {
      const existing = options.overwrite ? [] : localStore.readLists(toUid);
      const byId = new Map(existing.map((list) => [list.id, list]));
      for (const list of lists) if (!byId.has(list.id)) byId.set(list.id, list);
      for (const list of byId.values()) enqueue(toUid, { key: `list:${list.id}`, type: 'list.upsert', payload: list });
      localStore.writeLists(toUid, Array.from(byId.values()));
    }
  },

  clear(uid: string): void {
    clearQueue(uid);
    kv().delete(ENTRIES(uid));
    kv().delete(LISTS(uid));
    kv().delete(SETTINGS(uid));
    kv().delete(META(uid));
  },
};

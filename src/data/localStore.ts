import { kv, readJson, writeJson } from '@/api/kv';
import type { CustomList, LibraryEntry, UserSettings } from './models';

/**
 * The offline source of truth (F-10). Every read the UI performs hits this
 * first; Firestore is a sync target, not a dependency of rendering.
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
  /** Cursor for pulling only what changed since the last sync. */
  lastRemoteUpdatedAt: number | null;
}

export const localStore = {
  readEntries(uid: string): Record<string, LibraryEntry> {
    return readJson<Record<string, LibraryEntry>>(ENTRIES(uid)) ?? {};
  },

  writeEntries(uid: string, entries: Record<string, LibraryEntry>): void {
    writeJson(ENTRIES(uid), entries);
  },

  readLists(uid: string): CustomList[] {
    return readJson<CustomList[]>(LISTS(uid)) ?? [];
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
   * Anonymous to named upgrade (§5). Firebase keeps the same uid when an
   * anonymous account is linked, so this is only needed when the user signs in
   * to a *different* existing account and chooses to keep local data.
   */
  migrate(fromUid: string, toUid: string, options: { overwrite: boolean }): void {
    const source = localStore.readEntries(fromUid);
    const target = options.overwrite ? {} : localStore.readEntries(toUid);
    for (const [id, entry] of Object.entries(source)) {
      const existing = target[id];
      // Last write wins on a per-entry basis so nothing silently regresses.
      if (!existing || existing.updatedAt < entry.updatedAt) target[id] = entry;
    }
    localStore.writeEntries(toUid, target);

    const lists = localStore.readLists(fromUid);
    if (lists.length > 0) {
      const existing = options.overwrite ? [] : localStore.readLists(toUid);
      const byId = new Map(existing.map((list) => [list.id, list]));
      for (const list of lists) if (!byId.has(list.id)) byId.set(list.id, list);
      localStore.writeLists(toUid, Array.from(byId.values()));
    }
  },

  clear(uid: string): void {
    kv().delete(ENTRIES(uid));
    kv().delete(LISTS(uid));
    kv().delete(SETTINGS(uid));
    kv().delete(META(uid));
  },
};

import { create } from 'zustand';

import type { AniListMedia, AniListMediaLite } from '@/api/anilist/types';
import { scheduleAutoSync } from '@/data/autoSync';
import { localStore } from '@/data/localStore';
import {
  emptyEntry,
  type CustomList,
  type LibraryEntry,
  type ListStatus,
  type MediaType,
} from '@/data/models';
import { syncNow } from '@/data/sync';
import { enqueue, pendingCount, type SyncOp } from '@/data/syncQueue';
import { mediaTypeOf, toSnapshot } from '@/data/transforms';

/**
 * The library store is the app-wide source of truth for user data. Every
 * mutation is applied locally and synchronously first (F-05 demands the +1 be
 * instant), then persisted to local storage, then queued for Firestore.
 * The network is never on the critical path of an interaction.
 */

type SyncOrigin = NonNullable<SyncOp['origin']>;

interface LibraryState {
  uid: string | null;
  hydrated: boolean;
  entries: Record<string, LibraryEntry>;
  lists: CustomList[];
  pending: number;
  syncing: boolean;
  lastSyncedAt: number | null;
  /** Set when a pull overwrote a local edit, so the UI can warn (F-23). */
  conflictWarning: string | null;

  hydrate: (uid: string) => void;
  clearSession: () => void;
  sync: () => Promise<void>;
  dismissConflict: () => void;

  add: (media: AniListMediaLite | AniListMedia, status?: ListStatus) => LibraryEntry;
  remove: (anilistId: number) => LibraryEntry | null;
  update: (anilistId: number, patch: Partial<LibraryEntry>) => LibraryEntry | null;
  /**
   * Writes an entry back verbatim - used by undo and by the AniList import.
   * Pass 'anilist' as the origin when the entry came from AniList so F-23's
   * write-back does not immediately push it straight back out again.
   */
  restore: (entry: LibraryEntry, origin?: SyncOrigin) => void;

  setStatus: (anilistId: number, status: ListStatus) => void;
  setProgress: (anilistId: number, progress: number) => ProgressOutcome;
  increment: (anilistId: number, delta?: number) => ProgressOutcome;
  setScore: (anilistId: number, score: number | null) => void;

  createList: (name: string) => CustomList;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  toggleListMembership: (anilistId: number, listId: string) => void;
}

export interface ProgressOutcome {
  entry: LibraryEntry | null;
  /** Snapshot of the entry before the change, for undo. */
  previous: LibraryEntry | null;
  completed: boolean;
  /** True when a rewatch pass finished and the counter ticked up (F-17). */
  rewatchCompleted: boolean;
}

const NO_OP: ProgressOutcome = {
  entry: null,
  previous: null,
  completed: false,
  rewatchCompleted: false,
};

export const useLibraryStore = create<LibraryState>((set, get) => {
  function persist(entries: Record<string, LibraryEntry>): void {
    const uid = get().uid;
    if (uid) localStore.writeEntries(uid, entries);
  }

  function persistLists(lists: CustomList[]): void {
    const uid = get().uid;
    if (uid) localStore.writeLists(uid, lists);
  }

  function autoSync(): void {
    scheduleAutoSync(() => void get().sync());
  }

  function queueEntry(entry: LibraryEntry, origin: SyncOrigin = 'local'): void {
    const uid = get().uid;
    if (!uid) return;
    enqueue(uid, {
      key: 'entry:' + entry.anilistId,
      type: 'entry.upsert',
      payload: entry,
      origin,
    });
    set({ pending: pendingCount(uid) });
    autoSync();
  }

  function commit(entry: LibraryEntry, origin: SyncOrigin = 'local'): LibraryEntry {
    const stamped = { ...entry, updatedAt: Date.now() };
    const entries = { ...get().entries, [String(stamped.anilistId)]: stamped };
    set({ entries });
    persist(entries);
    queueEntry(stamped, origin);
    return stamped;
  }

  return {
    uid: null,
    hydrated: false,
    entries: {},
    lists: [],
    pending: 0,
    syncing: false,
    lastSyncedAt: null,
    conflictWarning: null,

    hydrate: (uid) => {
      const meta = localStore.readMeta(uid);
      set({
        uid,
        entries: localStore.readEntries(uid),
        lists: localStore.readLists(uid),
        pending: pendingCount(uid),
        lastSyncedAt: meta.lastSyncedAt,
        hydrated: true,
      });
    },

    clearSession: () =>
      set({
        uid: null,
        entries: {},
        lists: [],
        pending: 0,
        hydrated: false,
        lastSyncedAt: null,
        conflictWarning: null,
      }),

    sync: async () => {
      const uid = get().uid;
      if (!uid || get().syncing) return;

      set({ syncing: true });
      try {
        const result = await syncNow(uid);
        const meta = localStore.readMeta(uid);
        set({
          entries: localStore.readEntries(uid),
          lists: localStore.readLists(uid),
          pending: pendingCount(uid),
          lastSyncedAt: meta.lastSyncedAt,
          conflictWarning:
            result.conflicts.some((conflict) => conflict.winner === 'remote')
              ? 'Some entries were updated on another device and replaced your local changes.'
              : get().conflictWarning,
        });
      } finally {
        set({ syncing: false });
      }
    },

    dismissConflict: () => set({ conflictWarning: null }),

    add: (media, status = 'PLANNING') => {
      const existing = get().entries[String(media.id)];
      if (existing) return existing;

      const type: MediaType = mediaTypeOf(media);
      const base = emptyEntry(media.id, toSnapshot(media));
      const entry: LibraryEntry = {
        ...base,
        malId: media.idMal ?? null,
        mediaType: type,
        status,
        startedAt: status === 'WATCHING' || status === 'REWATCHING' ? Date.now() : null,
      };
      return commit(entry);
    },

    remove: (anilistId) => {
      const entry = get().entries[String(anilistId)];
      if (!entry) return null;

      const entries = { ...get().entries };
      delete entries[String(anilistId)];
      set({ entries });
      persist(entries);

      const uid = get().uid;
      if (uid) {
        enqueue(uid, { key: 'entry:' + anilistId, type: 'entry.delete', payload: anilistId });
        set({ pending: pendingCount(uid) });
        autoSync();
      }
      return entry;
    },

    update: (anilistId, patch) => {
      const entry = get().entries[String(anilistId)];
      if (!entry) return null;
      return commit({ ...entry, ...patch });
    },

    restore: (entry, origin = 'local') => {
      commit(entry, origin);
    },

    setStatus: (anilistId, status) => {
      const entry = get().entries[String(anilistId)];
      if (!entry) return;

      const next: LibraryEntry = { ...entry, status };
      const total = totalUnits(entry);

      if (status === 'COMPLETED') {
        next.completedAt = entry.completedAt ?? Date.now();
        if (total) next.progress = total;
      }
      if (status === 'WATCHING' && !entry.startedAt) next.startedAt = Date.now();
      if (status === 'REWATCHING') {
        // A rewatch starts from zero but keeps the completion history.
        next.progress = 0;
        next.startedAt = Date.now();
      }
      commit(next);
    },

    setProgress: (anilistId, progress) => applyProgress(anilistId, () => progress),

    increment: (anilistId, delta = 1) =>
      applyProgress(anilistId, (current) => current + delta),

    setScore: (anilistId, score) => {
      const entry = get().entries[String(anilistId)];
      if (!entry) return;
      commit({ ...entry, score });
    },

    createList: (name) => {
      const list: CustomList = {
        id: 'list-' + Date.now().toString(36),
        name: name.trim(),
        order: get().lists.length,
        createdAt: Date.now(),
      };
      const lists = [...get().lists, list];
      set({ lists });
      persistLists(lists);

      const uid = get().uid;
      if (uid) {
        enqueue(uid, { key: 'list:' + list.id, type: 'list.upsert', payload: list });
        set({ pending: pendingCount(uid) });
        autoSync();
      }
      return list;
    },

    renameList: (id, name) => {
      const lists = get().lists.map((list) =>
        list.id === id ? { ...list, name: name.trim() } : list,
      );
      set({ lists });
      persistLists(lists);

      const uid = get().uid;
      const updated = lists.find((list) => list.id === id);
      if (uid && updated) {
        enqueue(uid, { key: 'list:' + id, type: 'list.upsert', payload: updated });
        set({ pending: pendingCount(uid) });
        autoSync();
      }
    },

    deleteList: (id) => {
      const lists = get().lists.filter((list) => list.id !== id);
      set({ lists });
      persistLists(lists);

      // Drop the membership from every entry so nothing points at a dead list.
      const entries = { ...get().entries };
      let changed = false;
      for (const [key, entry] of Object.entries(entries)) {
        if (entry.customListIds.includes(id)) {
          entries[key] = {
            ...entry,
            customListIds: entry.customListIds.filter((listId) => listId !== id),
            updatedAt: Date.now(),
          };
          changed = true;
          queueEntry(entries[key] as LibraryEntry);
        }
      }
      if (changed) {
        set({ entries });
        persist(entries);
      }

      const uid = get().uid;
      if (uid) {
        enqueue(uid, { key: 'list:' + id, type: 'list.delete', payload: id });
        set({ pending: pendingCount(uid) });
        autoSync();
      }
    },

    toggleListMembership: (anilistId, listId) => {
      const entry = get().entries[String(anilistId)];
      if (!entry) return;
      const has = entry.customListIds.includes(listId);
      commit({
        ...entry,
        customListIds: has
          ? entry.customListIds.filter((id) => id !== listId)
          : [...entry.customListIds, listId],
      });
    },
  };

  /**
   * F-04: progress changes clamp to the episode count, auto-complete on the
   * final episode, and report enough for the caller to offer an undo.
   */
  function applyProgress(
    anilistId: number,
    next: (current: number) => number,
  ): ProgressOutcome {
    const entry = get().entries[String(anilistId)];
    if (!entry) return NO_OP;

    const previous = entry;
    const total = totalUnits(entry);
    const raw = next(entry.progress);
    const clamped = Math.max(0, total === null ? raw : Math.min(raw, total));

    if (clamped === entry.progress) {
      return { entry, previous, completed: false, rewatchCompleted: false };
    }

    const updated: LibraryEntry = { ...entry, progress: clamped };
    if (!updated.startedAt && clamped > 0) updated.startedAt = Date.now();

    let completed = false;
    let rewatchCompleted = false;

    if (total !== null && clamped >= total && total > 0) {
      completed = true;
      if (entry.status === 'REWATCHING') {
        rewatchCompleted = true;
        updated.rewatches = entry.rewatches + 1;
      }
      updated.status = 'COMPLETED';
      updated.completedAt = Date.now();
    } else if (
      entry.status !== 'WATCHING' &&
      entry.status !== 'REWATCHING' &&
      clamped > 0 &&
      clamped < (total ?? Infinity)
    ) {
      // Logging an episode on a planned or dropped title resumes it.
      updated.status = entry.status === 'COMPLETED' ? 'REWATCHING' : 'WATCHING';
      if (updated.status === 'REWATCHING') updated.completedAt = entry.completedAt;
    }

    return { entry: commit(updated), previous, completed, rewatchCompleted };
  }
});

/** Episodes for anime, chapters for manga (F-25). */
export function totalUnits(entry: LibraryEntry): number | null {
  if (entry.mediaType === 'MANGA') return entry.snapshot.totalChapters ?? null;
  return entry.snapshot.totalEpisodes ?? null;
}

export function unitNoun(entry: LibraryEntry, plural = false): string {
  const noun = entry.mediaType === 'MANGA' ? 'chapter' : 'episode';
  return plural ? noun + 's' : noun;
}

/* ----------------------------- selectors ----------------------------- */

/**
 * DO NOT pass this straight to useLibraryStore(). It builds a new object on
 * every call, and Zustand v5 compares snapshots by reference - handing it to
 * the hook is an infinite render loop that React kills with "Maximum update
 * depth exceeded". Select the stable `entries` map and derive with useMemo.
 */
export function countByStatus(
  entries: Record<string, LibraryEntry>,
): Record<ListStatus, number> {
  const counts: Record<ListStatus, number> = {
    WATCHING: 0,
    PLANNING: 0,
    COMPLETED: 0,
    ON_HOLD: 0,
    DROPPED: 0,
    REWATCHING: 0,
  };
  for (const entry of Object.values(entries)) counts[entry.status] += 1;
  return counts;
}

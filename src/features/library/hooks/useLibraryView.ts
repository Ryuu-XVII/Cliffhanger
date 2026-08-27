import { useMemo } from 'react';
import { create } from 'zustand';

import type { LibraryEntry, ListStatus } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * F-07 - filter by state, sort by title, score, progress, last updated or
 * airing date, in either layout. The view state is a store rather than screen
 * state so returning to the tab restores what you were looking at.
 */

export type SortKey = 'updated' | 'title' | 'score' | 'progress' | 'airing';

export const SORT_LABELS: Record<SortKey, string> = {
  updated: 'Last updated',
  title: 'Title',
  score: 'Score',
  progress: 'Progress',
  airing: 'Airing date',
};

interface LibraryViewState {
  status: ListStatus;
  sort: SortKey;
  descending: boolean;
  /** null means every entry regardless of custom list membership. */
  listId: string | null;
  genre: string | null;
  setStatus: (status: ListStatus) => void;
  setSort: (sort: SortKey) => void;
  toggleDirection: () => void;
  setListId: (listId: string | null) => void;
  setGenre: (genre: string | null) => void;
}

export const useLibraryViewStore = create<LibraryViewState>((set, get) => ({
  status: 'WATCHING',
  sort: 'updated',
  descending: true,
  listId: null,
  genre: null,
  setStatus: (status) => set({ status }),
  setSort: (sort) =>
    set({
      sort,
      // Sensible default direction per key: A-Z for titles, biggest-first for
      // everything numeric.
      descending: sort !== 'title',
    }),
  toggleDirection: () => set({ descending: !get().descending }),
  setListId: (listId) => set({ listId }),
  setGenre: (genre) => set({ genre }),
}));

export function useLibraryView(): {
  entries: LibraryEntry[];
  total: number;
} {
  const entries = useLibraryStore((state) => state.entries);
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const { status, sort, descending, listId, genre } = useLibraryViewStore();

  return useMemo(() => {
    const all = Object.values(entries);
    const filtered = all.filter((entry) => {
      if (entry.status !== status) return false;
      if (listId && !entry.customListIds.includes(listId)) return false;
      if (genre && !entry.snapshot.genres.includes(genre)) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => compare(a, b, sort, language));
    return {
      entries: descending ? sorted.reverse() : sorted,
      total: filtered.length,
    };
  }, [entries, status, sort, descending, listId, genre, language]);
}

function compare(
  a: LibraryEntry,
  b: LibraryEntry,
  sort: SortKey,
  language: ReturnType<typeof useSettingsStore.getState>['settings']['titleLanguage'],
): number {
  switch (sort) {
    case 'title':
      // Reversed so the descending flip yields A-Z, which is what people expect
      // from the default title sort.
      return resolveTitle(b.snapshot.title, language).localeCompare(
        resolveTitle(a.snapshot.title, language),
      );
    case 'score':
      return (a.score ?? -1) - (b.score ?? -1);
    case 'progress':
      return a.progress - b.progress;
    case 'airing': {
      const airing = (entry: LibraryEntry): number => entry.snapshot.nextAiringAt ?? Number.MAX_SAFE_INTEGER;
      const aTime = airing(a);
      const bTime = airing(b);
      return aTime !== bTime ? aTime - bTime : a.updatedAt - b.updatedAt;
    }
    case 'updated':
    default:
      return a.updatedAt - b.updatedAt;
  }
}

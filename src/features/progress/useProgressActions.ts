import { useCallback } from 'react';
import { create } from 'zustand';

import { resolveTitle } from '@/data/titles';
import type { LibraryEntry } from '@/data/models';
import { totalUnits, unitNoun, useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';

/**
 * F-04 and F-05 in one place, so the +1 on the home screen, the +1 on a library
 * card and the counter on the detail screen cannot drift apart.
 *
 * Every path here is synchronous. Storage writes and sync queueing happen
 * inside the store, and neither is awaited before the UI updates.
 */

interface CelebrationState {
  entry: LibraryEntry | null;
  rewatchCount: number;
  show: (entry: LibraryEntry, rewatchCount: number) => void;
  hide: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set) => ({
  entry: null,
  rewatchCount: 0,
  show: (entry, rewatchCount) => set({ entry, rewatchCount }),
  hide: () => set({ entry: null, rewatchCount: 0 }),
}));

export function useProgressActions() {
  const increment = useLibraryStore((state) => state.increment);
  const setProgress = useLibraryStore((state) => state.setProgress);
  const restore = useLibraryStore((state) => state.restore);
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const celebrate = useCelebrationStore((state) => state.show);

  const logEpisode = useCallback(
    (anilistId: number, delta = 1) => {
      const outcome = increment(anilistId, delta);
      const { entry, previous, completed, rewatchCompleted } = outcome;
      if (!entry || !previous) return outcome;

      const title = resolveTitle(entry.snapshot.title, language);
      const noun = unitNoun(entry);

      if (completed) {
        // The orchestrated moment (§9), with the undo still reachable.
        celebrate(entry, rewatchCompleted ? entry.rewatches : 0);
        toast.undo('Completed ' + title, () => restore(previous));
      } else if (entry.progress !== previous.progress) {
        const total = totalUnits(entry);
        const suffix = total ? ' of ' + total : '';
        toast.undo(
          noun.charAt(0).toUpperCase() + noun.slice(1) + ' ' + entry.progress + suffix,
          () => restore(previous),
        );
      }

      return outcome;
    },
    [increment, restore, language, celebrate],
  );

  const setEpisode = useCallback(
    (anilistId: number, value: number) => {
      const outcome = setProgress(anilistId, value);
      const { entry, previous, completed, rewatchCompleted } = outcome;
      if (!entry || !previous) return outcome;

      if (completed) {
        celebrate(entry, rewatchCompleted ? entry.rewatches : 0);
        toast.undo('Completed ' + resolveTitle(entry.snapshot.title, language), () =>
          restore(previous),
        );
      }
      return outcome;
    },
    [setProgress, restore, language, celebrate],
  );

  return { logEpisode, setEpisode };
}

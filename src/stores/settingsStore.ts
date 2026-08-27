import { create } from 'zustand';

import { readJson, writeJson } from '@/api/kv';
import { localStore } from '@/data/localStore';
import { DEFAULT_SETTINGS, type UserSettings } from '@/data/models';
import { enqueue } from '@/data/syncQueue';

/**
 * Settings are read on nearly every render (title language, score format), so
 * they live in a synchronous store hydrated from local storage at module load.
 * Nothing here waits on the network - the network is told afterwards.
 */

const KEY = 'settings:v1';

interface SettingsState {
  settings: UserSettings;
  /** Set once auth resolves, so changes can be queued for the right user. */
  uid: string | null;
  setUid: (uid: string | null) => void;
  update: (patch: Partial<UserSettings>) => void;
  replace: (settings: UserSettings) => void;
  reset: () => void;
}

function hydrate(): UserSettings {
  const stored = readJson<Partial<UserSettings>>(KEY);
  // Merge over defaults so a new setting added in an update is never undefined.
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: hydrate(),
  uid: null,

  setUid: (uid) => {
    if (!uid) {
      set({ uid: null });
      return;
    }
    const saved = localStore.readSettings(uid);
    const settings = saved ? { ...DEFAULT_SETTINGS, ...saved } : get().settings;
    set({ uid, settings });
    localStore.writeSettings(uid, settings);
  },

  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    writeJson(KEY, next);
    const uid = get().uid;
    if (uid) localStore.writeSettings(uid, next);

    if (uid) {
      enqueue(uid, { key: 'settings', type: 'settings.update', payload: next });
    }
  },

  replace: (settings) => {
    set({ settings });
    writeJson(KEY, settings);
    const uid = get().uid;
    if (uid) localStore.writeSettings(uid, settings);
  },

  reset: () => {
    set({ settings: DEFAULT_SETTINGS });
    writeJson(KEY, DEFAULT_SETTINGS);
    const uid = get().uid;
    if (uid) localStore.writeSettings(uid, DEFAULT_SETTINGS);
  },
}));

/** Non-hook accessor for the API/notification layers. */
export function currentSettings(): UserSettings {
  return useSettingsStore.getState().settings;
}

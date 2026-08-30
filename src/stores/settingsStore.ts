import { create } from 'zustand';

import { readJson, writeJson } from '@/api/kv';
import { scheduleAutoSync } from '@/data/autoSync';
import { localStore } from '@/data/localStore';
import { DEFAULT_SETTINGS, type UserSettings } from '@/data/models';
import { enqueue } from '@/data/syncQueue';
import { useLibraryStore } from './libraryStore';

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
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  // A guest's settings never leave the device (§ privacy policy), so there is
  // no remote copy that could later overwrite this - the local flip is enough.
  const { settings } = applyDefaultMigrations(merged, 'guest');
  return settings;
}

/**
 * Runs a one-time correction on a still-default value that a prior version of
 * the app shipped as the default. A stored value always wins over the default
 * it gets merged with, so simply changing DEFAULT_SETTINGS above does nothing
 * for an install that already wrote the old default to disk - this flips it
 * exactly once per storage scope (guest, or a signed-in uid) and never
 * touches it again, so a later explicit choice by the user sticks for good.
 * `transform` returns `null` when nothing needs to change.
 */
function runOneTimeMigration(
  settings: UserSettings,
  scope: string,
  migrationId: string,
  transform: (settings: UserSettings) => UserSettings | null,
): { settings: UserSettings; migrated: boolean } {
  const flagKey = 'settings:migrated-' + migrationId + ':v1:' + scope;
  if (readJson<boolean>(flagKey)) return { settings, migrated: false };
  writeJson(flagKey, true);
  const next = transform(settings);
  return next ? { settings: next, migrated: true } : { settings, migrated: false };
}

function migrateTitleLanguageDefault(settings: UserSettings, scope: string) {
  return runOneTimeMigration(settings, scope, 'title-language-default', (s) =>
    s.titleLanguage === 'romaji' ? { ...s, titleLanguage: 'english' } : null,
  );
}

/**
 * Notifications used to default to on, which meant the OS permission prompt
 * fired before the user had asked for anything - the app now asks during
 * onboarding instead (app/onboarding.tsx) and defaults to off. An install
 * still sitting on the old always-on default gets flipped to match.
 */
function migrateNotificationDefaults(settings: UserSettings, scope: string) {
  return runOneTimeMigration(settings, scope, 'notification-defaults', (s) =>
    s.notificationsEnabled || s.notifyOnAiringDefault
      ? { ...s, notificationsEnabled: false, notifyOnAiringDefault: false }
      : null,
  );
}

/** Runs every default-value migration in sequence for one storage scope. */
function applyDefaultMigrations(
  settings: UserSettings,
  scope: string,
): { settings: UserSettings; migrated: boolean } {
  const a = migrateTitleLanguageDefault(settings, scope);
  const b = migrateNotificationDefaults(a.settings, scope);
  return { settings: b.settings, migrated: a.migrated || b.migrated };
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
    const merged = saved ? { ...DEFAULT_SETTINGS, ...saved } : get().settings;
    const { settings, migrated } = applyDefaultMigrations(merged, uid);
    set({ uid, settings });
    localStore.writeSettings(uid, settings);

    // A guest's local-only uid has nothing to push to (sync.ts skips it the
    // same way); a real account's flip needs to reach the backend so a later
    // pull does not restore the old 'romaji' value.
    if (migrated && !uid.startsWith('local-')) {
      enqueue(uid, { key: 'settings', type: 'settings.update', payload: settings });
      scheduleAutoSync(() => void useLibraryStore.getState().sync());
    }
  },

  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    writeJson(KEY, next);
    const uid = get().uid;
    if (uid) localStore.writeSettings(uid, next);

    if (uid) {
      enqueue(uid, { key: 'settings', type: 'settings.update', payload: next });
      scheduleAutoSync(() => void useLibraryStore.getState().sync());
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

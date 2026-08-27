import { onAuthStateChanged, type User } from 'firebase/auth';
import { create } from 'zustand';

import { setAniListToken } from '@/api/anilist';
import { readJson, writeJson } from '@/api/kv';
import { clearAniListToken, readAniListToken } from '@/data/auth';
import { firebaseAuth, isFirebaseConfigured } from '@/data/firebase';
import { localStore } from '@/data/localStore';
import type { LinkedAccounts } from '@/data/models';
import { useLibraryStore } from './libraryStore';
import { useSettingsStore } from './settingsStore';

/**
 * Owns the session. The app never blocks on this: an unconfigured or offline
 * Firebase still yields a usable local uid so the library works (F-10, §12).
 */

const LOCAL_UID_KEY = 'auth:local-uid';
const LINKED_KEY = 'auth:linked';
const UPGRADE_PROMPT_KEY = 'auth:upgrade-prompt-shown';

/** §5 - prompt to upgrade after a meaningful action, never on first launch. */
export const UPGRADE_PROMPT_THRESHOLD = 10;

interface AuthState {
  ready: boolean;
  user: User | null;
  /** Always set once ready: the Firebase uid, or a stable device-local id. */
  uid: string | null;
  isAnonymous: boolean;
  linked: LinkedAccounts;
  upgradePromptShown: boolean;

  initialise: () => () => void;
  setLinked: (patch: Partial<LinkedAccounts>) => void;
  markUpgradePromptShown: () => void;
  shouldPromptUpgrade: (entryCount: number) => boolean;
  resetLocalSession: () => void;
}

function localUid(): string {
  const existing = readJson<string>(LOCAL_UID_KEY);
  if (existing) return existing;
  const generated = 'local-' + Math.random().toString(36).slice(2, 12);
  writeJson(LOCAL_UID_KEY, generated);
  return generated;
}

function readLinked(): LinkedAccounts {
  return readJson<LinkedAccounts>(LINKED_KEY) ?? { anilist: null, mal: null };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  user: null,
  uid: null,
  isAnonymous: true,
  linked: readLinked(),
  upgradePromptShown: readJson<boolean>(UPGRADE_PROMPT_KEY) ?? false,

  initialise: () => {
    // Restore the AniList token before any query runs so authenticated reads
    // respect the account preferences from the first request onward.
    void readAniListToken().then((token) => setAniListToken(token));

    if (!isFirebaseConfigured()) {
      const uid = localUid();
      adoptSession(uid);
      set({ ready: true, uid, user: null, isAnonymous: true });
      return () => undefined;
    }

    const auth = firebaseAuth();
    if (!auth) {
      const uid = localUid();
      adoptSession(uid);
      set({ ready: true, uid, isAnonymous: true });
      return () => undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? localUid();
      const previousUid = get().uid;

      if (previousUid && previousUid !== uid) {
        // Linked credentials are device-local; clear them when the account
        // changes so one user's AniList identity cannot appear for another.
        void clearAniListToken();
        const emptyLinked: LinkedAccounts = { anilist: null, mal: null };
        writeJson(LINKED_KEY, emptyLinked);
        set({ linked: emptyLinked });
      }

      // Signing into a *different* account: carry the local library across so a
      // user never loses what they logged before creating an account (§5).
      if (previousUid && previousUid !== uid && previousUid.startsWith('local-')) {
        localStore.migrate(previousUid, uid, { overwrite: false });
      }

      adoptSession(uid);
      set({
        ready: true,
        user,
        uid,
        isAnonymous: user ? user.isAnonymous : true,
      });

      if (user) void useLibraryStore.getState().sync();
    });

    return unsubscribe;
  },

  setLinked: (patch) => {
    const linked = { ...get().linked, ...patch };
    set({ linked });
    writeJson(LINKED_KEY, linked);
  },

  markUpgradePromptShown: () => {
    set({ upgradePromptShown: true });
    writeJson(UPGRADE_PROMPT_KEY, true);
  },

  shouldPromptUpgrade: (entryCount) =>
    get().isAnonymous && !get().upgradePromptShown && entryCount >= UPGRADE_PROMPT_THRESHOLD,

  resetLocalSession: () => {
    const uid = get().uid;
    if (uid) localStore.clear(uid);
    useLibraryStore.getState().clearSession();
  },
}));

function adoptSession(uid: string): void {
  useSettingsStore.getState().setUid(uid);
  useLibraryStore.getState().hydrate(uid);
}

import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { getAniListTokenVersion, setAniListToken } from '@/api/anilist/client';
import { readJson, writeJson } from '@/api/kv';
import { clearAniListToken, readAniListToken } from '@/data/auth';
import { supabase, supabaseConfigured } from '@/data/supabase';
import { localStore } from '@/data/localStore';
import type { LinkedAccounts } from '@/data/models';
import { useLibraryStore } from './libraryStore';
import { useSettingsStore } from './settingsStore';

/**
 * Owns the session. The app never blocks on this: an unconfigured or offline
 * Supabase still yields a usable local uid so the library works (F-10, §12).
 */

const LOCAL_UID_KEY = 'auth:local-uid';
const LINKED_KEY = 'auth:linked';
const LINK_OWNER_KEY = 'auth:linked-owner';
const UPGRADE_PROMPT_KEY = 'auth:upgrade-prompt-shown';

/** §5 - prompt to upgrade after a meaningful action, never on first launch. */
export const UPGRADE_PROMPT_THRESHOLD = 10;

interface AuthState {
  ready: boolean;
  user: User | null;
  /** Always set once ready: the Supabase uid, or a stable device-local id. */
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
  const generated = `local-${Math.random().toString(36).slice(2, 12)}`;
  writeJson(LOCAL_UID_KEY, generated);
  return generated;
}

function readLinked(): LinkedAccounts {
  return readJson<LinkedAccounts>(LINKED_KEY) ?? { anilist: null, mal: null };
}

/** The name shown in headers and the profile screen - never call this before `ready`. */
export function displayName(state: Pick<AuthState, 'user' | 'isAnonymous'>): string {
  return state.user?.user_metadata?.display_name ?? (state.isAnonymous ? 'Guest' : (state.user?.email ?? 'You'));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  user: null,
  uid: null,
  isAnonymous: true,
  linked: readLinked(),
  upgradePromptShown: readJson<boolean>(UPGRADE_PROMPT_KEY) ?? false,

  initialise: () => {
    let disposed = false;
    let authEvent = 0;
    const restoreToken = (uid: string) => {
      const version = getAniListTokenVersion();
      if (readJson<string>(LINK_OWNER_KEY) !== uid || !get().linked.anilist) return Promise.resolve();
      return readAniListToken().then((token) => {
        if (!disposed && get().uid === uid && getAniListTokenVersion() === version) setAniListToken(token);
      });
    };

    if (!supabaseConfigured) {
      const uid = localUid();
      adoptSession(uid);
      set({ ready: true, uid, user: null, isAnonymous: true });
      restoreToken(uid);
      return () => { disposed = true; };
    }

    const applySession = (user: User | null) => {
      if (disposed) return;
      const uid = user?.id ?? localUid();
      const previousUid = get().uid;

      if ((previousUid && previousUid !== uid) || readJson<string>(LINK_OWNER_KEY) !== uid) {
        // Linked credentials are device-local; clear them when the account
        // changes so one user's AniList identity cannot appear for another.
        void clearAniListToken();
        const emptyLinked: LinkedAccounts = { anilist: null, mal: null };
        writeJson(LINKED_KEY, emptyLinked);
        writeJson(LINK_OWNER_KEY, uid);
        set({ linked: emptyLinked });

        // Signing into a real account from a guest session: carry the local
        // library across so nothing logged before signup is lost (§5).
        if (previousUid?.startsWith('local-') && user) {
          localStore.migrate(previousUid, uid, { overwrite: false });
        }
      }

      if (previousUid !== uid) adoptSession(uid);
      set({
        ready: true,
        user,
        uid,
        isAnonymous: !user || Boolean(user.is_anonymous),
      });

      void restoreToken(uid).then(() => {
        if (user && !disposed && get().uid === uid) void useLibraryStore.getState().sync();
      });
    };
    // A late initial lookup must never undo a newer sign-in/out event.
    void supabase.auth.getSession().then(({ data }) => {
      if (authEvent === 0) applySession(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvent += 1;
      applySession(session?.user ?? null);
    });
    return () => { disposed = true; listener.subscription.unsubscribe(); };
  },

  setLinked: (patch) => {
    const linked = { ...get().linked, ...patch };
    set({ linked });
    writeJson(LINKED_KEY, linked);
    writeJson(LINK_OWNER_KEY, get().uid);
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

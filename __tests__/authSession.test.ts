import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { clearAniListToken } from '@/data/auth';
import { getAniListTokenVersion, hasAniListToken, setAniListToken } from '@/api/anilist/client';
import { writeJson } from '@/api/kv';

let mockListener: (event: string, session: unknown) => void;
let mockResolveInitial: (value: unknown) => void;
jest.mock('@/data/supabase', () => ({
  supabaseConfigured: true,
  supabase: { auth: {
    getSession: jest.fn(() => new Promise((resolve) => { mockResolveInitial = resolve; })),
    onAuthStateChange: jest.fn((callback) => { mockListener = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
  } },
}));
jest.mock('@/data/sync', () => ({ syncNow: jest.fn(async () => ({ conflicts: [] })) }));
const user = (id: string) => ({ id, is_anonymous: false, user_metadata: {}, email: `${id}@example.com` });

beforeEach(() => {
  useAuthStore.setState({ uid: null, linked: { anilist: null, mal: null }, ready: false });
  useLibraryStore.getState().clearSession();
  setAniListToken(null);
});

test('a late initial session response cannot undo a newer sign-in', async () => {
  const cleanup = useAuthStore.getState().initialise();
  mockListener('SIGNED_IN', { user: user('new') });
  mockResolveInitial({ data: { session: { user: user('old') } } });
  await Promise.resolve();
  expect(useAuthStore.getState().uid).toBe('new');
  expect(useLibraryStore.getState().uid).toBe('new');
  cleanup();
});

test('switching accounts clears the in-memory AniList token immediately', async () => {
  const cleanup = useAuthStore.getState().initialise();
  mockListener('SIGNED_IN', { user: user('first') });
  setAniListToken('first-account-token');
  mockListener('SIGNED_IN', { user: user('second') });
  expect(hasAniListToken()).toBe(false);
  expect(useAuthStore.getState().linked.anilist).toBeNull();
  cleanup();
});

test('clearing saved credentials invalidates the client token before awaiting storage', async () => {
  setAniListToken('token');
  const version = getAniListTokenVersion();
  const clearing = clearAniListToken();
  expect(hasAniListToken()).toBe(false);
  expect(getAniListTokenVersion()).toBeGreaterThan(version);
  await clearing;
});

test('a token restored after switching accounts cannot reactivate the old identity', async () => {
  const secure = require('expo-secure-store');
  let resolveToken!: (token: string) => void;
  secure.getItemAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveToken = resolve; }));
  writeJson('auth:linked-owner', 'first');
  useAuthStore.setState({ linked: { anilist: { userId: 1, userName: 'Old', linkedAt: 1 }, mal: null } });
  const cleanup = useAuthStore.getState().initialise();
  mockListener('SIGNED_IN', { user: user('first') });
  mockListener('SIGNED_IN', { user: user('second') });
  resolveToken('old-token');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(hasAniListToken()).toBe(false);
  cleanup();
});

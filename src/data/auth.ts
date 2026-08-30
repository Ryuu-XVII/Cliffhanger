import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Lazy rather than a module-level constant: computing it eagerly at import
 * time reaches into the Expo manifest, which does not exist in the Jest
 * environment and would break every test that merely imports this module.
 */
function authCallbackUrl(): string {
  return AuthSession.makeRedirectUri({ scheme: 'cliffhanger', path: 'auth-callback' });
}

/**
 * The project has "Confirm email" on (verified empirically: signUp trips
 * Supabase's send-rate-limit, which only fires when it actually attempts to
 * mail a confirmation link), so `data.session` here is null - no session
 * exists until the user taps that link. `emailRedirectTo` sends it back into
 * the app itself rather than Supabase's default web Site URL, and
 * `initAuthLinking` (wired up in the root layout, see data/authLinking.ts) is
 * what actually catches it and turns it into a session via `applyAuthUrl`
 * below. Without both halves, "create account" looks like it silently does
 * nothing - the account exists, unconfirmed, and the app has no session to
 * show for it.
 */
export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
  return data.user!;
}
export async function signInWithEmail(email: string, password: string) { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; return data.user!; }
export async function resetPassword(email: string) { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl() }); if (error) throw error; }
export async function signOutUser() { const { error } = await supabase.auth.signOut(); if (error) throw error; await clearAniListToken(); }
export function isGoogleConfigured() { return Boolean(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID); }
export async function signInWithGoogle() { const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true } }); if (error || !data.url) throw error ?? new Error('Google sign-in failed'); await finishOAuth(data.url); return (await supabase.auth.getUser()).data.user!; }
export async function isAppleAvailable() { return Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync(); }
export async function signInWithApple() { const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: authCallbackUrl(), skipBrowserRedirect: true } }); if (error || !data.url) throw error ?? new Error('Apple sign-in failed'); await finishOAuth(data.url); return (await supabase.auth.getUser()).data.user!; }

const ANILIST_CLIENT_ID = process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID ?? '';
const ANILIST_TOKEN_KEY = 'anilist.access_token';
const ANILIST_EXPIRY_KEY = 'anilist.expires_at';
export function isAniListConfigured() { return ANILIST_CLIENT_ID.length > 0; }
export async function linkAniList(): Promise<string> {
  if (!isAniListConfigured()) throw new Error('AniList linking is not configured');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cliffhanger', path: 'anilist-auth' });
  const authUrl = 'https://anilist.co/api/v2/oauth/authorize?client_id=' + encodeURIComponent(ANILIST_CLIENT_ID) + '&response_type=token';
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success') throw new Error('AniList linking was cancelled');
  const params = new URLSearchParams(result.url.split('#')[1] ?? '');
  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') ?? '0');
  if (!token) throw new Error('AniList did not return a token');
  await SecureStore.setItemAsync(ANILIST_TOKEN_KEY, token);
  if (expiresIn > 0) await SecureStore.setItemAsync(ANILIST_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
  return token;
}

/**
 * Turns a `cliffhanger://auth-callback` URL into an active Supabase session,
 * whichever of Supabase's two link shapes it carries: a PKCE `?code=`
 * (Google/Apple OAuth) or an implicit `#access_token=`/`refresh_token=`
 * (email confirmation, password recovery, magic links). Returns false for a
 * URL that carries neither, so a caller watching every incoming deep link -
 * not just ones from a browser session it opened itself - can ignore
 * anything unrelated to auth instead of surfacing a confusing error.
 */
export async function applyAuthUrl(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (!accessToken || !refreshToken) return false;
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
  return true;
}

async function finishOAuth(url: string): Promise<void> {
  const result = await WebBrowser.openAuthSessionAsync(url, authCallbackUrl());
  if (result.type !== 'success') throw new Error('Sign-in was cancelled');
  const applied = await applyAuthUrl(result.url);
  if (!applied) throw new Error('Sign-in returned no session');
}
export async function readAniListToken() { try { const token = await SecureStore.getItemAsync(ANILIST_TOKEN_KEY); const expiry = await SecureStore.getItemAsync(ANILIST_EXPIRY_KEY); if (expiry && Number(expiry) < Date.now()) { await clearAniListToken(); return null; } return token; } catch { return null; } }
export async function clearAniListToken() { await SecureStore.deleteItemAsync(ANILIST_TOKEN_KEY).catch(() => undefined); await SecureStore.deleteItemAsync(ANILIST_EXPIRY_KEY).catch(() => undefined); }
/** Takes no argument: the function deletes whoever the JWT says is calling. */
export async function deleteAccount() { const { error } = await supabase.rpc('delete_my_account'); if (error) throw error; await supabase.auth.signOut(); }

/**
 * Rotating credentials in place (as opposed to deleting the account) needs a
 * currently valid session - Supabase's updateUser call is authenticated by
 * whatever session cookie/token this client already holds.
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Changing the email also requires the standard confirm-by-link step (same
 * as sign-up), so the new address only takes effect once the user taps the
 * link Supabase mails to it - `applyAuthUrl` via `auth-callback` handles that
 * the same way it already does for sign-up confirmation.
 */
export async function updateEmail(newEmail: string) {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: authCallbackUrl() },
  );
  if (error) throw error;
}

/**
 * Unlike email/password, a display name change takes effect immediately -
 * `useAuthStore`'s `onAuthStateChange` listener picks up the updated user
 * object (Supabase fires `USER_UPDATED`) without any extra plumbing here.
 */
export async function updateDisplayName(name: string) {
  const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
  if (error) throw error;
}

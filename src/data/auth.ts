import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export async function signInAnon() { const { data, error } = await supabase.auth.signInAnonymously(); if (error) throw error; return data.user!; }
export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } }); if (error) throw error; return data.user!;
}
export async function signInWithEmail(email: string, password: string) { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; return data.user!; }
export async function resetPassword(email: string) { const { error } = await supabase.auth.resetPasswordForEmail(email); if (error) throw error; }
export async function signOutUser() { const { error } = await supabase.auth.signOut(); if (error) throw error; await clearAniListToken(); }
export function isGoogleConfigured() { return Boolean(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID); }
export async function signInWithGoogle() { const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'cliffhanger://auth-callback', skipBrowserRedirect: true } }); if (error || !data.url) throw error ?? new Error('Google sign-in failed'); await finishOAuth(data.url); return (await supabase.auth.getUser()).data.user!; }
export async function isAppleAvailable() { return Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync(); }
export async function signInWithApple() { const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: 'cliffhanger://auth-callback', skipBrowserRedirect: true } }); if (error || !data.url) throw error ?? new Error('Apple sign-in failed'); await finishOAuth(data.url); return (await supabase.auth.getUser()).data.user!; }

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

async function finishOAuth(url: string): Promise<void> {
  const redirect = AuthSession.makeRedirectUri({ scheme: 'cliffhanger', path: 'auth-callback' });
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  if (result.type !== 'success') throw new Error('Sign-in was cancelled');
  const parsed = new URL(result.url);
  const code = parsed.searchParams.get('code');
  if (code) { const { error } = await supabase.auth.exchangeCodeForSession(code); if (error) throw error; return; }
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('Sign-in returned no session');
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
}
export async function readAniListToken() { try { const token = await SecureStore.getItemAsync(ANILIST_TOKEN_KEY); const expiry = await SecureStore.getItemAsync(ANILIST_EXPIRY_KEY); if (expiry && Number(expiry) < Date.now()) { await clearAniListToken(); return null; } return token; } catch { return null; } }
export async function clearAniListToken() { await SecureStore.deleteItemAsync(ANILIST_TOKEN_KEY).catch(() => undefined); await SecureStore.deleteItemAsync(ANILIST_EXPIRY_KEY).catch(() => undefined); }
export async function deleteAccount() { const { error } = await supabase.rpc('delete_my_account', { target_user_id: (await supabase.auth.getUser()).data.user?.id }); if (error) throw error; await supabase.auth.signOut(); }

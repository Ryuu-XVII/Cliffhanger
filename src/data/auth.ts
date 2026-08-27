import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
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
export async function signInWithGoogle() { const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'cliffhanger://auth-callback' } }); if (error) throw error; throw new Error(data.url ? 'Complete Google sign-in in the browser, then return to Cliffhanger.' : 'Google sign-in failed'); }
export async function isAppleAvailable() { return Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync(); }
export async function signInWithApple() { const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: 'cliffhanger://auth-callback' } }); if (error) throw error; throw new Error(data.url ? 'Complete Apple sign-in in the browser, then return to Cliffhanger.' : 'Apple sign-in failed'); }

const ANILIST_CLIENT_ID = process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID ?? '';
const ANILIST_TOKEN_KEY = 'anilist.access_token';
const ANILIST_EXPIRY_KEY = 'anilist.expires_at';
export function isAniListConfigured() { return ANILIST_CLIENT_ID.length > 0; }
export async function linkAniList(): Promise<string> { throw new Error('AniList linking requires the Supabase OAuth callback setup.'); }
export async function readAniListToken() { try { const token = await SecureStore.getItemAsync(ANILIST_TOKEN_KEY); const expiry = await SecureStore.getItemAsync(ANILIST_EXPIRY_KEY); if (expiry && Number(expiry) < Date.now()) { await clearAniListToken(); return null; } return token; } catch { return null; } }
export async function clearAniListToken() { await SecureStore.deleteItemAsync(ANILIST_TOKEN_KEY).catch(() => undefined); await SecureStore.deleteItemAsync(ANILIST_EXPIRY_KEY).catch(() => undefined); }
export async function deleteAccount() { const { error } = await supabase.rpc('delete_my_account', { target_user_id: (await supabase.auth.getUser()).data.user?.id }); if (error) throw error; await supabase.auth.signOut(); }

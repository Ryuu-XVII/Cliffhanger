import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser,
  linkWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { requireAuth } from './firebase';

/**
 * §5 - three account paths: anonymous, app account, AniList linked.
 *
 * Apple Sign-In is mandatory whenever another third-party sign-in is offered
 * (App Store guideline 4.8) - it is wired here, not left as a TODO, because
 * that omission has failed reviews before.
 */

WebBrowser.maybeCompleteAuthSession();

export async function signInAnon(): Promise<User> {
  const credential = await signInAnonymously(requireAuth());
  return credential.user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const auth = requireAuth();
  const current = auth.currentUser;

  // Upgrading an anonymous session keeps the same uid, so the library and its
  // Firestore documents carry over untouched (§5 requirement).
  if (current?.isAnonymous) {
    const credential = EmailAuthProvider.credential(email, password);
    const linked = await linkWithCredential(current, credential);
    if (displayName) await updateProfile(linked.user, { displayName });
    return linked.user;
  }

  const created = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(created.user, { displayName });
  return created.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  return credential.user;
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(requireAuth(), email);
}

export async function signOutUser(): Promise<void> {
  await signOut(requireAuth());
  // AniList credentials are device-local and must never bleed into the next
  // account that uses this device.
  await clearAniListToken();
}

/* ------------------------------ Google ------------------------------ */

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/**
 * Uses the OIDC implicit id_token flow so no client secret ever reaches the
 * bundle (§3.3). The returned id_token is exchanged with Firebase directly.
 */
export async function signInWithGoogle(): Promise<User> {
  if (!isGoogleConfigured()) throw new Error('Google sign-in is not configured');

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cliffhanger' });
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
    extraParams: { nonce: hashedNonce },
  });

  const result = await request.promptAsync({
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  });

  if (result.type !== 'success' || !result.params.id_token) {
    throw new Error('Google sign-in was cancelled');
  }

  const credential = GoogleAuthProvider.credential(result.params.id_token, undefined);
  return linkOrSignIn(credential);
}

/* ------------------------------- Apple ------------------------------ */

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<User> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const credentialResult = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credentialResult.identityToken) throw new Error('Apple sign-in returned no token');

  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: credentialResult.identityToken,
    rawNonce,
  });

  const user = await linkOrSignIn(credential);

  const fullName = credentialResult.fullName;
  if (fullName?.givenName && !user.displayName) {
    await updateProfile(user, {
      displayName: [fullName.givenName, fullName.familyName].filter(Boolean).join(' '),
    });
  }
  return user;
}

async function linkOrSignIn(credential: Parameters<typeof signInWithCredential>[1]): Promise<User> {
  const auth = requireAuth();
  const current = auth.currentUser;

  if (current?.isAnonymous) {
    try {
      const linked = await linkWithCredential(current, credential);
      return linked.user;
    } catch {
      // The provider account already exists - sign into it instead. The caller
      // is responsible for offering to merge the local library.
    }
  }

  const result = await signInWithCredential(auth, credential);
  return result.user;
}

/* ------------------------------ AniList ----------------------------- */

const ANILIST_CLIENT_ID = process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID ?? '';
const ANILIST_TOKEN_KEY = 'anilist.access_token';
const ANILIST_EXPIRY_KEY = 'anilist.expires_at';

export function isAniListConfigured(): boolean {
  return ANILIST_CLIENT_ID.length > 0;
}

/**
 * AniList implicit grant. There is no client secret in the bundle and no
 * refresh token on the device; the access token is long-lived (one year) and is
 * held in the platform keystore via SecureStore - never AsyncStorage (§5).
 */
export async function linkAniList(): Promise<string> {
  if (!isAniListConfigured()) throw new Error('AniList linking is not configured');

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cliffhanger', path: 'anilist-auth' });
  const authUrl =
    'https://anilist.co/api/v2/oauth/authorize?client_id=' +
    encodeURIComponent(ANILIST_CLIENT_ID) +
    '&response_type=token';

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success') throw new Error('AniList linking was cancelled');

  // Implicit grant returns the token in the URL fragment.
  const fragment = result.url.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);
  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') ?? '0');

  if (!token) throw new Error('AniList did not return a token');

  await SecureStore.setItemAsync(ANILIST_TOKEN_KEY, token);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    await SecureStore.setItemAsync(ANILIST_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
  }
  return token;
}

export async function readAniListToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(ANILIST_TOKEN_KEY);
    if (!token) return null;

    const expiry = await SecureStore.getItemAsync(ANILIST_EXPIRY_KEY);
    if (expiry && Number(expiry) < Date.now()) {
      await clearAniListToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export async function clearAniListToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ANILIST_TOKEN_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(ANILIST_EXPIRY_KEY).catch(() => undefined);
}

/* --------------------------- Account deletion ------------------------ */

export async function deleteAccount(): Promise<void> {
  const auth = requireAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  await deleteUser(user);
}

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Firebase bootstrap. Config comes from EXPO_PUBLIC_* env vars (see .env.example)
 * so no key is committed. §3.3 forbids secrets in the bundle - these public web
 * keys are safe by design; Firestore rules are what protect the data, and any
 * real secret (MAL client secret, AniList client secret) lives only in
 * functions/ env config.
 *
 * When the config is absent the app runs fully in local-only mode rather than
 * crashing, which keeps the first-run experience alive before a project exists.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

function readConfig(): FirebaseConfig | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId || !storageBucket || !messagingSenderId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initialised = false;

export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

function ensureInit(): void {
  if (initialised) return;
  initialised = true;

  const config = readConfig();
  if (!config) return;

  app = getApps().length > 0 ? getApp() : initializeApp(config);

  try {
    // React Native needs an explicit persistence adapter or the session is lost
    // on every cold start. The named export is untyped in some SDK builds, so
    // it is resolved defensively.
    const authModule = require('firebase/auth') as Record<string, unknown> & {
      getReactNativePersistence?: (storage: unknown) => unknown;
    };
    const persistence = authModule.getReactNativePersistence?.(AsyncStorage);
    auth = persistence
      ? initializeAuth(app, { persistence: persistence as never })
      : getAuth(app);
  } catch {
    // initializeAuth throws if it already ran (fast refresh) - fall back.
    auth = getAuth(app);
  }

  try {
    // Firestore's IndexedDB persistence is unavailable on React Native, so the
    // SDK runs with a memory cache and *our* local store (src/data/localStore)
    // provides the offline library required by F-10.
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    db = getFirestore(app);
  }
}

export function firebaseApp(): FirebaseApp | null {
  ensureInit();
  return app;
}

export function firebaseAuth(): Auth | null {
  ensureInit();
  return auth;
}

export function firebaseFunctions() {
  ensureInit();
  if (!app) return null;
  return require('firebase/functions').getFunctions(app, 'europe-west1');
}

export function firestore(): Firestore | null {
  ensureInit();
  return db;
}

/** Throwing accessors for code paths that already checked configuration. */
export function requireAuth(): Auth {
  const instance = firebaseAuth();
  if (!instance) throw new Error('Firebase is not configured. See .env.example.');
  return instance;
}

export function requireFirestore(): Firestore {
  const instance = firestore();
  if (!instance) throw new Error('Firebase is not configured. See .env.example.');
  return instance;
}

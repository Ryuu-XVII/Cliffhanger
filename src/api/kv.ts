import { toast } from '@/stores/toastStore';

/** Synchronous durable storage; user data and queued writes must survive restarts. */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
  readonly isPersistent: boolean;
}

export function createFallbackStore(): KeyValueStore {
  // Web supports durable synchronous storage without a native module.
  if (typeof localStorage !== 'undefined') {
    const storage = localStorage;
    const prefix = 'cliffhanger:';
    const keys = () => Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((key): key is string => key !== null && key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    return {
      getString: (key) => storage.getItem(prefix + key) ?? undefined,
      set: (key, value) => storage.setItem(prefix + key, value),
      delete: (key) => storage.removeItem(prefix + key),
      getAllKeys: keys,
      clearAll: () => keys().forEach((key) => storage.removeItem(prefix + key)),
      isPersistent: true,
    };
  }
  // Expo FileSystem is available in Expo Go. Each key has its own file so
  // changing progress does not rewrite the entire metadata cache.
  const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const directory = new Directory(Paths.document, 'cliffhanger-kv');
  directory.create({ intermediates: true, idempotent: true });
  const fileFor = (key: string) => new File(directory, encodeURIComponent(key));
  const keys = () => directory.list().filter((item) => item instanceof File).map((item) => decodeURIComponent(item.name));
  return {
    getString: (key) => { const file = fileFor(key); return file.exists ? file.textSync() : undefined; },
    set: (key, value) => { const file = fileFor(key); if (!file.exists) file.create(); file.write(value); },
    delete: (key) => { const file = fileFor(key); if (file.exists) file.delete(); },
    getAllKeys: keys,
    clearAll: () => keys().forEach((key) => fileFor(key).delete()),
    isPersistent: true,
  };
}

function createStore(): KeyValueStore {
  try {
    // react-native-mmkv v4 replaced the old `new MMKV({id})` class API with a
    // `createMMKV({id})` factory, and renamed `.delete(key)` to `.remove(key)` -
    // the previous code here was still written against the v2/v3 shape, so
    // `MMKV` destructured to `undefined` and every launch silently fell back
    // to the in-memory store, resetting anything local-only (onboarding,
    // caches) on every cold start.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMMKV } = require('react-native-mmkv') as {
      createMMKV: (config: { id: string }) => {
        getString(key: string): string | undefined;
        set(key: string, value: string): void;
        remove(key: string): boolean;
        getAllKeys(): string[];
        clearAll(): void;
      };
    };
    const mmkv = createMMKV({ id: 'cliffhanger' });
    return {
      getString: (key) => mmkv.getString(key),
      set: (key, value) => mmkv.set(key, value),
      delete: (key) => void mmkv.remove(key),
      getAllKeys: () => mmkv.getAllKeys(),
      clearAll: () => mmkv.clearAll(),
      isPersistent: true,
    };
  } catch (error) {
    console.warn('[kv] MMKV unavailable; using durable fallback', error);
    return createFallbackStore();
  }
}

let instance: KeyValueStore | null = null;

export function kv(): KeyValueStore {
  if (!instance) instance = createStore();
  return instance;
}

export function readJson<T>(key: string): T | null {
  const raw = kv().getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    kv().delete(key);
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    kv().set(key, JSON.stringify(value));
  } catch (cause) {
    // Metadata caches are expendable. Library data and queues are not.
    if (key.startsWith('cache:')) return;
    toast.error('Could not save your changes. Check available device storage and try again.');
    throw new Error('Could not save changes to device storage', { cause });
  }
}

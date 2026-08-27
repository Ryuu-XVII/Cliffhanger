/**
 * Fast key-value storage. MMKV per §3.1, but MMKV v4 is a Nitro module and is
 * not present in Expo Go, so we resolve it lazily and fall back to an in-memory
 * map. The fallback is correctness-preserving: the metadata cache simply does
 * not survive a reload, which only costs an extra network fetch.
 */

export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
  readonly isPersistent: boolean;
}

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    delete: (key) => void map.delete(key),
    getAllKeys: () => Array.from(map.keys()),
    clearAll: () => map.clear(),
    isPersistent: false,
  };
}

function createStore(): KeyValueStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MMKV } = require('react-native-mmkv') as {
      MMKV: new (config: { id: string }) => {
        getString(key: string): string | undefined;
        set(key: string, value: string): void;
        delete(key: string): void;
        getAllKeys(): string[];
        clearAll(): void;
      };
    };
    const mmkv = new MMKV({ id: 'cliffhanger' });
    return {
      getString: (key) => mmkv.getString(key),
      set: (key, value) => mmkv.set(key, value),
      delete: (key) => mmkv.delete(key),
      getAllKeys: () => mmkv.getAllKeys(),
      clearAll: () => mmkv.clearAll(),
      isPersistent: true,
    };
  } catch {
    return createMemoryStore();
  }
}

let instance: KeyValueStore | null = null;

export function kv(): KeyValueStore {
  if (!instance) instance = createStore();
  return instance;
}

/** Test seam. */
export function __setKvForTests(store: KeyValueStore | null): void {
  instance = store;
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
  } catch {
    /* Storage full or serialisation failed - caching is best-effort. */
  }
}

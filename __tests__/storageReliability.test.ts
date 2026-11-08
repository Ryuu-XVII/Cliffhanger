import { createFallbackStore, kv, writeJson } from '@/api/kv';
import { useToastStore } from '@/stores/toastStore';

const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  const files = mockFiles;
  class File {
    name: string;
    constructor(_directory: unknown, name: string) { this.name = name; }
    get exists() { return files.has(this.name); }
    create() { files.set(this.name, ''); }
    write(value: string) { files.set(this.name, value); }
    textSync() { return files.get(this.name); }
    delete() { files.delete(this.name); }
  }
  class Directory {
    create() {}
    list() { return Array.from(files.keys()).map((key) => new File(this, key)); }
  }
  return { File, Directory, Paths: { document: 'document' } };
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('user-data write failures are reported and thrown instead of being swallowed', () => {
  const storage = kv();
  const spy = jest.spyOn(storage, 'set').mockImplementation(() => { throw new Error('disk full'); });
  expect(() => writeJson('lib:user:entries', { progress: 3 })).toThrow('Could not save changes');
  expect(useToastStore.getState().toasts.at(-1)?.message).toContain('Could not save');
  expect(() => writeJson('cache:metadata', {})).not.toThrow();
  spy.mockRestore();
});

test('native fallback preserves data when the JavaScript store is recreated', () => {
  const first = createFallbackStore();
  first.set('lib:fallback:entries', JSON.stringify({ progress: 7 }));
  expect(first.isPersistent).toBe(true);
  const second = createFallbackStore();
  expect(JSON.parse(second.getString('lib:fallback:entries')!)).toEqual({ progress: 7 });
  second.delete('lib:fallback:entries');
  expect(second.getString('lib:fallback:entries')).toBeUndefined();
});

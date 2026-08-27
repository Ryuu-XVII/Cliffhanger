import { readJson, writeJson } from '@/api/kv';

const KEY = 'onboarding:completed:v1';

export function hasOnboarded(): boolean {
  return readJson<boolean>(KEY) === true;
}

export function markOnboarded(): void {
  writeJson(KEY, true);
}

/** Used by the settings screen so the tour can be replayed. */
export function resetOnboarding(): void {
  writeJson(KEY, false);
}

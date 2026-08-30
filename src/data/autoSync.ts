import { isOnline } from '@/api/http';

/**
 * F-10/F-23: a local edit should reach the backend on its own - the queue
 * previously only drained on app foreground, connectivity regained, or a
 * manual "Sync now" tap, which left online users staring at "N changes
 * waiting to sync" until one of those happened to fire. Debounced so a burst
 * of edits (several +1 taps, a run of settings toggles) coalesces into one
 * network round trip instead of one per mutation.
 */
const DEBOUNCE_MS = 1500;
let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoSync(sync: () => void): void {
  if (!isOnline()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    sync();
  }, DEBOUNCE_MS);
  // Node (Jest) timers support unref() so a pending debounce never blocks
  // process exit; React Native's timer polyfill has no such concept and
  // simply lacks the method, so this is a no-op there.
  (timer as unknown as { unref?: () => void }).unref?.();
}

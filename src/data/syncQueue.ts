import { readJson, writeJson } from '@/api/kv';

/**
 * F-10 - progress updates queue locally and sync when back online.
 *
 * Ops are coalesced by key, so tapping +1 eight times offline results in one
 * write carrying the final state rather than eight. Every op is idempotent: it
 * writes the whole entry document, keyed by anilistId (§8), so a replay after a
 * crash can never duplicate or double-increment anything.
 */

export type SyncOpType =
  | 'entry.upsert'
  | 'entry.delete'
  | 'list.upsert'
  | 'list.delete'
  | 'settings.update'
  | 'profile.update';

export interface SyncOp {
  /** Coalescing key: one pending op per target document. */
  key: string;
  type: SyncOpType;
  payload: unknown;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
  /**
   * Where the change came from. F-23 mirrors local edits out to AniList, so an
   * entry that arrived *from* AniList must not be echoed straight back - it is
   * already the remote truth, and bouncing it wastes a rate-limited write.
   */
  origin?: 'local' | 'anilist';
}

const QUEUE_KEY = (uid: string): string => 'sync:' + uid + ':queue';

export function readQueue(uid: string): SyncOp[] {
  return readJson<SyncOp[]>(QUEUE_KEY(uid)) ?? [];
}

function writeQueue(uid: string, ops: SyncOp[]): void {
  writeJson(QUEUE_KEY(uid), ops);
}

export function enqueue(uid: string, op: Omit<SyncOp, 'queuedAt' | 'attempts' | 'lastError'>): void {
  const queue = readQueue(uid).filter((existing) => existing.key !== op.key);
  queue.push({ ...op, queuedAt: Date.now(), attempts: 0, lastError: null });
  writeQueue(uid, queue);
}

export function removeOp(uid: string, key: string): void {
  writeQueue(
    uid,
    readQueue(uid).filter((op) => op.key !== key),
  );
}

export function markFailed(uid: string, key: string, error: string): void {
  const queue = readQueue(uid).map((op) =>
    op.key === key ? { ...op, attempts: op.attempts + 1, lastError: error } : op,
  );
  writeQueue(uid, queue);
}

export function clearQueue(uid: string): void {
  writeQueue(uid, []);
}

export function pendingCount(uid: string): number {
  return readQueue(uid).length;
}

/** Ops that have failed this many times are surfaced to the user, not retried silently. */
export const MAX_SYNC_ATTEMPTS = 5;

export function stuckOps(uid: string): SyncOp[] {
  return readQueue(uid).filter((op) => op.attempts >= MAX_SYNC_ATTEMPTS);
}

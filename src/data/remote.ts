import type { CustomList, LibraryEntry, UserProfile, UserSettings } from './models';
import { supabase, supabaseConfigured } from './supabase';

export function remoteAvailable(): boolean { return supabaseConfigured; }
function fail(error: { message: string } | null): void { if (error) throw new Error(error.message); }

/** The RPC compares versions atomically and derives ownership from the JWT. */
async function applyChange(uid: string, kind: 'entry' | 'list', id: string, payload: unknown, version: number, deleted: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('apply_library_change', {
    expected_uid: uid, kind, target_id: id, payload, changed_at: version, is_deleted: deleted,
  });
  fail(error);
  return data === true;
}

export async function pushEntry(uid: string, entry: LibraryEntry): Promise<boolean> {
  return applyChange(uid, 'entry', String(entry.anilistId), entry, entry.updatedAt, false);
}
export async function deleteEntry(uid: string, anilistId: number, version = Date.now()): Promise<boolean> {
  return applyChange(uid, 'entry', String(anilistId), {}, version, true);
}

async function snapshot<T>(kind: 'entry' | 'list', uid: string): Promise<T[]> {
  // A single PostgreSQL statement gives a consistent snapshot with no
  // PostgREST row limit or pagination gaps during concurrent deletions.
  const { data, error } = await supabase.rpc('read_library_snapshot', { kind, expected_uid: uid });
  fail(error);
  if (!Array.isArray(data)) throw new Error('Invalid library snapshot');
  return data as T[];
}

/** A full snapshot propagates hard deletions from older clients as well. */
export async function pullEntries(uid: string, _since: number | null): Promise<LibraryEntry[]> {
  return snapshot<LibraryEntry>('entry', uid);
}
export async function pushList(uid: string, list: CustomList, version = list.updatedAt ?? list.createdAt): Promise<boolean> {
  return applyChange(uid, 'list', list.id, { ...list, updatedAt: version }, version, false);
}
export async function deleteList(uid: string, listId: string, version = Date.now()): Promise<boolean> {
  return applyChange(uid, 'list', listId, {}, version, true);
}
export async function pullLists(uid: string): Promise<CustomList[]> {
  return snapshot<CustomList>('list', uid);
}
export async function pushProfile(profile: UserProfile): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: profile.uid, data: profile }); fail(error);
}
export async function pushSettings(uid: string, settings: UserSettings): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: uid, settings }); fail(error);
}
export async function pullProfile(uid: string): Promise<Partial<UserProfile> | null> {
  const { data, error } = await supabase.from('profiles').select('data,settings').eq('id', uid).maybeSingle(); fail(error);
  if (!data) return null; return { ...(data.data as Partial<UserProfile> | undefined), settings: data.settings as UserSettings | undefined };
}
/** Deletes the calling user; the uid is read from the JWT, never passed in. */
export async function deleteAllUserData(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account'); fail(error);
}

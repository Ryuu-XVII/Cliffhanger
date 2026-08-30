import type { CustomList, LibraryEntry, UserProfile, UserSettings } from './models';
import { supabase, supabaseConfigured } from './supabase';

export function remoteAvailable(): boolean { return supabaseConfigured; }
function fail(error: { message: string } | null): void { if (error) throw new Error(error.message); }

export async function pushEntry(uid: string, entry: LibraryEntry): Promise<void> {
  const { error } = await supabase.from('entries').upsert({ user_id: uid, anilist_id: entry.anilistId, data: entry, updated_at: entry.updatedAt }); fail(error);
}
export async function deleteEntry(uid: string, anilistId: number): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('user_id', uid).eq('anilist_id', anilistId); fail(error);
}
export async function pullEntries(uid: string, since: number | null): Promise<LibraryEntry[]> {
  let query = supabase.from('entries').select('data,updated_at').eq('user_id', uid);
  if (since !== null) query = query.gt('updated_at', since);
  const { data, error } = await query; fail(error); return (data ?? []).map((row) => row.data as LibraryEntry);
}
export async function pushList(uid: string, list: CustomList): Promise<void> {
  const { error } = await supabase.from('custom_lists').upsert({ user_id: uid, id: list.id, data: list }); fail(error);
}
export async function deleteList(uid: string, listId: string): Promise<void> {
  const { error } = await supabase.from('custom_lists').delete().eq('user_id', uid).eq('id', listId); fail(error);
}
export async function pullLists(uid: string): Promise<CustomList[]> {
  const { data, error } = await supabase.from('custom_lists').select('data').eq('user_id', uid); fail(error); return (data ?? []).map((row) => row.data as CustomList);
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

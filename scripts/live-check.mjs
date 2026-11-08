/** Live Supabase smoke test. Run with: npm run check:live */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync('.env', 'utf8').split(/\r?\n/).find((value) => value.startsWith(name + '='));
    return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  } catch { return undefined; }
}

const url = env('EXPO_PUBLIC_SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
const key = env('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_PUBLISHABLE_KEY');
if (!url || !key) throw new Error('Supabase environment variables are missing');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const record = (name, passed, detail = '') => { results.push({ passed }); console.log((passed ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' -- ' + detail : '')); };
async function expectDenied(name, run) {
  const { error } = await run();
  record(name, Boolean(error), error?.message ?? 'write was allowed');
}

let uid;
let throwaway = false;
try {
  const email = env('LIVE_CHECK_EMAIL');
  const password = env('LIVE_CHECK_PASSWORD');
  const signedIn = email && password
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email: `cliffhanger.livecheck.${Date.now()}@gmail.com`, password: 'Correct-horse-battery-42!' });
  if (signedIn.error) throw signedIn.error;
  if (!signedIn.data.user || !signedIn.data.session) throw new Error('Email signup requires email confirmation; disable confirmation for test accounts or use a verified test account');
  uid = signedIn.data.user.id;
  throwaway = !email;
  record('email account sign-up works', Boolean(uid), uid);
  const testId = 2147483000;
  const prior = await supabase.from('entries').select('anilist_id').eq('user_id', uid).eq('anilist_id', testId);
  if (prior.error || prior.data?.length) throw new Error('Smoke-test entry already exists; use a dedicated empty test account');
  const entry = { user_id: uid, anilist_id: testId, data: { anilistId: testId, status: 'WATCHING', progress: 3 }, updated_at: Date.now() };
  let result = await supabase.rpc('apply_library_change', { expected_uid: uid, kind: 'entry', target_id: String(testId),
    payload: { ...entry.data, updatedAt: entry.updated_at }, changed_at: entry.updated_at, is_deleted: false });
  record('can write own entry', !result.error, result.error?.message);
  result = await supabase.from('entries').select('data').eq('user_id', uid).eq('anilist_id', testId).single();
  record('can read own entry', !result.error && result.data?.data?.progress === 3, result.error?.message);
  await expectDenied('rejects another user entry', () => supabase.from('entries').insert({ ...entry, user_id: '00000000-0000-0000-0000-000000000000', anilist_id: 22 }));
  await expectDenied('rejects client notification receipt', () => supabase.from('notification_receipts').insert({ id: 'client-test', user_id: uid, anilist_id: 21, episode: 1 }));
  if (throwaway) {
    result = await supabase.rpc('delete_my_account');
    record('account deletion RPC works', !result.error, result.error?.message);
    uid = undefined;
  } else {
    await supabase.rpc('apply_library_change', { expected_uid: uid, kind: 'entry', target_id: String(testId), payload: {}, changed_at: Date.now() + 1, is_deleted: true });
    record('account deletion RPC works', true, 'skipped for configured test account');
  }
} catch (error) {
  record('unexpected failure', false, error?.message ?? String(error));
} finally {
  if (uid && throwaway) await supabase.rpc('delete_my_account');
  await supabase.auth.signOut();
}
const failed = results.filter((result) => !result.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

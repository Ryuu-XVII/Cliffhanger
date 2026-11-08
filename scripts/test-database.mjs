import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Execute the real schema and migration using PostgreSQL in WASM. No cloud
// credentials, production writes, or external database service are needed.
const db = new PGlite();
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
try {
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}');`);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../supabase/migrations/202611080001_library_sync.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // reapplying must be safe
  await db.exec('grant select, insert, update, delete on all tables in schema public to authenticated;');
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${A}';`);
  let expectedUid = A;
  const change = async (kind, id, version, deleted = false, extra = {}) => {
    const payload = deleted ? {} : kind === 'entry'
      ? { anilistId: Number(id), updatedAt: version, status: 'WATCHING', progress: 2, score: null, ...extra }
      : { id, name: 'List', updatedAt: version, ...extra };
    const { rows } = await db.query('select public.apply_library_change($1::uuid,$2,$3,$4::jsonb,$5,$6) as accepted',
      [expectedUid, kind, id, JSON.stringify(payload), version, deleted]);
    return rows[0].accepted;
  };
  assert.equal(await change('entry', '21', 200), true);
  assert.equal(await change('entry', '21', 100), false, 'older offline write rejected');
  assert.equal(await change('entry', '21', 200), false, 'equal replay is idempotent');
  assert.equal(await change('entry', '21', 300, true), true);
  assert.equal(await change('entry', '21', 250), false, 'tombstone rejects stale resurrection');
  assert.equal(await change('entry', '21', 400), true, 'newer explicit re-add allowed');
  assert.equal(await change('entry', '21', 350, true), false, 'old deletion rejected');
  assert.equal(await change('list', 'favorites', 200), true);
  assert.equal(await change('list', 'favorites', 300, false, { name: 'Renamed' }), true);
  assert.equal(await change('list', 'favorites', 250), false);
  assert.equal(await change('list', 'favorites', 400, true), true);
  assert.equal(await change('list', 'favorites', 350), false);
  await assert.rejects(change('entry', '22', 400, false, { anilistId: 23 }), /invalid entry/);
  await assert.rejects(change('entry', '22', 400, false, { progress: -1 }), /invalid entry/);
  await assert.rejects(change('entry', '22', 400, false, { score: 101 }), /invalid entry/);
  await assert.rejects(db.exec(`insert into public.entries values ('${A}',22,'{}',500,false)`), /row-level security/);
  await db.exec(`set request.jwt.claim.sub = '${B}';`);
  assert.equal((await db.query('select * from public.entries')).rows.length, 0, 'cross-account reads blocked');
  await assert.rejects(change('entry', '21', 100), /account session changed/, 'old session cannot write under new JWT');
  expectedUid = B;
  assert.equal(await change('entry', '21', 100), true, 'RPC always uses JWT owner');
  assert.equal((await db.query('select public.read_library_snapshot($1, $2) as data', [B, 'entry'])).rows[0].data.length, 1);
  await db.exec('set role anon;');
  await assert.rejects(db.query("select public.apply_library_change($1,'entry','21','{}',600,true)", [A]), /permission denied/);
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${A}'; select public.delete_my_account(); reset role;`);
  assert.equal((await db.query('select * from public.entries where user_id = $1', [A])).rows.length, 0);
  assert.equal((await db.query('select * from public.custom_lists where user_id = $1', [A])).rows.length, 0);
  console.log('PASS database migration, LWW writes/deletes, idempotency, validation, RLS, and account deletion');
} finally {
  await db.close();
}

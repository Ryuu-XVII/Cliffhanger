import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real Edge Function with fake external services, including its
// authorization, time window, transport filter, claims, and ticket handling.
const source = (await readFile(new URL('../supabase/functions/airing-notifications/index.ts', import.meta.url), 'utf8'))
  .replace(/^import .*?;\n/, '');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const claims = new Set();
const queries = [];
const pushes = [];
let handler;
let ticketStatus = 'ok';
let devices = [{ user_id: 'a', token: 'push-device', delivery_mode: 'push', timezone_offset_minutes: 0 }];
const now = Math.floor(Date.now() / 1000);
const media = { id: 21, title: { english: 'Example', romaji: 'Romaji' } };
let airings = [{ media, episode: 1, airingAt: now - 30 }, { media, episode: 2, airingAt: now + 600 }];
const database = {
  from(table) {
    let operation = 'select'; let values = []; const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      in(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      upsert(rows) { operation = 'upsert'; values = rows; return query; },
      delete() { operation = 'delete'; return query; },
      then(resolve, reject) {
        try {
          let data = [];
          if (table === 'entries') data = [{ user_id: 'a', anilist_id: 21, data: { status: 'WATCHING', notify: true } }];
          if (table === 'profiles') data = [{ id: 'a', settings: { notificationsEnabled: true, titleLanguage: 'english' } }];
          if (table === 'devices') data = devices.filter((row) => filters.every(([k, v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
          if (table === 'notification_receipts' && operation === 'upsert') {
            data = values.filter((row) => !claims.has(row.id)).map((row) => { claims.add(row.id); return { id: row.id }; });
          }
          if (table === 'notification_receipts' && operation === 'delete') for (const [, ids] of filters) for (const id of ids) claims.delete(id);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  },
};
vm.runInNewContext(js, {
  createClient: () => database,
  Deno: { env: { get: (key) => key === 'CRON_SECRET' ? 'test-secret' : 'test' }, serve: (fn) => { handler = fn; } },
  Response, AbortSignal, Date, console,
  fetch: async (url, options) => {
    if (url.includes('anilist')) {
      queries.push(JSON.parse(options.body).variables);
      return Response.json({ data: { Page: { airingSchedules: airings, pageInfo: { hasNextPage: false } } } });
    }
    const messages = JSON.parse(options.body);
    pushes.push(...messages);
    return Response.json({ data: messages.map(() => ({ status: ticketStatus })) });
  },
});
const run = () => handler(new Request('https://test', { method: 'POST', headers: { authorization: 'Bearer test-secret' } }));
assert.equal((await handler(new Request('https://test', { method: 'POST' }))).status, 401);
assert.equal((await run()).status, 200);
assert.equal(pushes.length, 1, 'future airings are never announced');
assert.equal(pushes[0].data.episode, '1');
assert.equal(pushes[0].title, 'Example');
assert.ok(queries[0].to <= Math.floor(Date.now() / 1000));
assert.ok(queries[0].from < queries[0].to);
await run();
assert.equal(pushes.length, 1, 'repeated runs cannot send duplicate episodes');
claims.clear(); pushes.length = 0;
devices = [{ user_id: 'a', token: 'local-device', delivery_mode: 'local' }];
await run();
assert.equal(pushes.length, 0, 'local-owned devices never get server pushes');
devices = [{ user_id: 'a', token: 'push-device', delivery_mode: 'push' }];
airings = [{ media, episode: 3, airingAt: now - 30 }];
ticketStatus = 'error';
await run();
assert.equal(claims.size, 0, 'explicit ticket rejection releases its claim');
ticketStatus = 'ok';
await run();
assert.equal(claims.size, 1, 'successful retry keeps its receipt');
console.log('PASS notification auth, airing time, local/push isolation, localization, deduplication, and rejected-ticket retry');

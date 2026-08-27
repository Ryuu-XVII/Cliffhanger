import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const anilistEndpoint = 'https://graphql.anilist.co';

const airingQuery = `query($page:Int!,$from:Int!,$to:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){episode airingAt media{id title{romaji english native} coverImage{large}}}}}`;

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || request.headers.get('authorization') !== 'Bearer ' + cronSecret) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const now = Math.floor(Date.now() / 1000);
  const { data: entries, error: entryError } = await supabase.from('entries').select('user_id,anilist_id,data').in('data->>status', ['WATCHING', 'REWATCHING']);
  if (entryError) return Response.json({ error: entryError.message }, { status: 500 });
  const watched = new Set((entries ?? []).map((row) => row.anilist_id));
  if (watched.size === 0) return Response.json({ sent: 0 });

  const airings = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(anilistEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: airingQuery, variables: { page, from: now, to: now + 24 * 3600 } }) });
    if (!response.ok) return Response.json({ error: 'AniList request failed' }, { status: 502 });
    const payload = await response.json();
    airings.push(...(payload.data?.Page?.airingSchedules ?? []));
    if (!payload.data?.Page?.pageInfo?.hasNextPage) break;
  }
  let sent = 0;

  for (const airing of airings) {
    if (!airing.media || !watched.has(airing.media.id)) continue;
    for (const entry of (entries ?? []).filter((item) => item.anilist_id === airing.media.id)) {
      const { data: profile } = await supabase.from('profiles').select('settings').eq('id', entry.user_id).maybeSingle();
      const settings = (profile?.settings ?? {}) as Record<string, unknown>;
      const entryData = (entry.data ?? {}) as Record<string, unknown>;
      if (settings.notificationsEnabled === false || entryData.notify === false || (entryData.notify !== true && settings.notifyOnAiringDefault === false)) continue;
      if (isQuietHours(settings.quietHours as { start?: string; end?: string } | null, Number(settings.timezoneOffsetMinutes ?? 0), airing.airingAt)) continue;
      const { data: devices } = await supabase.from('devices').select('token').eq('user_id', entry.user_id);
      const messages = (devices ?? []).map((device) => ({ to: device.token, title: airing.media.title?.english ?? airing.media.title?.romaji ?? 'New episode', body: 'Episode ' + airing.episode + ' is out.', sound: 'default', channelId: 'airing', data: { anilistId: String(airing.media.id), episode: String(airing.episode) } }));
      if (messages.length === 0) continue;
      const push = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(messages) });
      if (!push.ok) continue;
      const tickets = (await push.json()).data ?? [];
      sent += tickets.filter((ticket: { status?: string }) => ticket.status === 'ok').length;
      const key = entry.user_id + ':' + airing.media.id + ':' + airing.episode;
      await supabase.from('notification_receipts').upsert({ id: key, user_id: entry.user_id, anilist_id: airing.media.id, episode: airing.episode });
    }
  }
  return Response.json({ sent });
});

function isQuietHours(quiet: { start?: string; end?: string } | null, offset: number, airingAt: number): boolean {
  if (!quiet?.start || !quiet.end) return false;
  const local = new Date(airingAt * 1000 + offset * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const parse = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const start = parse(quiet.start); const end = parse(quiet.end);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

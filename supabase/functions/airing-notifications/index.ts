import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const anilistEndpoint = 'https://graphql.anilist.co';

const airingQuery = `query($from:Int!,$to:Int!){Page(page:1,perPage:50){airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){episode airingAt media{id title{romaji english native} coverImage{large}}}}}`;

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && request.headers.get('authorization') !== 'Bearer ' + cronSecret) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const now = Math.floor(Date.now() / 1000);
  const { data: entries, error: entryError } = await supabase.from('entries').select('user_id,anilist_id,data').in('data->>status', ['WATCHING', 'REWATCHING']);
  if (entryError) return Response.json({ error: entryError.message }, { status: 500 });
  const watched = new Set((entries ?? []).map((row) => row.anilist_id));
  if (watched.size === 0) return Response.json({ sent: 0 });

  const response = await fetch(anilistEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: airingQuery, variables: { from: now, to: now + 24 * 3600 } }) });
  if (!response.ok) return Response.json({ error: 'AniList request failed' }, { status: 502 });
  const payload = await response.json();
  const airings = payload.data?.Page?.airingSchedules ?? [];
  let sent = 0;

  for (const airing of airings) {
    if (!airing.media || !watched.has(airing.media.id)) continue;
    for (const entry of (entries ?? []).filter((item) => item.anilist_id === airing.media.id)) {
      const settings = (entry.data?.settings ?? {}) as Record<string, unknown>;
      if (settings.notificationsEnabled === false || entry.data?.notify === false) continue;
      const { data: devices } = await supabase.from('devices').select('token').eq('user_id', entry.user_id);
      const messages = (devices ?? []).map((device) => ({ to: device.token, title: airing.media.title?.english ?? airing.media.title?.romaji ?? 'New episode', body: 'Episode ' + airing.episode + ' is out.', sound: 'default', channelId: 'airing', data: { anilistId: String(airing.media.id), episode: String(airing.episode) } }));
      if (messages.length === 0) continue;
      const key = entry.user_id + ':' + airing.media.id + ':' + airing.episode;
      const { error: receiptError } = await supabase.from('notification_receipts').insert({ id: key, user_id: entry.user_id, anilist_id: airing.media.id, episode: airing.episode });
      if (receiptError) continue;
      const push = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(messages) });
      if (push.ok) sent += messages.length;
    }
  }
  return Response.json({ sent });
});

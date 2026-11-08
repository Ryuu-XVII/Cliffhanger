import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const anilistEndpoint = 'https://graphql.anilist.co';

/** Expo caps a single push request at 100 messages. */
const PUSH_CHUNK = 100;

const airingQuery = `query($page:Int!,$from:Int!,$to:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){episode airingAt media{id title{romaji english native} coverImage{large}}}}}`;

type TitleSet = { romaji?: string | null; english?: string | null; native?: string | null };
type Airing = { episode: number; airingAt: number; media: { id: number; title: TitleSet | null } | null };

/**
 * §4.6 - the user's title-language preference has to apply here too, not just
 * in-app. Shipping notifications in the wrong language while the in-app title
 * is correct is a named competitor bug the spec forbids repeating.
 */
function resolveTitle(title: TitleSet | null, language: string): string {
  if (!title) return 'New episode';
  const order =
    language === 'english'
      ? ['english', 'romaji', 'native']
      : language === 'native'
        ? ['native', 'romaji', 'english']
        : ['romaji', 'english', 'native'];
  for (const key of order) {
    const value = title[key as keyof TitleSet];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return 'New episode';
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || request.headers.get('authorization') !== 'Bearer ' + cronSecret) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const now = Math.floor(Date.now() / 1000);
  const { data: entries, error: entryError } = await supabase.from('entries').select('user_id,anilist_id,data').eq('deleted', false).in('data->>status', ['WATCHING', 'REWATCHING']);
  if (entryError) return Response.json({ error: entryError.message }, { status: 500 });
  if (!entries || entries.length === 0) return Response.json({ sent: 0, claimed: 0 });

  const watched = new Set(entries.map((row) => row.anilist_id));

  const airings: Airing[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(anilistEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: airingQuery, variables: { page, from: now - 3600 - 300, to: now } }) });
    if (!response.ok) return Response.json({ error: 'AniList request failed' }, { status: 502 });
    const payload = await response.json();
    airings.push(...(payload.data?.Page?.airingSchedules ?? []));
    if (!payload.data?.Page?.pageInfo?.hasNextPage) break;
  }

  const relevant = airings.filter((airing) => airing.airingAt <= now && airing.media && watched.has(airing.media.id));
  if (relevant.length === 0) return Response.json({ sent: 0, claimed: 0 });

  // Batch the per-user lookups instead of querying inside the loop - the old
  // version issued one profile and one devices query per matching entry.
  const userIds = Array.from(new Set(entries.map((row) => row.user_id)));
  const [{ data: profiles }, { data: devices }] = await Promise.all([
    supabase.from('profiles').select('id,settings').in('id', userIds),
    supabase.from('devices').select('user_id,token,timezone_offset_minutes,updated_at').eq('delivery_mode', 'push').in('user_id', userIds).order('updated_at', { ascending: false }),
  ]);

  const settingsByUser = new Map((profiles ?? []).map((row) => [row.id, (row.settings ?? {}) as Record<string, unknown>]));
  const tokensByUser = new Map<string, string[]>();
  /*
   * §11 "Handle timezone correctly - airing times are JST; users are not."
   * The offset is recorded per device at token-registration time; it is not a
   * field on UserSettings, so the old `settings.timezoneOffsetMinutes` read was
   * always undefined and every quiet-hours window was evaluated in UTC. Devices
   * are ordered newest-first above, so the first one seen per user wins.
   */
  const offsetByUser = new Map<string, number>();
  for (const device of devices ?? []) {
    const list = tokensByUser.get(device.user_id) ?? [];
    list.push(device.token);
    tokensByUser.set(device.user_id, list);
    if (!offsetByUser.has(device.user_id)) {
      offsetByUser.set(device.user_id, Number(device.timezone_offset_minutes ?? 0));
    }
  }

  // Work out every notification this run *would* send, before sending any.
  interface Candidate {
    id: string;
    user_id: string;
    anilist_id: number;
    episode: number;
    title: string;
  }
  const candidates: Candidate[] = [];

  for (const airing of relevant) {
    const mediaId = airing.media!.id;
    for (const entry of entries.filter((item) => item.anilist_id === mediaId)) {
      const settings = settingsByUser.get(entry.user_id) ?? {};
      const entryData = (entry.data ?? {}) as Record<string, unknown>;

      if (settings.notificationsEnabled === false) continue;
      if (entryData.notify === false) continue;
      if (entryData.notify !== true && settings.notifyOnAiringDefault === false) continue;
      if (isQuietHours(settings.quietHours as { start?: string; end?: string } | null, offsetByUser.get(entry.user_id) ?? 0, now)) continue;
      if ((tokensByUser.get(entry.user_id) ?? []).length === 0) continue;

      candidates.push({
        id: entry.user_id + ':' + mediaId + ':' + airing.episode,
        user_id: entry.user_id,
        anilist_id: mediaId,
        episode: airing.episode,
        title: resolveTitle(airing.media!.title, String(settings.titleLanguage ?? 'romaji')),
      });
    }
  }
  if (candidates.length === 0) return Response.json({ sent: 0, claimed: 0 });

  /*
   * §11 makes the idempotency key mandatory: "never send the same episode
   * notification twice". The previous version wrote a receipt *after* sending
   * but never read one back, so an episode inside the rolling 24h window was
   * re-sent on every hourly run - up to 24 duplicate pushes per episode, which
   * §15 names as the top uninstall risk.
   *
   * Claiming the receipt first makes the run atomic: `ignoreDuplicates` means
   * only rows that did not already exist come back, so a concurrent or retried
   * run cannot claim the same notification twice. Claim-before-send can drop a
   * notification if the push call then fails, which is the correct trade -
   * the spec forbids duplicates, not misses.
   */
  const { data: claimed, error: claimError } = await supabase
    .from('notification_receipts')
    .upsert(
      candidates.map((candidate) => ({
        id: candidate.id,
        user_id: candidate.user_id,
        anilist_id: candidate.anilist_id,
        episode: candidate.episode,
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });

  const claimedIds = new Set((claimed ?? []).map((row) => row.id));
  const toSend = candidates.filter((candidate) => claimedIds.has(candidate.id));
  if (toSend.length === 0) return Response.json({ sent: 0, claimed: 0 });

  /*
   * Each message carries the id of the receipt it belongs to. A user with two
   * devices produces two messages from one candidate, so the messages array is
   * longer than `toSend` and the two cannot be indexed against each other - a
   * failed chunk has to release exactly the receipts it covered, not whatever
   * happens to sit at the same offset.
   */
  const messages = toSend.flatMap((candidate) =>
    (tokensByUser.get(candidate.user_id) ?? []).map((token) => ({
      receiptId: candidate.id,
      message: {
        to: token,
        title: candidate.title,
        body: 'Episode ' + candidate.episode + ' is out.',
        sound: 'default',
        channelId: 'airing',
        data: { anilistId: String(candidate.anilist_id), episode: String(candidate.episode) },
      },
    })),
  );

  // §11 "Batch FCM sends. Do not loop one-by-one."
  let sent = 0;
  const failedIds = new Set<string>();
  const deliveredIds = new Set<string>();
  for (let index = 0; index < messages.length; index += PUSH_CHUNK) {
    const chunk = messages.slice(index, index + PUSH_CHUNK);
    try {
      const push = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(chunk.map((item) => item.message)),
        signal: AbortSignal.timeout(15_000),
      });
      // Only a definite HTTP rejection is retried. Network timeouts are
      // ambiguous: retain claims because Expo may already have accepted them.
      if (!push.ok) {
        for (const item of chunk) failedIds.add(item.receiptId);
        continue;
      }
      const tickets = (await push.json()).data ?? [];
      for (let i = 0; i < chunk.length; i += 1) {
        const ticket = tickets[i];
        const item = chunk[i];
        if (!item) continue;
        if (ticket?.status === 'ok') {
          sent += 1;
          deliveredIds.add(item.receiptId);
        } else if (ticket?.status === 'error') {
          failedIds.add(item.receiptId);
        } else {
          deliveredIds.add(item.receiptId); // unknown outcome: do not duplicate
        }
      }
    } catch {
      for (const item of chunk) deliveredIds.add(item.receiptId);
    }
  }

  // A receipt is only released when none of its devices got the push; if one of
  // two devices succeeded, the notification was delivered and must not repeat.
  for (const id of deliveredIds) failedIds.delete(id);

  if (failedIds.size > 0) {
    await supabase.from('notification_receipts').delete().in('id', Array.from(failedIds));
  }

  return Response.json({ sent, claimed: toSend.length });
});

function isQuietHours(quiet: { start?: string; end?: string } | null, offset: number, airingAt: number): boolean {
  if (!quiet?.start || !quiet.end) return false;
  const local = new Date(airingAt * 1000 + offset * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const parse = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const start = parse(quiet.start); const end = parse(quiet.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

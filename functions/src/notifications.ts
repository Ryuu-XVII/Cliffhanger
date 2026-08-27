import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { fetchAiringWindow, type AiringNode } from './anilist';

/**
 * §11 notification pipeline.
 *
 *   Scheduled function (hourly)
 *     -> query the AniList airing schedule for the next 24h
 *     -> match against titles at least one user is actively watching
 *     -> write to the notification queue
 *   Triggered function
 *     -> for each queued airing, find subscribed users
 *     -> respect per-title toggle, global toggle, quiet hours, timezone
 *     -> send via FCM with the correctly localised title (§4.6)
 *     -> mark as sent (idempotency key: anilistId + episode + uid)
 */

type TitleLanguage = 'romaji' | 'english' | 'native';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  data: Record<string, string>;
  image?: string;
}

interface QueuedAiring {
  anilistId: number;
  episode: number;
  airingAt: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: string | null;
  createdAt: FirebaseFirestore.FieldValue;
  processedAt: FirebaseFirestore.Timestamp | null;
}

const QUEUE = 'notificationQueue';
const SENT = 'notificationsSent';

/** Step one: find what airs in the next 24 hours and queue it. */
export async function sweepAiringSchedule(): Promise<number> {
  const db = getFirestore();
  const from = Math.floor(Date.now() / 1000);
  const to = from + 24 * 3600;

  const airings = await fetchAiringWindow(from, to);
  if (airings.length === 0) return 0;

  // Only queue titles somebody is actually watching - a collection-group query
  // over entries is far cheaper than fanning out per user.
  const watched = await watchedAnilistIds(db);
  const relevant = airings.filter((node) => node.media && watched.has(node.media.id));

  let queued = 0;
  const batch = db.batch();

  for (const node of relevant) {
    const media = node.media;
    if (!media) continue;

    // Idempotency at the queue level: anilistId + episode.
    const id = media.id + '_' + node.episode;
    const ref = db.collection(QUEUE).doc(id);
    const existing = await ref.get();
    if (existing.exists) continue;

    const payload: QueuedAiring = {
      anilistId: media.id,
      episode: node.episode,
      airingAt: node.airingAt,
      title: {
        romaji: media.title?.romaji ?? null,
        english: media.title?.english ?? null,
        native: media.title?.native ?? null,
      },
      coverImage: media.coverImage?.large ?? null,
      createdAt: FieldValue.serverTimestamp(),
      processedAt: null,
    };

    batch.set(ref, payload);
    queued += 1;
  }

  if (queued > 0) await batch.commit();
  logger.info('Queued airings', { checked: airings.length, relevant: relevant.length, queued });
  return queued;
}

async function watchedAnilistIds(db: FirebaseFirestore.Firestore): Promise<Set<number>> {
  const snapshot = await db
    .collectionGroup('entries')
    .where('status', 'in', ['WATCHING', 'REWATCHING'])
    .select('anilistId')
    .get();

  const ids = new Set<number>();
  for (const doc of snapshot.docs) {
    const value = doc.get('anilistId');
    if (typeof value === 'number') ids.add(value);
  }
  return ids;
}

/** Step two: fan a queued airing out to the users subscribed to it. */
export async function deliverAiring(
  anilistId: number,
  episode: number,
  airing: Pick<QueuedAiring, 'title' | 'coverImage'>,
): Promise<number> {
  const db = getFirestore();

  const entries = await db
    .collectionGroup('entries')
    .where('anilistId', '==', anilistId)
    .where('status', 'in', ['WATCHING', 'REWATCHING'])
    .get();

  const messages: ExpoPushMessage[] = [];
  const sentRefs: FirebaseFirestore.DocumentReference[] = [];

  for (const entryDoc of entries.docs) {
    // users/{uid}/entries/{anilistId}
    const userRef = entryDoc.ref.parent.parent;
    if (!userRef) continue;
    const uid = userRef.id;

    const entry = entryDoc.data() as { notify?: boolean | null };
    const userSnapshot = await userRef.get();
    const user = userSnapshot.data() as
      | {
          settings?: {
            notificationsEnabled?: boolean;
            notifyOnAiringDefault?: boolean;
            titleLanguage?: TitleLanguage;
            quietHours?: { start: string; end: string } | null;
            timezoneOffsetMinutes?: number;
          };
        }
      | undefined;

    const settings = user?.settings;
    if (settings?.notificationsEnabled === false) continue;

    // Per-title toggle wins; otherwise the global default (§11).
    const notify = entry.notify ?? settings?.notifyOnAiringDefault ?? true;
    if (!notify) continue;

    if (inQuietHours(settings?.quietHours ?? null, settings?.timezoneOffsetMinutes ?? 0)) continue;

    // Idempotency key: anilistId + episode + uid. Mandatory (§11).
    const sentId = uid + '_' + anilistId + '_' + episode;
    const sentRef = db.collection(SENT).doc(sentId);
    if ((await sentRef.get()).exists) continue;

    const tokens = await db.collection('users').doc(uid).collection('devices').get();
    const language: TitleLanguage = settings?.titleLanguage ?? 'romaji';
    const displayTitle = resolveTitle(airing.title, language);

    for (const device of tokens.docs) {
      const token = device.get('token');
      if (typeof token !== 'string' || token.length === 0) continue;

      messages.push({
        to: token,
        title: displayTitle,
        body: 'Episode ' + episode + ' is out.',
        sound: 'default',
        channelId: 'airing',
        ...(airing.coverImage ? { image: airing.coverImage } : {}),
        data: {
          anilistId: String(anilistId),
          episode: String(episode),
          // Deep link straight to the detail screen (§11).
          url: 'cliffhanger://title/' + anilistId,
        },
      });
    }

    sentRefs.push(sentRef);
  }

  if (messages.length === 0) return 0;

  // Batched send - never one-by-one (§11).
  let successCount = 0;
  for (let offset = 0; offset < messages.length; offset += 100) {
    const batch = messages.slice(offset, offset + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error('Expo push service returned ' + response.status);
    const result = (await response.json()) as {
      data?: Array<{ status?: string; message?: string; details?: unknown }>;
    };
    const tickets = result.data ?? [];
    successCount += tickets.filter((item) => item.status === 'ok').length;
    const failures = tickets.filter((item) => item.status !== 'ok');
    if (failures.length > 0) {
      logger.warn('Expo rejected notification tickets', {
        rejected: failures.length,
        messages: failures.slice(0, 5).map((item) => item.message ?? 'unknown error'),
      });
    }
  }
  // Leave the queue unprocessed when every ticket failed so the Firestore
  // trigger retries instead of permanently losing the alert.
  if (successCount === 0) throw new Error('Expo rejected every notification ticket');

  logger.info('Sent airing notifications', {
    anilistId,
    episode,
    success: successCount,
    failure: messages.length - successCount,
  });

  const batch = db.batch();
  for (const ref of sentRefs) {
    batch.set(ref, { anilistId, episode, sentAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  return successCount;
}

/**
 * §11: airing times are JST-derived but absolute; users are not. The offset is
 * stored per user so quiet hours are evaluated in their local time, not the
 * server's.
 */
export function inQuietHours(
  quiet: { start: string; end: string } | null,
  timezoneOffsetMinutes: number,
  now = new Date(),
): boolean {
  if (!quiet) return false;

  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  const parse = (value: string): number | null => {
    const [hours, mins] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
    return (hours as number) * 60 + (mins as number);
  };

  const start = parse(quiet.start);
  const end = parse(quiet.end);
  if (start === null || end === null || start === end) return false;

  // Windows that wrap midnight are the common case.
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function resolveTitle(
  title: { romaji: string | null; english: string | null; native: string | null },
  language: TitleLanguage,
): string {
  const order: Record<TitleLanguage, Array<keyof typeof title>> = {
    romaji: ['romaji', 'english', 'native'],
    english: ['english', 'romaji', 'native'],
    native: ['native', 'romaji', 'english'],
  };
  for (const key of order[language]) {
    const value = title[key];
    if (value && value.trim()) return value;
  }
  return 'New episode';
}

export type { AiringNode, QueuedAiring };

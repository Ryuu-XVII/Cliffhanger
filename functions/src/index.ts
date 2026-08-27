import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { fetchMedia } from './anilist';
import { deliverAiring, sweepAiringSchedule } from './notifications';

initializeApp();

/** Cache tiers from §4.5.2, in milliseconds. */
const TTL = {
  finished: 30 * 24 * 60 * 60 * 1000,
  title: 7 * 24 * 60 * 60 * 1000,
};

/**
 * §11 step one. Hourly sweep of the next 24 hours of airings, matched against
 * what people are actually watching.
 */
export const sweepAirings = onSchedule(
  { schedule: 'every 60 minutes', timeoutSeconds: 300, memory: '256MiB', region: 'europe-west1' },
  async () => {
    const queued = await sweepAiringSchedule();
    logger.info('Airing sweep complete', { queued });
  },
);

/** §11 step two. Fires as each airing lands in the queue. */
export const onAiringQueued = onDocumentCreated(
  { document: 'notificationQueue/{airingId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const anilistId = data.anilistId as number;
    const episode = data.episode as number;

    const sent = await deliverAiring(anilistId, episode, {
      title: data.title,
      coverImage: data.coverImage ?? null,
    });

    await event.data?.ref.set(
      { processedAt: FieldValue.serverTimestamp(), sentCount: sent },
      { merge: true },
    );
  },
);

/**
 * The shared metadata cache from §8: one fetch serves every user. Clients call
 * this instead of hammering AniList when they need a title they have not seen.
 */
export const getCachedMedia = onCall(
  { region: 'europe-west1', memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');

    const id = Number(request.data?.anilistId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new HttpsError('invalid-argument', 'anilistId must be a positive number');
    }

    const db = getFirestore();
    const ref = db.collection('animeCache').doc(String(id));
    const snapshot = await ref.get();

    if (snapshot.exists) {
      const expiresAt = snapshot.get('expiresAt') as number | undefined;
      if (expiresAt && expiresAt > Date.now()) {
        return { data: snapshot.get('data'), cached: true };
      }
    }

    const payload = await fetchMedia(id);
    if (!payload.Media) throw new HttpsError('not-found', 'No such title');

    const status = (payload.Media as { status?: string }).status;
    const ttl = status === 'FINISHED' || status === 'CANCELLED' ? TTL.finished : TTL.title;

    await ref.set({
      data: payload.Media,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    });

    return { data: payload.Media, cached: false };
  },
);

/**
 * Registers this device for push. Tokens live under the user document so the
 * delivery function can find them and rules keep them private.
 */
export const registerDevice = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');

  const token = request.data?.token;
  if (typeof token !== 'string' || token.length < 10) {
    throw new HttpsError('invalid-argument', 'A push token is required');
  }

  const offset = Number(request.data?.timezoneOffsetMinutes ?? 0);
  const db = getFirestore();

  await db
    .collection('users')
    .doc(request.auth.uid)
    .collection('devices')
    .doc(hash(token))
    .set({ token, platform: request.data?.platform ?? 'unknown', updatedAt: FieldValue.serverTimestamp() });

  // Quiet hours are evaluated in the user's local time (§11), so the offset
  // has to live server-side.
  await db
    .collection('users')
    .doc(request.auth.uid)
    .set({ settings: { timezoneOffsetMinutes: offset } }, { merge: true });

  return { ok: true };
});

/**
 * Housekeeping: drop processed queue rows and delivery receipts older than a
 * week so the collections do not grow without bound.
 */
export const pruneNotificationHistory = onSchedule(
  { schedule: 'every 24 hours', region: 'europe-west1' },
  async () => {
    const db = getFirestore();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let removedQueue = 0;
    let removedSent = 0;

    const staleQueue = await db
      .collection('notificationQueue')
      .where('airingAt', '<', Math.floor(cutoff / 1000))
      .limit(400)
      .get();
    if (!staleQueue.empty) {
      const batch = db.batch();
      for (const doc of staleQueue.docs) batch.delete(doc.ref);
      await batch.commit();
      removedQueue = staleQueue.size;
    }

    const staleSent = await db
      .collection('notificationsSent')
      .where('sentAt', '<', new Date(cutoff))
      .limit(400)
      .get();
    if (!staleSent.empty) {
      const batch = db.batch();
      for (const doc of staleSent.docs) batch.delete(doc.ref);
      await batch.commit();
      removedSent = staleSent.size;
    }

    logger.info('Pruned notification history', { removedQueue, removedSent });
  },
);

/** Stable, short document id for a push token. */
function hash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result).toString(36);
}

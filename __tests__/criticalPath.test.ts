import type { AniListMediaLite } from '@/api/anilist/types';
import { localStore } from '@/data/localStore';
import { pendingCount, clearQueue, readQueue } from '@/data/syncQueue';
import { useLibraryStore, totalUnits } from '@/stores/libraryStore';

// The sync engine talks to Firestore; the critical path must not depend on it.
jest.mock('@/data/sync', () => ({
  syncNow: jest.fn(async () => ({
    pushed: 0,
    pulled: 0,
    failed: 0,
    conflicts: [],
    skipped: 'no-remote',
  })),
}));

/**
 * §12 names this exact flow as the critical path: search -> add -> increment ->
 * complete. This is that path at the state layer, including the undo the spec
 * requires on auto-completion (F-04).
 */

const UID = 'critical-path-user';

const media: AniListMediaLite = {
  id: 21,
  idMal: 21,
  type: 'ANIME',
  title: { romaji: 'One Piece', english: 'One Piece', native: 'ワンピース' },
  coverImage: { extraLarge: 'cover.jpg', large: null, medium: null, color: null },
  bannerImage: null,
  format: 'TV',
  status: 'RELEASING',
  episodes: 3,
  chapters: null,
  volumes: null,
  duration: 24,
  season: 'FALL',
  seasonYear: 1999,
  startDate: { year: 1999, month: 10, day: 20 },
  averageScore: 88,
  meanScore: 88,
  popularity: 500,
  genres: ['Action', 'Adventure'],
  isAdult: false,
  nextAiringEpisode: null,
};

describe('critical path: add, increment, complete', () => {
  beforeEach(() => {
    localStore.clear(UID);
    clearQueue(UID);
    useLibraryStore.getState().clearSession();
    useLibraryStore.getState().hydrate(UID);
  });

  it('adds a searched title to the library with a renderable snapshot', () => {
    const entry = useLibraryStore.getState().add(media, 'WATCHING');

    expect(entry.anilistId).toBe(21);
    expect(entry.status).toBe('WATCHING');
    expect(entry.progress).toBe(0);
    // Denormalised so the library renders instantly and offline (§4.5.3).
    expect(entry.snapshot.title.romaji).toBe('One Piece');
    expect(entry.snapshot.coverImage).toBe('cover.jpg');
    expect(totalUnits(entry)).toBe(3);
  });

  it('is idempotent: adding the same title twice does not duplicate it', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().add(media, 'PLANNING');

    expect(Object.keys(useLibraryStore.getState().entries)).toHaveLength(1);
    expect(useLibraryStore.getState().entries['21']?.status).toBe('WATCHING');
  });

  it('increments episode by episode', () => {
    useLibraryStore.getState().add(media, 'WATCHING');

    const first = useLibraryStore.getState().increment(21);
    expect(first.entry?.progress).toBe(1);
    expect(first.completed).toBe(false);

    useLibraryStore.getState().increment(21);
    expect(useLibraryStore.getState().entries['21']?.progress).toBe(2);
  });

  it('auto-completes on the final episode and stamps the completion date', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().setProgress(21, 2);

    const outcome = useLibraryStore.getState().increment(21);

    expect(outcome.completed).toBe(true);
    expect(outcome.entry?.status).toBe('COMPLETED');
    expect(outcome.entry?.progress).toBe(3);
    expect(outcome.entry?.completedAt).not.toBeNull();
  });

  it('never lets progress run past the episode count', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().setProgress(21, 99);
    expect(useLibraryStore.getState().entries['21']?.progress).toBe(3);
  });

  it('restores the previous state when the undo toast is used', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().setProgress(21, 2);

    const outcome = useLibraryStore.getState().increment(21);
    expect(useLibraryStore.getState().entries['21']?.status).toBe('COMPLETED');

    useLibraryStore.getState().restore(outcome.previous!);

    const restored = useLibraryStore.getState().entries['21'];
    expect(restored?.progress).toBe(2);
    expect(restored?.status).toBe('WATCHING');
  });

  it('counts a finished rewatch and returns to completed', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().setProgress(21, 3);
    useLibraryStore.getState().setStatus(21, 'REWATCHING');

    expect(useLibraryStore.getState().entries['21']?.progress).toBe(0);

    useLibraryStore.getState().setProgress(21, 2);
    const outcome = useLibraryStore.getState().increment(21);

    expect(outcome.rewatchCompleted).toBe(true);
    expect(outcome.entry?.rewatches).toBe(1);
    expect(outcome.entry?.status).toBe('COMPLETED');
  });

  it('resumes a planned title the moment an episode is logged', () => {
    useLibraryStore.getState().add(media, 'PLANNING');
    useLibraryStore.getState().increment(21);
    expect(useLibraryStore.getState().entries['21']?.status).toBe('WATCHING');
  });

  it('queues every change for sync and coalesces them per entry', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().increment(21);
    useLibraryStore.getState().increment(21);

    expect(pendingCount(UID)).toBe(1);
    const queued = readQueue(UID)[0];
    expect(queued?.type).toBe('entry.upsert');
    expect((queued?.payload as { progress: number }).progress).toBe(2);
  });

  it('persists locally so the library survives a cold start', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    useLibraryStore.getState().increment(21);

    useLibraryStore.getState().clearSession();
    useLibraryStore.getState().hydrate(UID);

    expect(useLibraryStore.getState().entries['21']?.progress).toBe(1);
  });
});

describe('custom lists', () => {
  beforeEach(() => {
    localStore.clear(UID);
    clearQueue(UID);
    useLibraryStore.getState().clearSession();
    useLibraryStore.getState().hydrate(UID);
  });

  it('drops membership from every entry when a list is deleted', () => {
    useLibraryStore.getState().add(media, 'WATCHING');
    const list = useLibraryStore.getState().createList('Comfort rewatches');
    useLibraryStore.getState().toggleListMembership(21, list.id);

    expect(useLibraryStore.getState().entries['21']?.customListIds).toContain(list.id);

    useLibraryStore.getState().deleteList(list.id);

    expect(useLibraryStore.getState().lists).toHaveLength(0);
    expect(useLibraryStore.getState().entries['21']?.customListIds).toEqual([]);
  });
});

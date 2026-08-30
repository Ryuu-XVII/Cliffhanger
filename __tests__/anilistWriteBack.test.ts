import { setOnline } from '@/api/http';
import { localStore } from '@/data/localStore';
import { emptyEntry, type LibraryEntry } from '@/data/models';
import { syncNow } from '@/data/sync';
import { clearQueue, readQueue } from '@/data/syncQueue';
import { emptyTitleSet } from '@/data/titles';

/**
 * F-23: a linked AniList account is the user's real list, so local edits have
 * to mirror outward. The two properties worth pinning down are that a local
 * edit reaches AniList with the right status mapping, and that an entry which
 * arrived *from* AniList is not immediately echoed back.
 */

const mockSave = jest.fn(async (_input: Record<string, unknown>) => ({ id: 1 }));
const mockDeleteByMediaId = jest.fn(async (_mediaId: number) => true);
let mockLinked = true;

jest.mock('@/api/anilist', () => ({
  hasAniListToken: () => mockLinked,
  saveMediaListEntry: (input: Record<string, unknown>) => mockSave(input),
  deleteMediaListEntryByMediaId: (mediaId: number) => mockDeleteByMediaId(mediaId),
}));

jest.mock('@/data/remote', () => ({
  remoteAvailable: () => true,
  pushEntry: jest.fn(async () => undefined),
  deleteEntry: jest.fn(async () => undefined),
  pushList: jest.fn(async () => undefined),
  deleteList: jest.fn(async () => undefined),
  pushSettings: jest.fn(async () => undefined),
  pushProfile: jest.fn(async () => undefined),
  pullEntries: jest.fn(async () => []),
  pullLists: jest.fn(async () => []),
  pullProfile: jest.fn(async () => null),
}));

const UID = 'anilist-writeback-user';

function entryFor(status: LibraryEntry['status']): LibraryEntry {
  return {
    ...emptyEntry(21, {
      title: emptyTitleSet(),
      coverImage: null,
      bannerImage: null,
      totalEpisodes: 12,
      totalChapters: null,
      format: 'TV',
      airingStatus: 'FINISHED',
      genres: [],
      averageScore: null,
    }),
    status,
    progress: 4,
    score: 85,
  };
}

describe('AniList write-back (F-23)', () => {
  beforeEach(() => {
    localStore.clear(UID);
    clearQueue(UID);
    mockSave.mockClear();
    mockDeleteByMediaId.mockClear();
    mockLinked = true;
    setOnline(true);
  });

  it('mirrors a local edit to AniList with the mapped status', async () => {
    const { enqueue } = require('@/data/syncQueue');
    enqueue(UID, {
      key: 'entry:21',
      type: 'entry.upsert',
      payload: entryFor('ON_HOLD'),
      origin: 'local',
    });

    await syncNow(UID);

    expect(mockSave).toHaveBeenCalledTimes(1);
    // Our ON_HOLD is AniList's PAUSED; the enum names do not line up.
    expect(mockSave.mock.calls[0]?.[0]).toMatchObject({
      mediaId: 21,
      status: 'PAUSED',
      progress: 4,
      score: 85,
    });
    expect(readQueue(UID)).toHaveLength(0);
  });

  it('maps a rewatch to REPEATING rather than passing it through', async () => {
    const { enqueue } = require('@/data/syncQueue');
    enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entryFor('REWATCHING'), origin: 'local' });

    await syncNow(UID);

    expect(mockSave.mock.calls[0]?.[0]).toMatchObject({ status: 'REPEATING' });
  });

  it('does not echo an entry that came from AniList back to AniList', async () => {
    const { enqueue } = require('@/data/syncQueue');
    enqueue(UID, {
      key: 'entry:21',
      type: 'entry.upsert',
      payload: entryFor('WATCHING'),
      origin: 'anilist',
    });

    await syncNow(UID);

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('skips the mirror entirely when no AniList account is linked', async () => {
    mockLinked = false;
    const { enqueue } = require('@/data/syncQueue');
    enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entryFor('WATCHING'), origin: 'local' });

    await syncNow(UID);

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('mirrors a removal', async () => {
    const { enqueue } = require('@/data/syncQueue');
    enqueue(UID, { key: 'entry:21', type: 'entry.delete', payload: 21, origin: 'local' });

    await syncNow(UID);

    expect(mockDeleteByMediaId).toHaveBeenCalledWith(21);
  });

  it('keeps the backend write when AniList rejects, instead of replaying it forever', async () => {
    mockSave.mockRejectedValue(new Error('rate limited') as never);
    const { enqueue } = require('@/data/syncQueue');
    enqueue(UID, { key: 'entry:21', type: 'entry.upsert', payload: entryFor('WATCHING'), origin: 'local' });

    await syncNow(UID);

    // The op is done: our own backend accepted it, so it must not sit in the
    // queue retrying the backend write just because AniList was unavailable.
    expect(readQueue(UID)).toHaveLength(0);
    mockSave.mockResolvedValue({ id: 1 } as never);
  });
});

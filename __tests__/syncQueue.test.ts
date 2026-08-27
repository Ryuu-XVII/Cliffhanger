import {
  clearQueue,
  enqueue,
  markFailed,
  pendingCount,
  readQueue,
  removeOp,
  stuckOps,
} from '@/data/syncQueue';

const UID = 'user-1';

describe('offline write queue', () => {
  beforeEach(() => clearQueue(UID));

  it('coalesces repeated writes to the same entry', () => {
    enqueue(UID, { key: 'entry:1', type: 'entry.upsert', payload: { progress: 1 } });
    enqueue(UID, { key: 'entry:1', type: 'entry.upsert', payload: { progress: 2 } });
    enqueue(UID, { key: 'entry:1', type: 'entry.upsert', payload: { progress: 3 } });

    const queue = readQueue(UID);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.payload).toEqual({ progress: 3 });
  });

  it('keeps writes to different entries separate', () => {
    enqueue(UID, { key: 'entry:1', type: 'entry.upsert', payload: 1 });
    enqueue(UID, { key: 'entry:2', type: 'entry.upsert', payload: 2 });
    expect(pendingCount(UID)).toBe(2);
  });

  it('drops an op once it lands', () => {
    enqueue(UID, { key: 'entry:1', type: 'entry.upsert', payload: 1 });
    removeOp(UID, 'entry:1');
    expect(pendingCount(UID)).toBe(0);
  });

  it('surfaces an op that keeps failing instead of retrying forever', () => {
    enqueue(UID, { key: 'entry:1', type: 'entry.upsert', payload: 1 });
    for (let attempt = 0; attempt < 5; attempt += 1) markFailed(UID, 'entry:1', 'boom');
    expect(stuckOps(UID)).toHaveLength(1);
    expect(readQueue(UID)[0]?.lastError).toBe('boom');
  });
});

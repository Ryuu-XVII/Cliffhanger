import { cacheClear, cacheGet, cacheGetStale, cacheSet, withCache } from '@/api/cache';

describe('metadata cache', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('returns a value while it is fresh', () => {
    cacheSet('k', { value: 1 }, 1000);
    expect(cacheGet<{ value: number }>('k')).toEqual({ value: 1 });
  });

  it('treats an expired value as a miss', () => {
    cacheSet('k', { value: 1 }, -1);
    expect(cacheGet('k')).toBeNull();
  });

  it('still exposes an expired value as stale', () => {
    cacheSet('k', { value: 1 }, -1);
    expect(cacheGetStale<{ value: number }>('k')?.data).toEqual({ value: 1 });
  });

  it('serves the cache instead of calling the fetcher', async () => {
    const fetcher = jest.fn(async () => 'fresh');
    cacheSet('k', 'cached', 10000);
    await expect(withCache('k', 10000, fetcher)).resolves.toBe('cached');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('degrades to stale data when the network fails', async () => {
    cacheSet('k', 'old', -1);
    const fetcher = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(withCache('k', 10000, fetcher)).resolves.toBe('old');
  });

  it('rethrows when there is nothing cached at all', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(withCache('missing', 10000, fetcher)).rejects.toThrow('offline');
  });
});

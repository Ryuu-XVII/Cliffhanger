import { RateLimiter } from '@/api/rateLimiter';

describe('rate limiter', () => {
  it('lets a burst through up to the bucket capacity', async () => {
    const limiter = new RateLimiter(3, 3 / 60000);
    const started = Date.now();
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('makes the next caller wait once the bucket is empty', async () => {
    const limiter = new RateLimiter(1, 1 / 100);
    await limiter.acquire();

    const started = Date.now();
    await limiter.acquire();
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });

  it('pauses everything after a 429 penalty', async () => {
    const limiter = new RateLimiter(5, 5 / 1000);
    limiter.penalise(0.2);

    const started = Date.now();
    await limiter.acquire();
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
  });

  it('serves a high-priority request ahead of already-queued normal ones', async () => {
    // Empty the bucket first so every acquire() below actually has to queue
    // and wait for a refill, which is what makes ordering observable.
    const limiter = new RateLimiter(1, 1 / 200);
    await limiter.acquire();

    const order: string[] = [];
    const normalA = limiter.acquire().then(() => order.push('normal-a'));
    const normalB = limiter.acquire().then(() => order.push('normal-b'));
    const high = limiter.acquire('high').then(() => order.push('high'));

    await Promise.all([normalA, normalB, high]);
    expect(order).toEqual(['high', 'normal-a', 'normal-b']);
  });
});

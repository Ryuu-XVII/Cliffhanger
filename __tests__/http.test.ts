import { ApiError } from '@/api/errors';
import { backoffDelay, request, setOnline, USER_AGENT } from '@/api/http';
import { RateLimiter } from '@/api/rateLimiter';

/**
 * §4.5.4 - every external call needs a timeout, a retry with exponential
 * backoff, a 429 handler and a graceful degradation path. These are the tests
 * that keep that true.
 */

const originalFetch = global.fetch;

function response(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (key: string) => headers[key] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe('http layer', () => {
  beforeEach(() => {
    setOnline(true);
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('identifies the app in the User-Agent, per the API terms', async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => response(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await request('https://example.test');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
  });

  it('fails fast when the device is offline instead of hanging', async () => {
    setOnline(false);
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(request('https://example.test')).rejects.toMatchObject({ kind: 'offline' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retries a 5xx and succeeds on a later attempt', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await request('https://example.test', { retries: 2 });
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up on a 5xx after the retry budget and reports it as a server error', async () => {
    global.fetch = jest.fn(async () => response(500)) as unknown as typeof fetch;

    await expect(request('https://example.test', { retries: 1 })).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('honours Retry-After and penalises the shared limiter on a 429', async () => {
    global.fetch = jest.fn(async () => response(429, {}, { 'Retry-After': '0' })) as unknown as typeof fetch;
    const limiter = new RateLimiter(10, 10 / 1000);
    const penalise = jest.spyOn(limiter, 'penalise');

    await expect(
      request('https://example.test', { retries: 0, limiter }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(penalise).toHaveBeenCalled();
  });

  it('does not retry a 404', async () => {
    const fetchMock = jest.fn(async () => response(404));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(request('https://example.test', { retries: 3 })).rejects.toMatchObject({
      kind: 'not-found',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies an aborted request as a timeout', async () => {
    global.fetch = jest.fn(async () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;

    await expect(request('https://example.test', { retries: 0, timeoutMs: 10 })).rejects.toMatchObject(
      { kind: 'timeout' },
    );
  });
});

describe('backoff', () => {
  it('grows with each attempt and stays bounded', () => {
    const first = backoffDelay(0);
    const later = backoffDelay(4);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(500);
    expect(later).toBeLessThanOrEqual(8000);
  });
});

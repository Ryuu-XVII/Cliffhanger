import { setOnline } from '@/api/http';
import {
  captureException,
  clearCrashReports,
  flushCrashReports,
  pendingCrashReports,
} from '@/observability/crashReporter';

/**
 * §12 requires crash reporting from day one. The properties that matter are
 * that reporting never itself throws, and that a report survives being captured
 * while offline - the crash worth catching is usually the one on a bad
 * connection.
 */

// jest.mock is hoisted above these declarations, so the factory may only close
// over names prefixed `mock`.
const mockInsert = jest.fn(async (_rows: unknown) => ({ error: null }));
const mockGetUser = jest.fn(async () => ({ data: { user: { id: 'user-1' } as { id: string } | null } }));

jest.mock('@/data/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({ insert: (rows: unknown) => mockInsert(rows) }),
  },
}));

describe('crash reporter', () => {
  beforeEach(() => {
    clearCrashReports();
    // Reset implementations, not just call counts: captureException kicks off
    // its own flush, so a one-shot mock would be eaten by that rather than by
    // the explicit flush under test.
    mockInsert.mockReset().mockResolvedValue({ error: null } as never);
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } } as never);
    setOnline(true);
  });

  it('queues a captured error with the context it was given', () => {
    captureException(new Error('boom'), {
      severity: 'fatal',
      source: 'error-boundary',
      context: { boundary: 'root' },
    });

    const queued = pendingCrashReports();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.message).toBe('boom');
    expect(queued[0]?.severity).toBe('fatal');
    expect(queued[0]?.source).toBe('error-boundary');
    expect(queued[0]?.context).toEqual({ boundary: 'root' });
    expect(queued[0]?.stack).toContain('Error');
  });

  it('normalises a thrown non-Error without throwing', () => {
    expect(() => captureException('just a string')).not.toThrow();
    expect(() => captureException(undefined)).not.toThrow();
    expect(pendingCrashReports().length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the report queued when offline, then uploads once back online', async () => {
    setOnline(false);
    captureException(new Error('offline crash'));
    await flushCrashReports();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(pendingCrashReports()).toHaveLength(1);

    setOnline(true);
    await flushCrashReports();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(pendingCrashReports()).toHaveLength(0);
  });

  it('holds reports for a signed-out user rather than dropping them', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } } as never);
    captureException(new Error('anonymous crash'));
    await flushCrashReports();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(pendingCrashReports()).toHaveLength(1);
  });

  it('survives an upload that rejects, leaving the queue intact', async () => {
    mockInsert.mockRejectedValue(new Error('network down') as never);
    captureException(new Error('kept'));

    await expect(flushCrashReports()).resolves.toBeUndefined();
    expect(pendingCrashReports()).toHaveLength(1);
  });

  it('caps the queue so a crash loop cannot exhaust storage', () => {
    for (let index = 0; index < 40; index += 1) {
      captureException(new Error('loop ' + index));
    }
    expect(pendingCrashReports().length).toBeLessThanOrEqual(25);
  });

  it('truncates a pathological stack instead of storing all of it', () => {
    const error = new Error('huge');
    error.stack = 'x'.repeat(20000);
    captureException(error);

    const [report] = pendingCrashReports();
    expect(report?.stack?.length).toBeLessThan(4200);
    expect(report?.stack).toContain('[truncated]');
  });
});

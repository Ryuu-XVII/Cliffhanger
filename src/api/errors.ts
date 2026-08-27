/**
 * One error vocabulary for the whole API layer, so every screen can render a
 * failure state that says what went wrong and how to fix it (§7).
 */
export type ApiErrorKind =
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'not-found'
  | 'server'
  | 'unauthorized'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Seconds the caller should wait before retrying, when the server said so. */
  readonly retryAfter: number | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options?: { status?: number | null; retryAfter?: number | null; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options?.status ?? null;
    this.retryAfter = options?.retryAfter ?? null;
  }
}

/** User-facing copy: plain verbs, says what to do next (§10). */
export function describeError(error: unknown): { title: string; detail: string; retryable: boolean } {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'offline':
        return {
          title: 'No connection',
          detail: 'Your library still works offline. Reconnect to load new titles.',
          retryable: true,
        };
      case 'timeout':
        return {
          title: 'That took too long',
          detail: 'The server did not answer in time. Try again.',
          retryable: true,
        };
      case 'rate-limited':
        return {
          title: 'Slow down a moment',
          detail: 'AniList is limiting requests. Wait a few seconds and retry.',
          retryable: true,
        };
      case 'not-found':
        return {
          title: 'Not found',
          detail: 'This title is no longer in the AniList catalogue.',
          retryable: false,
        };
      case 'unauthorized':
        return {
          title: 'Sign in again',
          detail: 'Your linked account session expired. Reconnect it in Settings.',
          retryable: false,
        };
      case 'server':
        return {
          title: 'AniList is having trouble',
          detail: 'The service returned an error. Try again shortly.',
          retryable: true,
        };
      case 'unknown':
      default:
        break;
    }
  }
  return {
    title: 'Something broke',
    detail: 'We could not load this. Try again.',
    retryable: true,
  };
}

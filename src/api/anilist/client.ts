import { ApiError } from '../errors';
import { request } from '../http';
import { anilistLimiter, type RateLimitPriority } from '../rateLimiter';

/**
 * The only place an AniList network call is made. Components never import
 * this directly - they go through the hooks in src/api/anilist/index.ts (§3.3).
 */

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; status?: number }>;
}

/** OAuth access token for the linked AniList account, injected by the auth layer. */
let accessToken: string | null = null;

export function setAniListToken(token: string | null): void {
  accessToken = token;
}

export function hasAniListToken(): boolean {
  return accessToken !== null;
}

export async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { authenticated?: boolean; priority?: RateLimitPriority } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (options.authenticated && !accessToken) {
    throw new ApiError('unauthorized', 'AniList account is not linked');
  }
  if (accessToken) {
    // Sent even on unauthenticated calls: authenticated reads respect the
    // account's adult-content and title settings.
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await request(ANILIST_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    limiter: anilistLimiter,
    limiterPriority: options.priority,
  });

  let payload: GraphQLResponse<T>;
  try {
    payload = (await response.json()) as GraphQLResponse<T>;
  } catch (error) {
    throw new ApiError('unknown', 'AniList returned a malformed response', { cause: error });
  }

  if (payload.errors && payload.errors.length > 0) {
    const first = payload.errors[0];
    const message = first?.message ?? 'AniList error';
    const status = first?.status ?? null;
    if (status === 404 || /not found/i.test(message)) {
      throw new ApiError('not-found', message, { status });
    }
    if (status === 401 || status === 403) {
      throw new ApiError('unauthorized', message, { status });
    }
    if (status === 429) {
      throw new ApiError('rate-limited', message, { status });
    }
    throw new ApiError('server', message, { status });
  }

  if (payload.data === null || payload.data === undefined) {
    throw new ApiError('not-found', 'AniList returned no data');
  }

  return payload.data;
}

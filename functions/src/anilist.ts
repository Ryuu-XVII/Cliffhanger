/**
 * Server-side AniList access. §4.5.1 is explicit: bulk and scheduled work never
 * calls an external API from the client, so the airing sweep and the shared
 * metadata cache both live here.
 */

const ENDPOINT = 'https://graphql.anilist.co';
const USER_AGENT = 'Cliffhanger/1.0 (+backend; contact: adnaanhoosen51@gmail.com)';

/** §4.1 - stay well under the documented ceiling on a shared IP. */
const MIN_GAP_MS = 2_100;
let lastCall = 0;

async function throttle(): Promise<void> {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall = Date.now();
}

export async function anilist<T>(
  query: string,
  variables: Record<string, unknown> = {},
  attempt = 0,
): Promise<T> {
  await throttle();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? '60');
    if (attempt >= 3) throw new Error('AniList rate limited');
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 120) * 1000));
    return anilist<T>(query, variables, attempt + 1);
  }

  if (response.status >= 500) {
    if (attempt >= 3) throw new Error('AniList upstream error ' + response.status);
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    return anilist<T>(query, variables, attempt + 1);
  }

  const payload = (await response.json()) as {
    data?: T | null;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) throw new Error(payload.errors[0]?.message ?? 'AniList error');
  if (!payload.data) throw new Error('AniList returned no data');
  return payload.data;
}

export interface AiringNode {
  id: number;
  episode: number;
  airingAt: number;
  media: {
    id: number;
    idMal: number | null;
    title: { romaji: string | null; english: string | null; native: string | null } | null;
    coverImage: { large: string | null } | null;
    episodes: number | null;
  } | null;
}

const AIRING_QUERY = `
query Airing($page: Int!, $from: Int!, $to: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      id
      episode
      airingAt
      media {
        id
        idMal
        title { romaji english native }
        coverImage { large }
        episodes
      }
    }
  }
}
`;

/** Pulls every airing in the window, paging until AniList says stop. */
export async function fetchAiringWindow(fromSeconds: number, toSeconds: number): Promise<AiringNode[]> {
  const all: AiringNode[] = [];
  let page = 1;

  // Hard cap: a 24h window is well under 500 airings, so this only guards
  // against a pathological response looping forever.
  while (page <= 10) {
    const data = await anilist<{
      Page: { pageInfo: { hasNextPage: boolean | null } | null; airingSchedules: AiringNode[] | null } | null;
    }>(AIRING_QUERY, { page, from: fromSeconds, to: toSeconds });

    all.push(...(data.Page?.airingSchedules ?? []));
    if (!data.Page?.pageInfo?.hasNextPage) break;
    page += 1;
  }

  return all;
}

const MEDIA_QUERY = `
query Media($id: Int!) {
  Media(id: $id) {
    id idMal type status episodes chapters volumes format season seasonYear duration
    title { romaji english native }
    coverImage { extraLarge large medium color }
    bannerImage
    description(asHtml: false)
    genres
    averageScore
    meanScore
    popularity
    startDate { year month day }
    endDate { year month day }
    studios { edges { isMain node { id name } } }
    externalLinks { id url site type language color }
    nextAiringEpisode { id episode airingAt timeUntilAiring }
  }
}
`;

export function fetchMedia(id: number): Promise<{ Media: Record<string, unknown> | null }> {
  return anilist<{ Media: Record<string, unknown> | null }>(MEDIA_QUERY, { id });
}

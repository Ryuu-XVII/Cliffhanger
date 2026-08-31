import type { AniListExternalLink } from './anilist/types';

/**
 * F-22 - streaming availability, derived from the licensing data AniList
 * already carries on `externalLinks`. Two hard rules from §1 non-goals apply:
 * the app never embeds or proxies video, and it never links anywhere that is
 * not an official licensor. Anything not on the allow-list is dropped.
 */

const OFFICIAL_SITES: Record<string, { label: string; colour: string }> = {
  crunchyroll: { label: 'Crunchyroll', colour: '#F47521' },
  netflix: { label: 'Netflix', colour: '#E50914' },
  hulu: { label: 'Hulu', colour: '#1CE783' },
  'amazon prime video': { label: 'Prime Video', colour: '#00A8E1' },
  // AnimeSchedule reports platform slugs rather than display names.
  amazon: { label: 'Prime Video', colour: '#00A8E1' },
  apple: { label: 'Apple TV', colour: '#A2AAAD' },
  'apple tv': { label: 'Apple TV', colour: '#A2AAAD' },
  disney: { label: 'Disney+', colour: '#113CCF' },
  hbomax: { label: 'Max', colour: '#0046FF' },
  'prime video': { label: 'Prime Video', colour: '#00A8E1' },
  hidive: { label: 'HIDIVE', colour: '#00BFFF' },
  funimation: { label: 'Funimation', colour: '#5B0BB5' },
  vrv: { label: 'VRV', colour: '#FFDD00' },
  'disney plus': { label: 'Disney+', colour: '#113CCF' },
  max: { label: 'Max', colour: '#0046FF' },
  bilibili: { label: 'Bilibili', colour: '#00A1D6' },
  'bilibili tv': { label: 'Bilibili', colour: '#00A1D6' },
  'muse asia': { label: 'Muse Asia', colour: '#E4002B' },
  'ani-one asia': { label: 'Ani-One', colour: '#FF5A00' },
  youtube: { label: 'YouTube', colour: '#FF0000' },
  iqiyi: { label: 'iQIYI', colour: '#00BE06' },
  'catchplay+': { label: 'CatchPlay+', colour: '#FF6B00' },
};

export interface StreamingOption {
  id: number;
  label: string;
  url: string;
  colour: string;
  /** ISO-639 language the licensor streams in, when AniList knows it. */
  language: string | null;
  icon: string | null;
}

export function streamingOptions(
  links: AniListExternalLink[] | null | undefined,
  region: string,
): StreamingOption[] {
  if (!links) return [];

  const seen = new Set<string>();
  const options: StreamingOption[] = [];

  for (const link of links) {
    if (link.type !== 'STREAMING') continue;
    if (!link.url || !link.site) continue;

    const key = link.site.trim().toLowerCase();
    const known = OFFICIAL_SITES[key];
    if (!known) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    options.push({
      id: link.id,
      label: known.label,
      url: link.url,
      colour: link.color ?? known.colour,
      language: link.language ?? null,
      icon: link.icon ?? null,
    });
  }

  return sortForRegion(options, region);
}

/**
 * AniList does not publish per-country availability, so we cannot claim a title
 * is watchable in a given region. We only re-order by what is most likely
 * available there and let the UI say "where available".
 */
function sortForRegion(options: StreamingOption[], region: string): StreamingOption[] {
  const preference: Record<string, string[]> = {
    ZA: ['Crunchyroll', 'Netflix', 'Prime Video', 'Disney+'],
    US: ['Crunchyroll', 'Netflix', 'Hulu', 'HIDIVE', 'Max'],
    GB: ['Crunchyroll', 'Netflix', 'Prime Video'],
    JP: ['Bilibili', 'Netflix', 'Prime Video'],
  };
  const order = preference[region.toUpperCase()] ?? preference.ZA ?? [];
  /** Anything the region has no opinion on sorts after everything it does. */
  const rankOf = (label: string) => {
    const rank = order.indexOf(label);
    return rank === -1 ? order.length : rank;
  };

  return [...options].sort((a, b) => rankOf(a.label) - rankOf(b.label));
}

/** Non-streaming official links (AniList, MAL, official site) for the detail screen. */
export function infoLinks(links: AniListExternalLink[] | null | undefined): StreamingOption[] {
  if (!links) return [];
  return links
    .filter((link) => link.type === 'INFO' && link.url && link.site)
    .slice(0, 6)
    .map((link) => ({
      id: link.id,
      label: link.site as string,
      url: link.url as string,
      colour: link.color ?? '#988d9f',
      language: link.language ?? null,
      icon: link.icon ?? null,
    }));
}

/**
 * Merges AnimeSchedule's per-platform streams into the AniList-derived list.
 *
 * AnimeSchedule tracks licensing more closely than AniList does, so it usually
 * has more entries and better names ("YouTube (Sub)" vs "YouTube"). The §1
 * non-goal still binds: anything not on the official allow-list is dropped, no
 * matter which service reported it.
 */
/** AnimeSchedule encodes sub/dub in the display name rather than in a field. */
function subOrDub(name: string): 'Dub' | 'Sub' | null {
  if (/dub/i.test(name)) return 'Dub';
  if (/sub/i.test(name)) return 'Sub';
  return null;
}

export function mergeStreamingSources(
  fromAniList: StreamingOption[],
  fromSchedule: Array<{ platform: string; name: string; url: string }>,
  region: string,
): StreamingOption[] {
  const merged = [...fromAniList];
  const seen = new Set(fromAniList.map((option) => option.label.toLowerCase()));

  // Negative ids keep these distinguishable from AniList link ids.
  let syntheticId = -1;

  for (const stream of fromSchedule) {
    const known =
      OFFICIAL_SITES[stream.platform.trim().toLowerCase()] ??
      OFFICIAL_SITES[stream.name.trim().toLowerCase()];
    if (!known) continue;
    if (seen.has(known.label.toLowerCase())) continue;

    seen.add(known.label.toLowerCase());
    merged.push({
      id: syntheticId,
      label: known.label,
      url: stream.url,
      colour: known.colour,
      language: subOrDub(stream.name),
      icon: null,
    });
    syntheticId -= 1;
  }

  return sortForRegion(merged, region);
}

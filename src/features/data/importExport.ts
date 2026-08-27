import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getMediaByIds, hasAniListToken, saveMediaListEntry } from '@/api/anilist';
import { getMediaListCollection, getViewer } from '@/api/anilist';
import type { LibraryEntry, ListStatus } from '@/data/models';
import { fromAniListStatus, toAniListStatus, toSnapshot } from '@/data/transforms';
import { emptyTitleSet } from '@/data/titles';
import { fuzzyDateToTimestamp, timestampToFuzzyDate } from '@/utils/time';
import { useLibraryStore } from '@/stores/libraryStore';

/**
 * F-20 import and F-21 export.
 *
 * Export is explicitly non-negotiable: a user must be able to leave with their
 * data. Both formats round-trip - the JSON carries everything, and the XML is
 * MAL-compatible so it imports into MyAnimeList and anything that reads its
 * format.
 *
 * Import is idempotent by construction: entries are keyed by anilistId (§8), so
 * re-importing the same list updates in place instead of duplicating.
 */

export interface ExportPayload {
  format: 'cliffhanger-library';
  version: 1;
  exportedAt: string;
  entryCount: number;
  entries: LibraryEntry[];
}

export function buildJsonExport(entries: LibraryEntry[]): string {
  const payload: ExportPayload = {
    format: 'cliffhanger-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    entryCount: entries.length,
    entries,
  };
  return JSON.stringify(payload, null, 2);
}

const MAL_STATUS: Record<ListStatus, string> = {
  WATCHING: 'Watching',
  PLANNING: 'Plan to Watch',
  COMPLETED: 'Completed',
  ON_HOLD: 'On-Hold',
  DROPPED: 'Dropped',
  REWATCHING: 'Watching',
};

export function buildMalXmlExport(entries: LibraryEntry[]): string {
  const anime = entries
    .filter((entry) => entry.mediaType === 'ANIME')
    .map((entry) => {
      const started = timestampToFuzzyDate(entry.startedAt);
      const finished = timestampToFuzzyDate(entry.completedAt);
      return [
        '  <anime>',
        '    <series_animedb_id>' + (entry.malId ?? 0) + '</series_animedb_id>',
        '    <series_title><![CDATA[' + (entry.snapshot.title.romaji ?? entry.snapshot.title.english ?? '') + ']]></series_title>',
        '    <series_episodes>' + (entry.snapshot.totalEpisodes ?? 0) + '</series_episodes>',
        '    <my_watched_episodes>' + entry.progress + '</my_watched_episodes>',
        '    <my_start_date>' + malDate(started) + '</my_start_date>',
        '    <my_finish_date>' + malDate(finished) + '</my_finish_date>',
        '    <my_score>' + (entry.score === null ? 0 : Math.round(entry.score / 10)) + '</my_score>',
        '    <my_status>' + MAL_STATUS[entry.status] + '</my_status>',
        '    <my_times_watched>' + entry.rewatches + '</my_times_watched>',
        '    <my_comments><![CDATA[' + entry.notes + ']]></my_comments>',
        '    <update_on_import>1</update_on_import>',
        '  </anime>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<myanimelist>',
    '  <myinfo>',
    '    <user_export_type>1</user_export_type>',
    '    <user_total_anime>' + entries.length + '</user_total_anime>',
    '  </myinfo>',
    anime,
    '</myanimelist>',
    '',
  ].join('\n');
}

function malDate(date: { year: number; month: number; day: number } | null): string {
  if (!date) return '0000-00-00';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return date.year + '-' + pad(date.month) + '-' + pad(date.day);
}

/** Writes the export to a real file and hands it to the share sheet. */
export async function shareExport(
  contents: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export your library' });
  }
  return file.uri;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export interface AniListSyncResult {
  pushed: number;
  failed: number;
}

/** Pushes local progress, scores and notes to AniList after an explicit action. */
export async function syncToAniList(entries: LibraryEntry[]): Promise<AniListSyncResult> {
  if (!hasAniListToken()) throw new Error('Link your AniList account first');
  const result: AniListSyncResult = { pushed: 0, failed: 0 };
  for (const entry of entries) {
    try {
      await saveMediaListEntry({
        mediaId: entry.anilistId,
        status: toAniListStatus(entry.status),
        score: entry.score,
        progress: entry.progress,
        progressVolumes: entry.progressVolumes,
        repeat: entry.rewatches,
        notes: entry.notes,
        private: entry.private,
        startedAt: timestampToFuzzyDate(entry.startedAt),
        completedAt: timestampToFuzzyDate(entry.completedAt),
      });
      result.pushed += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/**
 * F-20 - pull the linked AniList account list into the local library. Existing
 * entries are updated rather than duplicated, and a local edit that is newer
 * than the remote one is kept (same last-write-wins rule as sync).
 */
export async function importFromAniList(): Promise<ImportResult> {
  const viewer = await getViewer();
  const [animeLists, mangaLists] = await Promise.all([
    getMediaListCollection(viewer.id, 'ANIME'),
    getMediaListCollection(viewer.id, 'MANGA'),
  ]);
  const lists = [...animeLists, ...mangaLists];

  const store = useLibraryStore.getState();
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };

  for (const list of lists) {
    if (list.isCustomList) continue;

    for (const remote of list.entries) {
      const media = remote.media;
      if (!media) {
        result.skipped += 1;
        continue;
      }

      const existing = store.entries[String(media.id)];
      const remoteUpdatedAt = (remote.updatedAt ?? 0) * 1000;

      if (existing && existing.updatedAt > remoteUpdatedAt) {
        result.skipped += 1;
        continue;
      }

      const entry: LibraryEntry = {
        anilistId: media.id,
        malId: media.idMal ?? null,
        mediaType: media.type === 'MANGA' ? 'MANGA' : 'ANIME',
        status: fromAniListStatus(remote.status),
        progress: remote.progress ?? 0,
        progressVolumes: remote.progressVolumes ?? undefined,
        score: remote.score && remote.score > 0 ? remote.score : null,
        rewatches: remote.repeat ?? 0,
        notes: remote.notes ?? '',
        startedAt: fuzzyDateToTimestamp(remote.startedAt),
        completedAt: fuzzyDateToTimestamp(remote.completedAt),
        updatedAt: remoteUpdatedAt || Date.now(),
        customListIds: existing?.customListIds ?? [],
        notify: existing?.notify ?? null,
        private: remote.private ?? false,
        snapshot: toSnapshot(media),
      };

      store.restore(entry);
      if (existing) result.updated += 1;
      else result.added += 1;
    }
  }

  return result;
}

interface ParsedMalEntry {
  malId: number;
  title: string;
  progress: number;
  score: number;
  status: string;
  rewatches: number;
  notes: string;
}

/**
 * Parses a MyAnimeList XML export. This is a deliberately small, tolerant
 * parser rather than a dependency: MAL exports are flat and predictable, and a
 * full XML stack is not worth the bundle size.
 */
export function parseMalXml(xml: string): ParsedMalEntry[] {
  const entries: ParsedMalEntry[] = [];
  const blocks = xml.match(/<anime>[\s\S]*?<\/anime>/g) ?? [];

  for (const block of blocks) {
    const malId = Number(tag(block, 'series_animedb_id'));
    if (!Number.isFinite(malId) || malId <= 0) continue;

    entries.push({
      malId,
      title: tag(block, 'series_title'),
      progress: Number(tag(block, 'my_watched_episodes')) || 0,
      score: Number(tag(block, 'my_score')) || 0,
      status: tag(block, 'my_status'),
      rewatches: Number(tag(block, 'my_times_watched')) || 0,
      notes: tag(block, 'my_comments'),
    });
  }

  return entries;
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  if (!match?.[1]) return '';
  return match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function fromMalStatus(status: string): ListStatus {
  switch (status.toLowerCase()) {
    case 'watching':
      return 'WATCHING';
    case 'completed':
      return 'COMPLETED';
    case 'on-hold':
      return 'ON_HOLD';
    case 'dropped':
      return 'DROPPED';
    case 'plan to watch':
    default:
      return 'PLANNING';
  }
}

/**
 * MAL exports key off malId, but §4.6 forbids keying an entry off anything but
 * the AniList id - so every parsed row is resolved to its AniList counterpart
 * before it is written. Rows that cannot be resolved are reported, not guessed.
 */
export async function importFromMalXml(xml: string): Promise<ImportResult & { unresolved: string[] }> {
  const parsed = parseMalXml(xml);
  const result: ImportResult & { unresolved: string[] } = {
    added: 0,
    updated: 0,
    skipped: 0,
    unresolved: [],
  };
  if (parsed.length === 0) return result;

  const store = useLibraryStore.getState();

  // AniList can return media by MAL id in bulk, which keeps this to a handful
  // of requests rather than one per row (§4.5).
  const byMalId = new Map<number, Awaited<ReturnType<typeof getMediaByIds>>[number]>();
  const malIds = parsed.map((item) => item.malId);
  const media = await getMediaByIdMalBatch(malIds);
  for (const item of media) {
    if (item.idMal) byMalId.set(item.idMal, item);
  }

  for (const row of parsed) {
    const match = byMalId.get(row.malId);
    if (!match) {
      result.unresolved.push(row.title || String(row.malId));
      continue;
    }

    const existing = store.entries[String(match.id)];
    const entry: LibraryEntry = {
      anilistId: match.id,
      malId: match.idMal ?? row.malId,
      mediaType: match.type === 'MANGA' ? 'MANGA' : 'ANIME',
      status: fromMalStatus(row.status),
      progress: row.progress,
      score: row.score > 0 ? row.score * 10 : null,
      rewatches: row.rewatches,
      notes: row.notes,
      startedAt: existing?.startedAt ?? null,
      completedAt: existing?.completedAt ?? null,
      updatedAt: Date.now(),
      customListIds: existing?.customListIds ?? [],
      notify: existing?.notify ?? null,
      private: existing?.private ?? false,
      snapshot: match ? toSnapshot(match) : { ...emptySnapshot(), title: emptyTitleSet() },
    };

    store.restore(entry);
    if (existing) result.updated += 1;
    else result.added += 1;
  }

  return result;
}

/** AniList exposes idMal_in on the Page query; batched 50 at a time. */
async function getMediaByIdMalBatch(malIds: number[]) {
  const { anilistRequest } = await import('@/api/anilist/client');
  const { MEDIA_LITE_FRAGMENT } = await import('@/api/anilist/queries');
  const query =
    MEDIA_LITE_FRAGMENT +
    '\nquery ByMal($ids: [Int], $perPage: Int!) { Page(page: 1, perPage: $perPage) { media(idMal_in: $ids) { ...MediaLite } } }';

  const results: Awaited<ReturnType<typeof getMediaByIds>> = [];
  for (let index = 0; index < malIds.length; index += 50) {
    const chunk = malIds.slice(index, index + 50);
    const data = await anilistRequest<{ Page: { media: typeof results | null } | null }>(query, {
      ids: chunk,
      perPage: chunk.length,
    });
    results.push(...(data.Page?.media ?? []));
  }
  return results;
}

function emptySnapshot() {
  return {
    title: emptyTitleSet(),
    coverImage: null,
    bannerImage: null,
    totalEpisodes: null,
    format: null,
    airingStatus: null,
    genres: [] as string[],
    averageScore: null,
  };
}

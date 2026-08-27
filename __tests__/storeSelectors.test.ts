import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { countByStatus } from '@/stores/libraryStore';
import type { LibraryEntry } from '@/data/models';

jest.mock('@/data/sync', () => ({ syncNow: jest.fn() }));

/**
 * Zustand v5 is built on useSyncExternalStore, which compares snapshots by
 * reference. A selector that builds a new object or array on every call
 * therefore reports a changed snapshot on every render, and React tears the
 * screen down with "Maximum update depth exceeded".
 *
 * That is not a hypothetical: it shipped, and it crashed the library screen on
 * the first device build. The logic tests could never have caught it because
 * nothing here renders a component - so this scans the source instead.
 */

const SOURCE_ROOTS = ['app', 'src'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Matches a store hook called with an inline selector whose body starts with a
 * fresh-collection builder: Object.values(...), Object.keys(...).map, [...],
 * or a .filter/.map chain returning a new array.
 */
const OFFENDING = /use\w*Store\(\s*\(\w+\)\s*=>\s*(Object\.(values|entries)\(|\[|[\w.]+\.(filter|map|sort|slice)\()/;

describe('zustand selectors', () => {
  const files = SOURCE_ROOTS.flatMap((root) => walk(join(process.cwd(), root)));

  it('finds the source files it is meant to scan', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('no selector builds a new object or array on every call', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      contents.split('\n').forEach((line, index) => {
        if (OFFENDING.test(line)) {
          offenders.push(file.replace(process.cwd(), '') + ':' + (index + 1) + '  ' + line.trim());
        }
      });
    }

    // Select the stable slice and derive with useMemo instead.
    expect(offenders).toEqual([]);
  });
});

describe('countByStatus', () => {
  const entry = (id: number, status: LibraryEntry['status']): LibraryEntry =>
    ({
      anilistId: id,
      status,
      progress: 0,
      score: null,
      rewatches: 0,
      notes: '',
      malId: null,
      mediaType: 'ANIME',
      startedAt: null,
      completedAt: null,
      updatedAt: 0,
      customListIds: [],
      notify: null,
      private: false,
      snapshot: {
        title: { romaji: 'x', english: null, native: null },
        coverImage: null,
        bannerImage: null,
        totalEpisodes: null,
        format: null,
        airingStatus: null,
        genres: [],
        averageScore: null,
      },
    }) as LibraryEntry;

  it('counts every status, including the empty ones', () => {
    const counts = countByStatus({
      '1': entry(1, 'WATCHING'),
      '2': entry(2, 'WATCHING'),
      '3': entry(3, 'COMPLETED'),
    });

    expect(counts.WATCHING).toBe(2);
    expect(counts.COMPLETED).toBe(1);
    expect(counts.DROPPED).toBe(0);
  });

  it('handles an empty library', () => {
    expect(countByStatus({}).WATCHING).toBe(0);
  });
});

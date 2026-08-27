import type { LibraryEntry, ListStatus } from '@/data/models';

/**
 * F-19. Everything is derived from local entries, so stats work offline and
 * cost nothing in API budget (§12).
 *
 * Episode duration is not in the snapshot, so days-watched uses a 24-minute
 * average for TV-shaped formats and 105 minutes for films. That is an estimate
 * and the UI says so rather than presenting it as fact.
 */

const MINUTES_PER_EPISODE = 24;
const MINUTES_PER_MOVIE = 105;

export interface LibraryStats {
  totalEntries: number;
  episodesWatched: number;
  minutesWatched: number;
  daysWatched: number;
  meanScore: number | null;
  scoredCount: number;
  completionRate: number;
  statusCounts: Record<ListStatus, number>;
  genreBreakdown: Array<{ genre: string; count: number; share: number }>;
  formatBreakdown: Array<{ format: string; count: number }>;
  scoreHistogram: Array<{ bucket: number; count: number }>;
  longestRunning: LibraryEntry | null;
  rewatchTotal: number;
}

export function computeStats(entries: LibraryEntry[]): LibraryStats {
  const statusCounts: Record<ListStatus, number> = {
    WATCHING: 0,
    PLANNING: 0,
    COMPLETED: 0,
    ON_HOLD: 0,
    DROPPED: 0,
    REWATCHING: 0,
  };

  let episodesWatched = 0;
  let minutesWatched = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  let rewatchTotal = 0;
  let longestRunning: LibraryEntry | null = null;

  const genres = new Map<string, number>();
  const formats = new Map<string, number>();
  const histogram = new Array<number>(10).fill(0);

  for (const entry of entries) {
    statusCounts[entry.status] += 1;
    rewatchTotal += entry.rewatches;

    const isMovie = entry.snapshot.format === 'MOVIE';
    const passes = 1 + entry.rewatches;
    const unitsThisPass = entry.progress;
    const totalUnits = entry.snapshot.totalEpisodes ?? entry.progress;

    // A rewatch means the whole series was seen again, not the current progress.
    const units = unitsThisPass + entry.rewatches * totalUnits;
    episodesWatched += units;
    minutesWatched += units * (isMovie ? MINUTES_PER_MOVIE : MINUTES_PER_EPISODE);

    if (entry.score !== null) {
      scoreSum += entry.score;
      scoredCount += 1;
      const bucket = Math.min(9, Math.max(0, Math.floor(entry.score / 10)));
      histogram[bucket] = (histogram[bucket] ?? 0) + 1;
    }

    for (const genre of entry.snapshot.genres) {
      genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }

    const format = entry.snapshot.format ?? 'Unknown';
    formats.set(format, (formats.get(format) ?? 0) + 1);

    if (
      passes > 1 &&
      (!longestRunning || entry.rewatches > longestRunning.rewatches)
    ) {
      longestRunning = entry;
    }
  }

  const totalGenreTags = Array.from(genres.values()).reduce((sum, count) => sum + count, 0);
  const finished = statusCounts.COMPLETED;
  const started = entries.length - statusCounts.PLANNING;

  return {
    totalEntries: entries.length,
    episodesWatched,
    minutesWatched,
    daysWatched: minutesWatched / 60 / 24,
    meanScore: scoredCount > 0 ? scoreSum / scoredCount : null,
    scoredCount,
    completionRate: started > 0 ? finished / started : 0,
    statusCounts,
    genreBreakdown: Array.from(genres.entries())
      .map(([genre, count]) => ({
        genre,
        count,
        share: totalGenreTags > 0 ? count / totalGenreTags : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    formatBreakdown: Array.from(formats.entries())
      .map(([format, count]) => ({ format, count }))
      .sort((a, b) => b.count - a.count),
    scoreHistogram: histogram.map((count, index) => ({ bucket: index * 10 + 10, count })),
    longestRunning,
    rewatchTotal,
  };
}

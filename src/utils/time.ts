/**
 * Airing times arrive as absolute unix seconds, so the JST origin never leaks
 * into the UI (§11). Everything here formats in the local timezone.
 */

export function formatCountdown(secondsUntil: number): string {
  if (secondsUntil <= 0) return 'Airing now';

  const days = Math.floor(secondsUntil / 86_400);
  const hours = Math.floor((secondsUntil % 86_400) / 3_600);
  const minutes = Math.floor((secondsUntil % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function airingDayLabel(airingAtSeconds: number, now = new Date()): string {
  const airing = new Date(airingAtSeconds * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.floor((airing.getTime() - startOfToday) / dayMs);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return airing.toLocaleDateString(undefined, { weekday: 'long' });
  return airing.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatDate(timestamp: number | null): string {
  if (!timestamp) return '--';
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatFuzzyDate(
  date: { year: number | null; month: number | null; day: number | null } | null | undefined,
): string {
  if (!date || !date.year) return 'TBA';
  if (!date.month) return String(date.year);
  const month = new Date(date.year, date.month - 1, date.day ?? 1).toLocaleDateString(undefined, {
    month: 'short',
  });
  return date.day ? `${month} ${date.day}, ${date.year}` : `${month} ${date.year}`;
}

export function fuzzyDateToTimestamp(
  date: { year: number | null; month: number | null; day: number | null } | null | undefined,
): number | null {
  if (!date?.year) return null;
  return new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1).getTime();
}

export function timestampToFuzzyDate(
  timestamp: number | null,
): { year: number; month: number; day: number } | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/**
 * Quiet-hours test. Handles windows that wrap midnight (22:00 to 07:00), which
 * is the common case and the one naive implementations get wrong.
 */
export function isWithinQuietHours(
  now: Date,
  quiet: { start: string; end: string } | null,
): boolean {
  if (!quiet) return false;
  const toMinutes = (value: string): number | null => {
    const parts = value.split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === null || end === null || start === end) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(timestamp);
}

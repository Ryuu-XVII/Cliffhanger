import { airingDayLabel, formatCountdown, isWithinQuietHours } from '@/utils/time';

describe('countdown formatting', () => {
  it('shows days and hours when far out', () => {
    expect(formatCountdown(2 * 86400 + 14 * 3600)).toBe('2d 14h');
  });

  it('shows hours and minutes inside a day', () => {
    expect(formatCountdown(2 * 3600 + 45 * 60)).toBe('2h 45m');
  });

  it('shows minutes only in the last hour', () => {
    expect(formatCountdown(20 * 60)).toBe('20m');
  });

  it('says airing now once the time has passed', () => {
    expect(formatCountdown(0)).toBe('Airing now');
    expect(formatCountdown(-500)).toBe('Airing now');
  });
});

describe('airing day labels', () => {
  const now = new Date(2026, 7, 26, 12, 0, 0);

  it('labels today and tomorrow', () => {
    const today = Math.floor(new Date(2026, 7, 26, 20, 0, 0).getTime() / 1000);
    const tomorrow = Math.floor(new Date(2026, 7, 27, 9, 0, 0).getTime() / 1000);
    expect(airingDayLabel(today, now)).toBe('Today');
    expect(airingDayLabel(tomorrow, now)).toBe('Tomorrow');
  });
});

describe('quiet hours', () => {
  it('handles a window that wraps midnight', () => {
    const quiet = { start: '22:00', end: '07:00' };
    expect(isWithinQuietHours(new Date(2026, 7, 26, 23, 30), quiet)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 7, 26, 3, 0), quiet)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 7, 26, 12, 0), quiet)).toBe(false);
  });

  it('handles a same-day window', () => {
    const quiet = { start: '09:00', end: '17:00' };
    expect(isWithinQuietHours(new Date(2026, 7, 26, 10, 0), quiet)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 7, 26, 20, 0), quiet)).toBe(false);
  });

  it('is never active when quiet hours are off or malformed', () => {
    expect(isWithinQuietHours(new Date(), null)).toBe(false);
    expect(isWithinQuietHours(new Date(), { start: 'nope', end: '07:00' })).toBe(false);
  });
});

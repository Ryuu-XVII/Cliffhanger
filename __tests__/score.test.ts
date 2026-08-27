import { formatScore, fromDisplayScore, scoreScale, toDisplayScore } from '@/data/score';

describe('score conversion', () => {
  it('round-trips a 10 point score through the 0-100 store format', () => {
    const stored = fromDisplayScore(8.5, 'POINT_10');
    expect(stored).toBe(85);
    expect(toDisplayScore(stored, 'POINT_10')).toBe(8.5);
  });

  it('round-trips a 5 star score', () => {
    const stored = fromDisplayScore(4, 'POINT_5');
    expect(stored).toBe(80);
    expect(toDisplayScore(stored, 'POINT_5')).toBe(4);
  });

  it('keeps a 100 point score untouched', () => {
    expect(fromDisplayScore(73, 'POINT_100')).toBe(73);
    expect(toDisplayScore(73, 'POINT_100')).toBe(73);
  });

  it('clamps out-of-range input rather than storing it', () => {
    expect(fromDisplayScore(20, 'POINT_10')).toBe(100);
    expect(fromDisplayScore(-4, 'POINT_10')).toBe(0);
  });

  it('treats null as unscored in every format', () => {
    expect(toDisplayScore(null, 'POINT_10')).toBeNull();
    expect(formatScore(null, 'POINT_100')).toBe('--');
  });

  it('formats whole numbers without a trailing decimal', () => {
    expect(formatScore(80, 'POINT_10')).toBe('8');
    expect(formatScore(85, 'POINT_10')).toBe('8.5');
  });

  it('exposes a picker scale per format', () => {
    expect(scoreScale('POINT_5')).toEqual({ max: 5, step: 1 });
    expect(scoreScale('POINT_100')).toEqual({ max: 100, step: 1 });
  });
});

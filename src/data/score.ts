import type { ScoreFormat } from './models';

/**
 * Scores live as 0-100 internally (§8). These converters are the only place
 * display formats exist - nothing else may store a 1-10 value.
 */

export function toDisplayScore(score: number | null, format: ScoreFormat): number | null {
  if (score === null) return null;
  switch (format) {
    case 'POINT_100':
      return Math.round(score);
    case 'POINT_10':
      return Math.round(score) / 10;
    case 'POINT_5':
      return Math.round(score / 20);
  }
}

export function fromDisplayScore(display: number | null, format: ScoreFormat): number | null {
  if (display === null) return null;
  switch (format) {
    case 'POINT_100':
      return clamp(Math.round(display), 0, 100);
    case 'POINT_10':
      return clamp(Math.round(display * 10), 0, 100);
    case 'POINT_5':
      return clamp(Math.round(display * 20), 0, 100);
  }
}

export function formatScore(score: number | null, format: ScoreFormat): string {
  const display = toDisplayScore(score, format);
  if (display === null) return '--';
  switch (format) {
    case 'POINT_100':
      return String(display);
    case 'POINT_10':
      return display % 1 === 0 ? display.toFixed(0) : display.toFixed(1);
    case 'POINT_5':
      return display + '*';
  }
}

/** Step and ceiling for the score picker in the edit sheet. */
export function scoreScale(format: ScoreFormat): { max: number; step: number } {
  switch (format) {
    case 'POINT_100':
      return { max: 100, step: 1 };
    case 'POINT_10':
      return { max: 10, step: 0.5 };
    case 'POINT_5':
      return { max: 5, step: 1 };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

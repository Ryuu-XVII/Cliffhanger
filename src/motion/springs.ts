import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';
import { Easing } from 'react-native-reanimated';

/**
 * §9 — every animation in the app pulls its curve from here. Named for feel,
 * not for numbers, so the vocabulary stays consistent across features.
 */
export const spring = {
  /** Default UI response: quick, barely overshoots. */
  snappy: { damping: 20, stiffness: 320, mass: 0.9 } satisfies WithSpringConfig,
  /** Press-in / release on cards — squishy and physical. */
  squish: { damping: 15, stiffness: 260, mass: 0.8 } satisfies WithSpringConfig,
  /** The incrementer counter (F-05). Bouncy enough to read as "pop". */
  pop: { damping: 11, stiffness: 340, mass: 0.7 } satisfies WithSpringConfig,
  /** Sheets, hero transitions — heavier, expensive-feeling. */
  weighty: { damping: 26, stiffness: 180, mass: 1.1 } satisfies WithSpringConfig,
  /** Gesture-tracking release (pull to refresh, dismiss). */
  gentle: { damping: 30, stiffness: 140, mass: 1 } satisfies WithSpringConfig,
} as const;

export const timing = {
  fast: { duration: 140, easing: Easing.out(Easing.quad) } satisfies WithTimingConfig,
  base: { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) } satisfies WithTimingConfig,
  slow: { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) } satisfies WithTimingConfig,
  /** Reduced-motion substitute: near-instant, never zero (avoids flicker). */
  reduced: { duration: 80, easing: Easing.linear } satisfies WithTimingConfig,
} as const;

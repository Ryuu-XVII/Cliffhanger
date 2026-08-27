import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutRectangle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { create } from 'zustand';

import { spring, timing, useReducedMotion } from '@/motion';
import { radii } from '@/theme/tokens';
import { Cover } from '@/ui/Cover';

/**
 * §9 "Title detail entry: shared-element transition from the library card cover
 * to the detail hero. Not a cut, not a fade."
 *
 * Reanimated 4 dropped the built-in sharedTransitionTag, so this is a measured
 * hero: the card records its cover rect in window space before navigating, and
 * the detail screen springs an overlay from that rect to the destination.
 *
 * The overlay's OWN layout is static, pinned at the destination rect from the
 * moment it mounts. Only `transform` (translate + scale) animates. This is a
 * FLIP transition, and the transform-only constraint is load-bearing, not a
 * style preference: `left/top/width/height` are layout properties on Fabric,
 * so animating them drives a Yoga relayout every frame. If that spring is
 * ever abandoned mid-flight - which the earlier version did, unmounting on a
 * fixed JS timeout regardless of whether the animation had actually settled -
 * the native scheduler is left driving relayout against a node that no longer
 * exists. That produced a genuine native-thread infinite loop on device: the
 * UI thread pegged, GC thrashing, the JS thread asleep and unaware anything
 * was wrong, ending in an ANR no JS-side crash boundary could ever catch.
 * `transform` is compositor-only - it cannot trigger that class of bug - and
 * every animated value is explicitly cancelled on unmount besides.
 */

export interface HeroOrigin {
  anilistId: number;
  uri: string | null;
  rect: LayoutRectangle;
}

interface HeroState {
  origin: HeroOrigin | null;
  set: (origin: HeroOrigin) => void;
  clear: () => void;
}

export const useHeroStore = create<HeroState>((set) => ({
  origin: null,
  set: (origin) => set({ origin }),
  clear: () => set({ origin: null }),
}));

/** Called from a card just before `router.push`. */
export function captureHero(
  node: View | null,
  anilistId: number,
  uri: string | null,
): Promise<void> {
  return new Promise((resolve) => {
    if (!node) {
      resolve();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        useHeroStore.getState().set({ anilistId, uri, rect: { x, y, width, height } });
      }
      resolve();
    });
  });
}

export interface HeroCoverProps {
  anilistId: number;
  uri: string | null;
  /** Destination rect in window space. */
  target: LayoutRectangle;
  radius?: number;
  accessibilityLabel?: string;
}

/**
 * Renders the destination cover. When an origin was captured for this title,
 * the overlay is pinned at `target` (static layout, never animated) and only
 * its transform starts offset - positioned and scaled to visually coincide
 * with the origin card - then springs to identity.
 */
export function HeroCover({
  anilistId,
  uri,
  target,
  radius = radii.md,
  accessibilityLabel,
}: HeroCoverProps) {
  const origin = useHeroStore((state) => state.origin);
  const clear = useHeroStore((state) => state.clear);
  const reduced = useReducedMotion();

  const matched = origin && origin.anilistId === anilistId ? origin : null;
  const [settled, setSettled] = useState(matched === null);

  // Centre-to-centre delta and scale ratio: RN scales a view around its own
  // centre, so aligning the origin and target boxes needs the offset between
  // their centres, not their top-left corners.
  const offset = matched
    ? {
        translateX:
          matched.rect.x + matched.rect.width / 2 - (target.x + target.width / 2),
        translateY:
          matched.rect.y + matched.rect.height / 2 - (target.y + target.height / 2),
        scaleX: matched.rect.width / target.width,
        scaleY: matched.rect.height / target.height,
      }
    : { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 };

  const translateX = useSharedValue(offset.translateX);
  const translateY = useSharedValue(offset.translateY);
  const scaleX = useSharedValue(offset.scaleX);
  const scaleY = useSharedValue(offset.scaleY);

  useEffect(() => {
    if (!matched) return;

    const run = (value: typeof translateX, to: number): void => {
      value.value = reduced ? withTiming(to, timing.reduced) : withSpring(to, spring.weighty);
    };

    run(translateX, 0);
    run(translateY, 0);
    run(scaleX, 1);
    run(scaleY, 1);

    // The overlay only exists for the length of the transition; the static
    // cover underneath takes over afterwards so scrolling costs nothing
    // extra. Cancelling here - rather than just unmounting - guarantees the
    // native side is never left driving a spring against a removed node.
    const timer = setTimeout(
      () => {
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        cancelAnimation(scaleX);
        cancelAnimation(scaleY);
        setSettled(true);
        clear();
      },
      reduced ? 120 : 420,
    );

    return () => {
      clearTimeout(timer);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(scaleX);
      cancelAnimation(scaleY);
    };
    // Deliberately keyed only on `matched` identity - the shared values above
    // are stable objects that must not retrigger this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scaleX: scaleX.value },
      { scaleY: scaleY.value },
    ],
  }));

  if (settled || !matched) return null;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: target.x,
            top: target.y,
            width: target.width,
            height: target.height,
          },
          style,
        ]}
      >
        <Cover uri={uri} radius={radius} accessibilityLabel={accessibilityLabel} />
      </Animated.View>
    </Animated.View>
  );
}

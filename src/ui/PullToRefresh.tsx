import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics, spring, timing, useReducedMotion } from '@/motion';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * §9 "Pull to refresh: custom, not the platform default."
 *
 * A pan gesture running alongside the scroll view drives a rubber-banded
 * translate and an arc that fills as you pull. It only engages at the top of
 * the list, so normal scrolling is untouched, and it never blocks input.
 */

const THRESHOLD = 88;
const MAX_PULL = 140;

export interface PullToRefreshProps extends Omit<ScrollViewProps, 'refreshControl'> {
  onRefresh?: () => Promise<unknown> | void;
  /** Exposed so cards can drive their parallax from the same offset. */
  scrollYRef?: SharedValue<number>;
  children: React.ReactNode;
}

export function PullToRefresh({
  onRefresh,
  scrollYRef,
  children,
  onScroll,
  ...rest
}: PullToRefreshProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const internalScrollY = useSharedValue(0);
  const scrollY = scrollYRef ?? internalScrollY;
  const pull = useSharedValue(0);

  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const finish = useCallback(() => {
    busy.current = false;
    setRefreshing(false);
    pull.value = withSpring(0, spring.gentle);
  }, [pull]);

  const trigger = useCallback(() => {
    if (busy.current || !onRefresh) {
      pull.value = withSpring(0, spring.gentle);
      return;
    }
    busy.current = true;
    setRefreshing(true);
    haptics.bump();
    pull.value = withSpring(56, spring.gentle);

    Promise.resolve(onRefresh())
      .catch(() => undefined)
      .finally(finish);
  }, [onRefresh, pull, finish]);

  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;

  /** Stable identity for the worklet; reads the latest trigger through the ref. */
  const fireRefresh = useCallback(() => {
    triggerRef.current();
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // The gesture is built once. Rebuilding it on every render re-registers it
  // with the native handler, and callers legitimately pass an onRefresh whose
  // identity changes each render (TanStack query objects are not stable), so
  // the latest callback is reached through a ref instead of a dependency.
  const enabled = onRefresh !== undefined;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        // Require a clear, mostly-vertical downward drag before the gesture
        // activates at all. Without this it competes with every tap and
        // every horizontal rail scroll from the moment a finger touches down,
        // and gesture-handler's native arbitration can be left waiting on
        // that resolution indefinitely - which is what an unresolved
        // `simultaneousWithExternalGesture` link produced here before: input
        // dispatch timing out with the JS thread never even entering the
        // picture. Explicit offsets let the pan gesture fail fast instead.
        .activeOffsetY(12)
        .failOffsetY(-12)
        .failOffsetX([-10, 10])
        .onUpdate((event) => {
          if (scrollY.value > 1 || event.translationY <= 0) return;
          // Rubber band: resistance grows as the pull extends.
          const resisted = MAX_PULL * (1 - Math.exp(-event.translationY / MAX_PULL));
          pull.value = resisted;
        })
        .onEnd(() => {
          if (pull.value >= THRESHOLD) {
            runOnJS(fireRefresh)();
          } else {
            pull.value = withSpring(0, spring.gentle);
          }
        }),
    [enabled, pull, scrollY, fireRefresh],
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? Math.min(pull.value, 40) : pull.value }],
  }));

  const indicatorStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, pull.value / THRESHOLD);
    return {
      opacity: progress,
      transform: [
        { translateY: pull.value * 0.5 - 24 },
        { scale: 0.6 + progress * 0.4 },
        { rotate: reduced ? '0deg' : progress * 220 + 'deg' },
      ],
    };
  }, [reduced]);

  const arcStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, pull.value / THRESHOLD);
    return {
      borderColor: progress >= 1 ? colors.primary : colors.outlineVariant,
      borderTopColor: colors.primary,
      opacity: refreshing ? withTiming(1, timing.fast) : 1,
    };
  }, [colors, refreshing]);

  return (
    <View style={styles.fill}>
      <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]}>
        <Animated.View style={[styles.arc, arcStyle]} />
      </Animated.View>

      <Animated.View style={[styles.fill, contentStyle]}>
        <Animated.ScrollView
          ref={scrollRef}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={trigger} tintColor={colors.primary} />}
          {...rest}
        >
          {children}
        </Animated.ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  indicator: {
    position: 'absolute',
    alignSelf: 'center',
    top: spacing.lg,
    zIndex: 10,
  },
  arc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
  },
});

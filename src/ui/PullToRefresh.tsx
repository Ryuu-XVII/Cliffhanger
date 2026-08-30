import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View, type ScrollViewProps } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics } from '@/motion';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pull to refresh, plus the shared scroll offset that cards read for parallax.
 *
 * NOTE ON §9 ("Pull to refresh: custom, not the platform default"):
 * this is currently the platform control, tinted. A hand-rolled pan-driven
 * version used to live here - rubber band, an arc that filled as you pulled,
 * haptic at the threshold - but its GestureDetector was removed while fixing an
 * ANR, leaving the gesture built and never attached. The result was worse than
 * either option: the custom arc still animated on refresh because `trigger`
 * drove it directly, so a refresh showed the custom arc *and* the platform
 * spinner at once, while the pull interaction itself did nothing.
 *
 * Restoring it needs `Gesture.Simultaneous(pan, Gesture.Native())` so the pan
 * and the scroll view can both claim the drag. Attaching the pan alone would
 * activate on any 12px downward drag and block scrolling back up a list, and
 * the ref-based composition that was here before is what caused the original
 * input-dispatch ANR. That wants verifying on a device, so until then this
 * stays honest: one indicator, and it works.
 */

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

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const internalScrollY = useSharedValue(0);
  const scrollY = scrollYRef ?? internalScrollY;

  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const finish = useCallback(() => {
    busy.current = false;
    setRefreshing(false);
  }, []);

  const trigger = useCallback(() => {
    // Guarded because the platform control can fire again mid-refresh.
    if (busy.current || !onRefresh) return;
    busy.current = true;
    setRefreshing(true);
    haptics.bump();

    Promise.resolve(onRefresh())
      .catch(() => undefined)
      .finally(finish);
  }, [onRefresh, finish]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  return (
    <View style={styles.fill}>
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={trigger}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surfaceContainerHigh}
            />
          ) : undefined
        }
        {...rest}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

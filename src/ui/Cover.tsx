import { Image, type ImageContentFit } from 'expo-image';
import React from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/motion';
import { radii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * A tiny blurhash stands in while the real art decodes, so a grid never flashes
 * grey boxes. expo-image handles the disk cache (§3.1).
 */
const PLACEHOLDER_BLURHASH = 'L03[xY00~q00_3M{ofofj[ayj[ay';

export interface CoverProps {
  uri: string | null | undefined;
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  contentFit?: ImageContentFit;
  style?: ViewStyle;
  /** Scroll offset driving the parallax; omit for a static cover. */
  scrollY?: SharedValue<number>;
  /** This card's y position in the scroll container. */
  itemOffset?: number;
  /** Pixels of drift at the extremes. Subtle by design (§9). */
  parallaxRange?: number;
  accessibilityLabel?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * §9 "Library scroll: parallax on cover art within cards. Subtle - enough to
 * read as depth, not enough to distract." The image is oversized by the
 * parallax range so drifting never exposes an edge.
 */
export function Cover({
  uri,
  width = '100%',
  height = '100%',
  radius = radii.md,
  contentFit = 'cover',
  style,
  scrollY,
  itemOffset = 0,
  parallaxRange = 12,
  accessibilityLabel,
  priority = 'normal',
}: CoverProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const parallaxEnabled = scrollY !== undefined && !reduced;

  const animatedStyle = useAnimatedStyle(() => {
    if (!scrollY || reduced) return { transform: [{ translateY: 0 }] };
    const relative = scrollY.value - itemOffset;
    const translateY = interpolate(
      relative,
      [-600, 0, 600],
      [parallaxRange, 0, -parallaxRange],
      'clamp',
    );
    return { transform: [{ translateY }] };
  }, [itemOffset, parallaxRange, reduced]);

  const source = uri ? { uri } : undefined;

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: colors.surfaceContainerHigh,
        },
        style ?? {},
      ]}
    >
      {parallaxEnabled ? (
        <AnimatedImage
          source={source}
          placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
          placeholderContentFit="cover"
          contentFit={contentFit}
          transition={220}
          cachePolicy="disk"
          priority={priority}
          recyclingKey={uri ?? 'empty'}
          accessible={accessibilityLabel !== undefined}
          accessibilityLabel={accessibilityLabel}
          style={[
            StyleSheet.absoluteFill,
            { top: -parallaxRange, bottom: -parallaxRange, height: undefined },
            animatedStyle,
          ]}
        />
      ) : (
        <Image
          source={source}
          placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
          placeholderContentFit="cover"
          contentFit={contentFit}
          transition={220}
          cachePolicy="disk"
          priority={priority}
          recyclingKey={uri ?? 'empty'}
          accessible={accessibilityLabel !== undefined}
          accessibilityLabel={accessibilityLabel}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

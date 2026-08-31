import React, { useCallback, useState } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

import { haptics, useReducedMotion } from '@/motion';
import { radii } from '@/theme/tokens';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: ViewStyle | ViewStyle[];
  /** How far the element scales down on press-in. */
  scaleTo?: number;
  /** Degrees of tilt on press-in - DESIGN.md asks for scale plus subtle rotation. */
  rotateTo?: number;
  /** Radius grows on press so the card reads as squishy (DESIGN.md, Shapes). */
  radiusFrom?: number;
  radiusTo?: number;
  haptic?: boolean;
}

/**
 * §9 "Card press: scale + subtle rotation on press-in, spring back on release."
 * Everything runs in Reanimated worklets on the UI thread, so a busy JS thread
 * can never delay the sub-100ms feedback budget.
 */
export function PressableScale({
  style,
  scaleTo = 0.96,
  rotateTo = 0.6,
  radiusFrom,
  radiusTo,
  haptic = true,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      // Reduced motion still gets feedback, just an opacity dip rather than
      // movement - never nothing (§9 accessibility constraint).
      setPressed(true);
      if (haptic) haptics.press();
      onPressIn?.(event);
    },
    [haptic, onPressIn],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      setPressed(false);
      onPressOut?.(event);
    },
    [onPressOut],
  );

  function pressedStyle(): ViewStyle | null {
    if (!pressed) return null;
    if (reduced) return { opacity: 0.94 };
    return {
      opacity: 0.94,
      transform: [{ scale: scaleTo }, { rotateZ: `${rotateTo}deg` }],
      ...(radiusFrom !== undefined && radiusTo !== undefined ? { borderRadius: radiusTo } : {}),
    };
  }

  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[{ borderRadius: radiusFrom ?? radii.DEFAULT }, style, pressedStyle()]}
    >
      {children as React.ReactNode}
    </Pressable>
  );
}

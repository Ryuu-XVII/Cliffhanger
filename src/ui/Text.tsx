import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypeToken } from '@/theme/typography';
import type { Palette } from '@/theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeToken;
  colour?: keyof Palette | string;
  /** Sentence case is the house style (§10) - this only affects letterform. */
  uppercase?: boolean;
  align?: 'left' | 'center' | 'right';
}

/**
 * The only Text in the app. Centralising it guarantees dynamic type, the right
 * font family and AA-contrast defaults everywhere, with no per-screen drift.
 */
export function Text({
  variant = 'bodyMd',
  colour = 'onSurface',
  uppercase,
  align,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const resolved =
    typeof colour === 'string' && colour in theme.colors
      ? theme.colors[colour as keyof Palette]
      : (colour as string);

  return (
    <RNText
      {...rest}
      // Scaling is already applied via the theme; letting RN scale again would
      // double-apply the multiplier.
      allowFontScaling={false}
      style={[
        theme.type[variant],
        { color: resolved },
        uppercase ? { textTransform: 'uppercase' } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

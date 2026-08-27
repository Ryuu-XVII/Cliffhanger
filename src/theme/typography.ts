import { Platform, type TextStyle } from 'react-native';

/**
 * Syne (display) + Hanken Grotesk (body) per DESIGN.md.
 * Sizes here are the *base*; `useTypography` scales them with the OS font
 * scale (dynamic type) and clamps the multiplier so layouts never shatter.
 */
export const fontFamily = {
  displayBold: 'Syne_800ExtraBold',
  display: 'Syne_700Bold',
  displayMedium: 'Syne_600SemiBold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemibold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
} as const;

export type TypeToken =
  | 'displayXl'
  | 'displayLg'
  | 'displayLgMobile'
  | 'headlineMd'
  | 'headlineSm'
  | 'bodyLg'
  | 'bodyMd'
  | 'labelLg'
  | 'labelSm';

export const type: Record<TypeToken, TextStyle> = {
  displayXl: {
    fontFamily: fontFamily.displayBold,
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.96,
  },
  displayLg: {
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.32,
  },
  displayLgMobile: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.28,
  },
  headlineMd: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 32,
  },
  headlineSm: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 20,
    lineHeight: 28,
  },
  bodyLg: {
    fontFamily: fontFamily.body,
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMd: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
  },
  labelLg: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.7,
  },
  labelSm: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
};

/** Dynamic type: honour the OS scale but clamp so the shell stays usable. */
export const MAX_FONT_SCALE = 1.6;
export const MIN_FONT_SCALE = 0.85;

export function scaleType(style: TextStyle, fontScale: number): TextStyle {
  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, fontScale));
  const size = (style.fontSize ?? 16) * clamped;
  const line = (style.lineHeight ?? size * 1.4) * clamped;
  return {
    ...style,
    fontSize: size,
    lineHeight: line,
    // Android renders Syne slightly tighter; nudge so caps don't clip.
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
}

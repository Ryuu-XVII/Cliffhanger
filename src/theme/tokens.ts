/**
 * Obsidian Kinetic — design tokens.
 * Mirrors UI EXAMPLES/DESIGN.md verbatim. Nothing in the app hardcodes a colour;
 * every surface reads from here so themes (F-28) can swap the palette wholesale.
 */

export const palette = {
  surface: '#131314',
  surfaceDim: '#131314',
  surfaceBright: '#3a393a',
  surfaceContainerLowest: '#0e0e0f',
  surfaceContainerLow: '#1c1b1c',
  surfaceContainer: '#201f20',
  surfaceContainerHigh: '#2a2a2b',
  surfaceContainerHighest: '#353436',
  onSurface: '#e5e2e3',
  onSurfaceVariant: '#cfc2d6',
  inverseSurface: '#e5e2e3',
  inverseOnSurface: '#313031',
  outline: '#988d9f',
  outlineVariant: '#4d4354',
  surfaceTint: '#ddb7ff',
  primary: '#ddb7ff',
  onPrimary: '#490080',
  primaryContainer: '#b76dff',
  onPrimaryContainer: '#400071',
  inversePrimary: '#842bd2',
  secondary: '#ffb690',
  onSecondary: '#552100',
  secondaryContainer: '#ec6a06',
  onSecondaryContainer: '#4a1c00',
  tertiary: '#4cd7f6',
  onTertiary: '#003640',
  tertiaryContainer: '#009eb9',
  onTertiaryContainer: '#002f38',
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  primaryFixed: '#f0dbff',
  primaryFixedDim: '#ddb7ff',
  onPrimaryFixed: '#2c0051',
  onPrimaryFixedVariant: '#6900b3',
  secondaryFixed: '#ffdbca',
  secondaryFixedDim: '#ffb690',
  onSecondaryFixed: '#341100',
  onSecondaryFixedVariant: '#783200',
  tertiaryFixed: '#acedff',
  tertiaryFixedDim: '#4cd7f6',
  onTertiaryFixed: '#001f26',
  onTertiaryFixedVariant: '#004e5c',
  background: '#131314',
  onBackground: '#e5e2e3',
  surfaceVariant: '#353436',
  surfaceCharcoal: '#121214',
  surfaceGlass: 'rgba(24, 24, 27, 0.7)',
  oledBlack: '#000000',
  watchingGreen: '#22C55E',
  planningBlue: '#3B82F6',
  onHoldYellow: '#EAB308',
  droppedRed: '#EF4444',
} as const;

export type Palette = { [K in keyof typeof palette]: string };

/** OLED black mode (F-28) collapses the tonal layers onto pure black. */
export const oledPalette: Palette = {
  ...palette,
  surface: '#000000',
  surfaceDim: '#000000',
  background: '#000000',
  surfaceCharcoal: '#000000',
  surfaceContainerLowest: '#000000',
  surfaceContainerLow: '#0a0a0b',
  surfaceContainer: '#0e0e0f',
  surfaceContainerHigh: '#151516',
  surfaceContainerHighest: '#1c1b1c',
  surfaceGlass: 'rgba(0, 0, 0, 0.72)',
};

/** Accent overrides (F-28). Keys are stable ids persisted in user settings. */
export const accents = {
  amethyst: { primary: '#ddb7ff', primaryContainer: '#b76dff', onPrimary: '#490080' },
  sunset: { primary: '#ffb690', primaryContainer: '#ec6a06', onPrimary: '#552100' },
  cyan: { primary: '#4cd7f6', primaryContainer: '#009eb9', onPrimary: '#003640' },
  matcha: { primary: '#a8e6a1', primaryContainer: '#3fa93a', onPrimary: '#0b3b09' },
} as const;

export type AccentId = keyof typeof accents;

export const spacing = {
  unit: 4,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  gutter: 16,
  safeMargin: 20,
} as const;

export const radii = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * §"Elevation & Depth" — depth comes from tonal layering plus a 1px top-lit
 * inner border at 10% white, never from drop shadows.
 */
export const elevation = {
  void: palette.oledBlack,
  plate: palette.surfaceCharcoal,
  glass: palette.surfaceGlass,
} as const;

export const hairline = 'rgba(255, 255, 255, 0.10)';
export const hairlineStrong = 'rgba(255, 255, 255, 0.16)';

export const blurIntensity = {
  glass: 20,
  scrim: 40,
} as const;

/** Media aspect ratios. Library cards are 2:3 per DESIGN.md. */
export const aspect = {
  cover: 2 / 3,
  banner: 16 / 9,
} as const;

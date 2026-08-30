import React, { createContext, useContext, useMemo } from 'react';
import { useWindowDimensions, type TextStyle } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { accents, oledPalette, palette, type Palette } from './tokens';
import { scaleType, type TypeToken, type as typeScale } from './typography';

export interface Theme {
  colors: Palette;
  /** Typography already scaled for the current OS font scale. */
  type: Record<TypeToken, TextStyle>;
  isOled: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useSettingsStore((s) => s.settings.theme);
  const accentId = useSettingsStore((s) => s.settings.accent);
  const { fontScale } = useWindowDimensions();

  const value = useMemo<Theme>(() => {
    const isOled = themeId === 'oled';
    const base = isOled ? oledPalette : palette;
    const accent = accents[accentId] ?? accents.amethyst;
    const colors: Palette = { ...base, ...accent, surfaceTint: accent.primary };

    const type = Object.fromEntries(
      Object.entries(typeScale).map(([key, style]) => [key, scaleType(style, fontScale)]),
    ) as Record<TypeToken, TextStyle>;

    return { colors, type, isOled };
  }, [themeId, accentId, fontScale]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

/** Level 0 - The Void. Every screen sits on this and nothing else. */
export function Screen({ style, children, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View {...rest} style={[styles.root, { backgroundColor: colors.background }, style]}>
      {children}
    </View>
  );
}

/** Bottom padding that clears the floating tab dock plus the home indicator. */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + 108;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

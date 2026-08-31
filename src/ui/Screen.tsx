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

/** Height of the floating tab dock plus the breathing room above it. */
const TAB_DOCK_HEIGHT = 108;

/** Bottom padding that clears the floating tab dock plus the home indicator. */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_DOCK_HEIGHT;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

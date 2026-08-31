import React from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';

import { haptics } from '@/motion';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Rendered as a trailing count, e.g. Watching 12. */
  badge?: number;
}

/**
 * The horizontally scrolling status tabs from the library mockup. The selected
 * pill is a solid tonal surface; unselected labels stay quiet so the artwork
 * below is the loudest thing on screen.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel = 'Filter list',
}: {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={{
        paddingHorizontal: spacing.gutter,
        gap: spacing.xs,
        alignItems: 'center',
      }}
      style={[{ flexGrow: 0 }, style ?? {}]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            onPress={() => {
              if (selected) return;
              haptics.press();
              onChange(option.value);
            }}
            haptic={false}
            scaleTo={0.95}
            rotateTo={0}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={{
              borderRadius: radii.full,
              paddingVertical: spacing.sm + 4,
              paddingHorizontal: spacing.md + 4,
              backgroundColor: selected ? colors.surfaceContainerHighest : 'transparent',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                variant="headlineSm"
                colour={selected ? colors.primary : colors.onSurfaceVariant}
              >
                {option.label}
              </Text>
              {option.badge !== undefined && option.badge > 0 ? (
                <Text
                  variant="labelSm"
                  colour={selected ? colors.primary : colors.outline}
                  style={{ marginLeft: spacing.xs + 2 }}
                >
                  {option.badge}
                </Text>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

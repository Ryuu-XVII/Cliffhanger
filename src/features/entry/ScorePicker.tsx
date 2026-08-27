import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { haptics } from '@/motion';
import { fromDisplayScore, toDisplayScore } from '@/data/score';
import type { ScoreFormat } from '@/data/models';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui/Text';

/**
 * F-06 - one control, three display formats. The value handed up is always
 * 0-100; the conversion happens here and nowhere else (§8).
 */
export function ScorePicker({
  score,
  format,
  onChange,
}: {
  score: number | null;
  format: ScoreFormat;
  onChange: (score: number | null) => void;
}) {
  const { colors } = useTheme();
  const display = toDisplayScore(score, format);

  const clear = (
    <Pressable
      onPress={() => {
        haptics.press();
        onChange(null);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Clear score"
      style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
    >
      <Text variant="labelSm" colour="onSurfaceVariant" uppercase>
        Clear
      </Text>
    </Pressable>
  );

  if (format === 'POINT_5') {
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = display !== null && display >= star;
            return (
              <Pressable
                key={star}
                onPress={() => {
                  haptics.tick();
                  onChange(fromDisplayScore(star, format));
                }}
                hitSlop={6}
                accessibilityRole="radio"
                accessibilityLabel={star + ' out of 5'}
                accessibilityState={{ selected: filled }}
                style={{ padding: spacing.xs }}
              >
                <Ionicons
                  name={filled ? 'star' : 'star-outline'}
                  size={30}
                  color={filled ? colors.secondary : colors.outline}
                />
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          {score !== null ? clear : null}
        </View>
      </View>
    );
  }

  const max = format === 'POINT_100' ? 100 : 10;
  const step = format === 'POINT_100' ? 5 : 1;
  const values = Array.from({ length: Math.floor(max / step) }, (_, index) => (index + 1) * step);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text variant="displayLgMobile" colour={score === null ? colors.outline : colors.onSurface}>
          {display === null ? '--' : String(display)}
        </Text>
        <Text variant="bodyMd" colour="onSurfaceVariant" style={{ marginLeft: spacing.xs }}>
          {'/ ' + max}
        </Text>
        <View style={{ flex: 1 }} />
        {score !== null ? clear : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {values.map((value) => {
          const selected = display !== null && Math.round(display) === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                haptics.tick();
                onChange(fromDisplayScore(value, format));
              }}
              accessibilityRole="radio"
              accessibilityLabel={value + ' out of ' + max}
              accessibilityState={{ selected }}
              style={{
                minWidth: 44,
                height: 44,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.primary : colors.surfaceContainerHigh,
              }}
            >
              <Text variant="labelLg" colour={selected ? colors.onPrimary : colors.onSurface}>
                {String(value)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

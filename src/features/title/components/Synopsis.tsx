import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';

import { useReducedMotion } from '@/motion';
import { stripHtml } from '@/data/transforms';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui/Text';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * F-02 synopsis with a read-more affordance. AniList descriptions carry stray
 * markup even with asHtml:false, so everything runs through stripHtml first.
 */
export function Synopsis({ description }: { description: string | null | undefined }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const text = stripHtml(description);
  if (!text) return null;

  const toggle = () => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  };

  return (
    <View
      style={{
        marginHorizontal: spacing.gutter,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceContainerLow,
      }}
    >
      <Text variant="headlineSm">Synopsis</Text>

      <Text
        variant="bodyMd"
        colour="onSurfaceVariant"
        numberOfLines={expanded ? undefined : 4}
        style={{ marginTop: spacing.sm }}
      >
        {text}
      </Text>

      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Show less' : 'Read more'}
        accessibilityState={{ expanded }}
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}
      >
        <Text variant="labelLg" colour={colors.primary} uppercase>
          {expanded ? 'Show less' : 'Read more'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.primary}
          style={{ marginLeft: 4 }}
        />
      </Pressable>
    </View>
  );
}

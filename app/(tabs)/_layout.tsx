import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics, spring, timing, useReducedMotion } from '@/motion';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Glass } from '@/ui/Surfaces';
import { Text } from '@/ui/Text';

/**
 * The floating glass dock from DESIGN.md. Icons swap to their filled variant
 * with a spring, and an accent dot marks the active view. Tab switching keeps
 * its own momentum - there is never a full-screen flash (§9).
 */

const TABS = [
  { name: 'index', label: 'Home', icon: 'home-outline', active: 'home' },
  { name: 'library', label: 'Library', icon: 'library-outline', active: 'library' },
  { name: 'discover', label: 'Discover', icon: 'compass-outline', active: 'compass' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', active: 'person' },
] as const;

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingDock {...props} />}
      // 'shift' physically slides the outgoing/incoming native Screens past
      // each other, same failure mode as the Stack's slide animations fixed
      // above: a not-yet-painted Screen can expose its window background as
      // a strobe mid-transition. The custom FloatingDock already animates
      // the active icon/dot, so the tab content itself needs no transition.
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

type DockProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    navigate: (name: string) => void;
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
  };
};

function FloatingDock({ state, navigation }: DockProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: insets.bottom + spacing.sm }]}
    >
      <Glass radius={radii.xl} style={styles.dock}>
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const config = TABS.find((tab) => tab.name === route.name);
            if (!config) return null;

            return (
              <DockItem
                key={route.key}
                label={config.label}
                icon={config.icon}
                activeIcon={config.active}
                focused={state.index === index}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (event.defaultPrevented) return;
                  if (state.index !== index) haptics.press();
                  navigation.navigate(route.name);
                }}
              />
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

function DockItem({
  label,
  icon,
  activeIcon,
  focused,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const progress = useDerivedValue(
    () =>
      reduced
        ? withTiming(focused ? 1 : 0, timing.reduced)
        : withSpring(focused ? 1 : 0, spring.snappy),
    [focused, reduced],
  );

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -progress.value * 2 }, { scale: 1 + progress.value * 0.08 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.4 + progress.value * 0.6 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={styles.item}
      hitSlop={6}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={focused ? activeIcon : icon}
          size={22}
          color={focused ? colors.primary : colors.onSurfaceVariant}
        />
      </Animated.View>

      <Text
        variant="labelSm"
        colour={focused ? colors.primary : colors.onSurfaceVariant}
        style={{ marginTop: 3 }}
      >
        {label}
      </Text>

      <Animated.View
        style={[
          { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 3 },
          dotStyle,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.gutter,
    right: spacing.gutter,
  },
  dock: {
    borderColor: hairline,
    ...Platform.select({
      android: { elevation: 0 },
      default: {},
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 48,
  },
});

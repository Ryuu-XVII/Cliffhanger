import Constants from 'expo-constants';
import { Platform, ScrollView, View } from 'react-native';

import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * A personal-use app still benefits from knowing which build is on the
 * device when something looks wrong - version and build number are the two
 * facts worth asking for when diagnosing an issue after the fact.
 */
export default function AboutScreen() {
  const { colors } = useTheme();
  const version = Constants.expoConfig?.version ?? '-';
  const buildNumber =
    Platform.OS === 'android'
      ? Constants.expoConfig?.android?.versionCode
      : Constants.expoConfig?.ios?.buildNumber;

  return (
    <Screen>
      <ScreenHeader title="About" showBack />

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl * 2 }}>
        <View
          style={{
            padding: spacing.lg,
            borderRadius: radii.md,
            backgroundColor: colors.surfaceContainerLow,
            alignItems: 'center',
          }}
        >
          <Text variant="displayLg">Cliffhanger</Text>
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: spacing.xs }}>
            {`Version ${version}${buildNumber ? ` (${buildNumber})` : ''}`}
          </Text>
        </View>

        <Text variant="bodyMd" style={{ marginTop: spacing.xl, lineHeight: 22 }}>
          A personal anime and manga tracker, built on AniList's catalogue. No ads, no analytics,
          no accounts required.
        </Text>

        <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Credits
        </Text>
        <Text variant="bodyMd" style={{ lineHeight: 22 }}>
          Title metadata and artwork from AniList. Supplementary scores and airing times from
          Jikan and AnimeSchedule.
        </Text>
      </ScrollView>
    </Screen>
  );
}

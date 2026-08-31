import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';
import { hasOnboarded } from '@/features/onboarding/state';
import { palette } from '@/theme/tokens';

/**
 * The entry gate. F-12 is explicit that onboarding must not require an account
 * to reach the main app, so this only ever branches on whether onboarding was
 * seen - never on auth.
 */
export default function Index() {
  const ready = useAuthStore((state) => state.ready);

  if (!ready) {
    // Sub-second in practice; the splash is still up behind this.
    return <View style={{ flex: 1, backgroundColor: palette.oledBlack }} />;
  }

  return <Redirect href={hasOnboarded() ? '/(tabs)' : '/onboarding'} />;
}

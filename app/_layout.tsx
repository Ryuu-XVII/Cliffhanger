import NetInfo from '@react-native-community/netinfo';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { Syne_600SemiBold, Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { setOnline } from '@/api/http';
import { cacheEvictExpired } from '@/api/cache';
import { CelebrationHost } from '@/features/progress/CelebrationHost';
import {
  maybeSyncAiringNotifications,
  registerNotificationHandlers,
} from '@/features/notifications/notifications';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';
import { Toaster } from '@/ui/Toaster';

void SplashScreen.preventAutoHideAsync();

/**
 * TanStack Query sits on top of the persistent metadata cache, so its defaults
 * are tuned to avoid duplicating work the API layer already did (§4.5, §12).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.kind === 'offline' || error.kind === 'not-found')) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

export default function RootLayout() {
  const initialise = useAuthStore((state) => state.initialise);
  const sync = useLibraryStore((state) => state.sync);
  const wasOffline = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

  useEffect(() => {
    const unsubscribeAuth = initialise();
    const removeNotificationHandlers = registerNotificationHandlers();
    cacheEvictExpired();

    // F-10: the moment connectivity returns, flush whatever queued offline.
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
      if (online && wasOffline.current) void sync();
      wasOffline.current = !online;
    });

    // Foregrounding is the other natural moment to reconcile.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void sync();
        void maybeSyncAiringNotifications();
      }
    });

    // F-13 has to arm itself. Scheduling only from the settings screen would
    // mean a fresh install never gets an airing alert at all.
    void maybeSyncAiringNotifications();

    // Adding or dropping a show changes what should be scheduled; the helper
    // no-ops unless the watched set or the relevant settings actually moved.
    const unsubscribeLibrary = useLibraryStore.subscribe(() => {
      void maybeSyncAiringNotifications();
    });
    const unsubscribeSettings = useSettingsStore.subscribe(() => {
      void maybeSyncAiringNotifications();
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNet();
      unsubscribeLibrary();
      unsubscribeSettings();
      removeNotificationHandlers();
      appStateSub.remove();
    };
  }, [initialise, sync]);

  useEffect(() => {
    // Never hold the splash hostage to a font CDN; the fallback face is fine.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: palette.oledBlack }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.oledBlack }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: palette.background },
              }}
            >
              <Stack.Screen name="index" options={{ animation: 'none' }} />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              {/* Native screen progress events recurse through Reanimated while
                  the detail screen mounts on Android/Fabric. */}
              <Stack.Screen name="title/[id]" options={{ animation: 'none' }} />
              <Stack.Screen
                name="entry/[id]"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="search"
                options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
              />
              <Stack.Screen name="season" />
              <Stack.Screen name="stats" />
              <Stack.Screen name="lists" />
              <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
            </Stack>

            <Toaster />
            <CelebrationHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

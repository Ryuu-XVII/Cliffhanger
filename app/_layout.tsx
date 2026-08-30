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
import { AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { setOnline } from '@/api/http';
import { cacheEvictExpired } from '@/api/cache';
import { initAuthLinking } from '@/data/authLinking';
import { CelebrationHost } from '@/features/progress/CelebrationHost';
import {
  maybeSyncAiringNotifications,
  registerNotificationHandlers,
} from '@/features/notifications/notifications';
import { flushCrashReports, installCrashReporter } from '@/observability/crashReporter';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Toaster } from '@/ui/Toaster';

// §12 wants crash reporting from day one, and a crash during module init or
// first render happens before any effect runs - so the handlers go on at import
// time rather than inside the component.
installCrashReporter();

void SplashScreen.preventAutoHideAsync();

/**
 * `presentation: 'modal'` on Android is backed by react-native-screens'
 * native Dialog window, which carries the platform's own default (white)
 * window background and is measurably heavier to open/close than a regular
 * screen - the source of both a white flash and janky transitions on
 * entry/search/auth. iOS's modal presentation has no such issue and is worth
 * keeping for the native sheet feel. 'card' plus a from-bottom animation
 * reproduces the same visual "modal" look on Android without the Dialog, and
 * inherits the Stack's own `contentStyle` correctly since it renders as a
 * normal screen in the same window instead of a separate one.
 */
const MODAL_PRESENTATION = Platform.OS === 'ios' ? 'modal' : 'card';

/**
 * `slide_from_right` on Android moves the incoming screen's native Window
 * across the display while the transition runs - if that screen's own
 * content has not finished its first Fabric paint by the time the Window is
 * already partway across, whatever the Window's backing surface defaults to
 * (not always the same as the Activity theme's `windowBackground`) is what
 * shows through for that gap. `fade` does not have this failure mode by
 * construction: react-native-screens implements it as an opacity crossfade
 * between two screens that are already both mounted, so there is no
 * "physically incomplete window" state to expose in the first place - not a
 * masking trick, a different transition mechanism entirely. It is also the
 * more native-feeling choice on Android, where Material motion favours
 * fade-through over the iOS-style horizontal push kept here for iOS.
 */
const DEFAULT_STACK_ANIMATION = Platform.OS === 'ios' ? 'slide_from_right' : 'fade';

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
    const removeAuthLinking = initAuthLinking();
    const removeNotificationHandlers = registerNotificationHandlers();
    cacheEvictExpired();

    // F-10: the moment connectivity returns, flush whatever queued offline.
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
      if (online && wasOffline.current) {
        void sync();
        // Crashes captured while offline queue locally; this is the moment they
        // can finally reach the backend.
        void flushCrashReports();
      }
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
    // A crash on the previous launch has a report waiting from before the user
    // was known; retry it now that the session is being restored.
    void flushCrashReports();

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
      removeAuthLinking();
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
      {/* Outside every provider: a provider itself throwing is exactly the case
          that used to blank the app, and the fallback reads no context. */}
      <ErrorBoundary boundary="root">
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: DEFAULT_STACK_ANIMATION,
                  freezeOnBlur: true,
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
                  options={{
                    presentation: MODAL_PRESENTATION,
                    // Both from-bottom variants still move the Android Window
                    // physically, same failure mode as slide_from_right above -
                    // plain fade on Android, the nicer slide-up kept for iOS.
                    animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'fade',
                  }}
                />
                <Stack.Screen
                  name="search"
                  options={{
                    presentation: MODAL_PRESENTATION,
                    animation: Platform.OS === 'ios' ? 'fade_from_bottom' : 'fade',
                  }}
                />
                <Stack.Screen name="season" />
                <Stack.Screen name="stats" />
                <Stack.Screen name="lists" />
                <Stack.Screen name="auth" options={{ presentation: MODAL_PRESENTATION }} />
              </Stack>

              <Toaster />
              <CelebrationHost />
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

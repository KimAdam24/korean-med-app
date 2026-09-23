import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { sweepPhotoCaches } from '@/features/capture/photo-caches';
import { protectFromAppSwitcher } from '@/features/security/screen-privacy';
import { AppLockProvider, useAppLock } from '@/features/security/app-lock-context';
import { LockScreen } from '@/features/security/lock-screen';
import { Strings } from '@/i18n/strings';

/**
 * The navigator's colours, taken from the app's palette.
 *
 * The stock themes paint headers plain white or black above screens drawn on
 * the app's grey page, which leaves a seam under every title, and tint back
 * buttons with a blue that is not the app's. The header now shares the page
 * colour, so title and content read as one surface.
 */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.outline,
      background: palette.page,
      card: palette.page,
      text: palette.text,
      border: palette.border,
      notification: palette.warnAccent,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  // Anything in the photo caches at launch was left by a run that did not
  // finish reading it. See `photo-caches`. And the app switcher must never
  // show what the lock hides; see `screen-privacy`.
  useEffect(() => {
    sweepPhotoCaches();
    void protectFromAppSwitcher();
  }, []);

  return (
    <ThemeProvider value={navigationTheme(scheme)}>
      <AppLockProvider>
        <LockGate />
      </AppLockProvider>
    </ThemeProvider>
  );
}

/**
 * Renders the lock *instead of* the navigator, not over it (spec §3.3).
 *
 * An overlay would be simpler, but the screens beneath would still mount, fetch
 * the medication profile, and hold it in component state behind a view the user
 * could dismiss with a back gesture or a deep link. Swapping the tree means
 * nothing that reads medication data exists while the app is locked.
 *
 * The cost is that navigation state resets on every re-lock. That is acceptable
 * here: the app is shallow, and returning to the home screen after unlocking is
 * the expected behaviour anyway.
 */
function LockGate() {
  const { status } = useAppLock();

  if (status !== 'unlocked') {
    return <LockScreen />;
  }

  return (
    <Stack
      screenOptions={{
        // Larger and heavier than the platform default, which is set for a
        // general audience. The header shares the page colour, so its shadow
        // line would only draw a seam.
        headerTitleStyle: { fontSize: 22, fontWeight: '700' },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: Strings.home.title.ko }} />
      <Stack.Screen name="medications" options={{ title: Strings.medications.title.ko }} />
      <Stack.Screen name="medication/[id]" options={{ title: Strings.medications.title.ko }} />
      <Stack.Screen name="settings" options={{ title: Strings.settings.title.ko }} />
      <Stack.Screen
        name="camera"
        options={{
          // Full-screen and chrome-free: the capture UI supplies its own
          // close affordance, sized for the target user.
          headerShown: false,
          presentation: 'fullScreenModal',
        }}
      />
    </Stack>
  );
}

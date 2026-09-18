import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { installDeviceRecognizer } from '@/features/ocr/device-recognizer';
import { AppLockProvider, useAppLock } from '@/features/security/app-lock-context';
import { LockScreen } from '@/features/security/lock-screen';
import { Strings } from '@/i18n/strings';

/**
 * Fills the §3.1 recognizer seam at startup, before any screen can call it.
 *
 * At module scope rather than in an effect: `recognizeLabel` is reachable from
 * the camera as soon as it mounts, and a seam filled one render later would
 * report `not-configured` to whoever got there first.
 */
installDeviceRecognizer();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
    <Stack>
      <Stack.Screen name="index" options={{ title: Strings.home.title.ko }} />
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

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Strings } from '@/i18n/strings';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
    </ThemeProvider>
  );
}

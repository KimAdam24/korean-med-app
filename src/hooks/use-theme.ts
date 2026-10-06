/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, Elevation } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
}

/** Shadows for the current scheme: empty in both since the design pass. See `Elevation`. */
export function useElevation() {
  const scheme = useColorScheme();
  return Elevation[scheme === 'dark' ? 'dark' : 'light'];
}

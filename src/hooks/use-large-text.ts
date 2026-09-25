import { useWindowDimensions } from 'react-native';

import { LARGE_TEXT_SCALE } from '@/constants/theme';

/**
 * Whether the system text size is large enough that a layout should give its
 * words the room — see `LARGE_TEXT_SCALE`. Re-renders when the setting changes.
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= LARGE_TEXT_SCALE;
}

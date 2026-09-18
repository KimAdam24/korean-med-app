import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 *
 * The hydration flag comes from `useSyncExternalStore` rather than a
 * `setState` in an effect: it reports `false` during the server render and
 * `true` on the client without scheduling a second render pass, which is both
 * what `react-hooks/set-state-in-effect` wants and one less paint before the
 * user's real colour scheme applies.
 */

// Hydration is a one-way transition, so there is nothing to subscribe to.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}

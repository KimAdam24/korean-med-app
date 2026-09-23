import type { Href, useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Goes back, or — when there is nothing behind this screen — to `fallback`.
 *
 * Every screen that closes itself used to call `router.back()` alone, which
 * assumes it was reached by navigating. Opened directly, by a link or after
 * the navigator was rebuilt on unlock, there was nothing to go back to: the
 * button did nothing, and in development threw.
 */
export function goBackOr(router: Router, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

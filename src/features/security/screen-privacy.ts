import { Platform } from 'react-native';

/**
 * Keeps medicine names out of the app switcher (spec §3.3).
 *
 * The app locks when it leaves the foreground, but the operating system takes
 * its snapshot for the app switcher — iOS — or the recents screen — Android —
 * as the app leaves, before the lock has drawn. Without this, anyone holding
 * the unlocked phone could read the medication list from that thumbnail, and
 * the lock would protect nothing that mattered.
 *
 * ## What each platform does
 *
 * - **iOS**: a full blur over the app whenever it is not active. Screenshots
 *   taken while the app is open still work; iOS can protect the switcher
 *   without taking that away.
 * - **Android**: `FLAG_SECURE`, which shows a blank card in recents. Android
 *   offers no way to do that without also blocking screenshots and screen
 *   recording, so a caregiver can no longer screenshot the list to share it.
 *   Accepted: the thumbnail is visible to anyone, the screenshot only to
 *   someone already inside the app.
 *
 * ## The permission it cannot do without
 *
 * On Android 14+ the library registers a screen-capture callback the moment
 * it loads — whether or not anything here is called — and Android throws
 * unless the app declares `DETECT_SCREEN_CAPTURE`. A build that removed it,
 * believing only the screenshot listener used it, crashed at launch. It must
 * stay; `integration/android-permissions.test.ts` fails if it is removed.
 *
 * ## Why it is loaded lazily
 *
 * The native module exists only in a binary built after it was added, and the
 * library looks it up when its JavaScript is first imported. Imported
 * statically, JavaScript reloaded into an older development build would crash
 * at launch. Loaded here instead, an older build simply goes unprotected until
 * it is rebuilt. (This guards against the module being missing, not against a
 * native failure inside it — nothing in JavaScript can catch that.)
 */
export async function protectFromAppSwitcher(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  let screenCapture: typeof import('expo-screen-capture');
  try {
    // A `require` inside the try rather than `import()`: the module is still
    // evaluated only here, so a missing native module is caught, and it behaves
    // the same under Metro and under Jest, where a dynamic import does not run.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    screenCapture = require('expo-screen-capture');
  } catch {
    return;
  }

  try {
    if (Platform.OS === 'ios') {
      await screenCapture.enableAppSwitcherProtectionAsync(1);
    } else {
      // A key of its own, so no screen that toggles capture elsewhere can
      // release the app-wide protection by accident.
      await screenCapture.preventScreenCaptureAsync(APP_WIDE_KEY);
    }
  } catch {
    // Not available on this build or device; nothing further to do.
  }
}

const APP_WIDE_KEY = 'app-switcher-privacy';

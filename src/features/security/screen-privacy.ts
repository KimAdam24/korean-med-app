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
 * ## Why it is loaded lazily
 *
 * The native module exists only in a binary built after it was added, and the
 * library looks it up when its JavaScript is first imported. Imported
 * statically, JavaScript reloaded into an older development build would crash
 * at launch. Loaded here instead, an older build simply goes unprotected until
 * it is rebuilt.
 */
export async function protectFromAppSwitcher(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  let screenCapture: typeof import('expo-screen-capture');
  try {
    screenCapture = await import('expo-screen-capture');
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

import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { clearPin } from './pin';
import { destroyVault, hasStoredVault } from './secure-vault';

/**
 * Forgets keychain entries left behind by a previous installation.
 *
 * iOS keeps an app's keychain items when the app is deleted; its documents go
 * with it. Reinstalled, this app found the old PIN — and asked for it, in front
 * of an empty profile, from someone who may have deleted the app precisely
 * because they had forgotten it. With no lock on the phone there was no way
 * past that screen at all.
 *
 * A marker file in the documents folder tells a first launch from any other,
 * because it is deleted with the app. With no marker and no vault on disk, the
 * keychain's PIN, attempt counter and vault key belong to an installation that
 * no longer exists, and are cleared.
 *
 * An installation updated to the version that introduced the marker has no
 * marker either — but it has its vault, so nothing is cleared. The one cost is
 * a PIN set before any medicine was saved: that installation is asked to
 * choose a PIN again.
 */
export async function forgetPreviousInstall(): Promise<void> {
  if (Platform.OS === 'web') return;

  const marker = new File(Paths.document, 'installed.v1');
  if (marker.exists) return;

  if (!hasStoredVault()) {
    await destroyVault();
    await clearPin();
  }
  marker.create({ overwrite: true });
}

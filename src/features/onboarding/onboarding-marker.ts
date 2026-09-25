import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { hasStoredVault } from '@/features/security/secure-vault';

/**
 * Whether this installation has been through the first-launch introduction.
 *
 * Its own marker, written only when the introduction is finished. The install
 * marker (`installed.v1`) cannot serve: it is written at the very start of the
 * first launch, so an introduction interrupted by a crash or a phone call would
 * never be shown again.
 *
 * A profile already on disk also counts as introduced: an installation updated
 * from before the introduction existed has medicines saved and a lock set up,
 * and walking its user through "what this app does" would be patronising. One
 * updated with nothing saved does see it, once, which costs nothing.
 *
 * Never blocks the app: if the marker cannot be read or written, the answer is
 * "introduced", because an introduction shown again is a nuisance and an app
 * that cannot get past its introduction is broken.
 */
const MARKER = 'onboarded.v1';

export function needsOnboarding(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return !new File(Paths.document, MARKER).exists && !hasStoredVault();
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  if (Platform.OS === 'web') return;
  try {
    new File(Paths.document, MARKER).create({ overwrite: true });
  } catch {
    // Shown again next launch; see above.
  }
}

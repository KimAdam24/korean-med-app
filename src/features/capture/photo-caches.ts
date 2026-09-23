import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { PhotoNotDiscardedError } from './transient-capture';

/**
 * The two places a photograph of a label can be left on disk, and the means of
 * making sure it is not.
 *
 * Both libraries that hand this app an image write it into the app's cache
 * first: expo-camera into `Camera/`, and expo-image-picker into `ImagePicker/`
 * — the picker never returns the user's original, only a full-resolution copy
 * of it, EXIF and all. A capture is deleted by `withTransientCapture` the
 * moment it has been read. A picked copy is deleted by `discardPickedCopy`.
 *
 * Neither can run if the app dies between writing and reading — the engine
 * running out of memory on a large photo, or the user swiping the app away
 * while it says "reading". `sweepPhotoCaches` covers that, at every launch.
 */
const PHOTO_CACHES = ['Camera', 'ImagePicker'] as const;

/**
 * Deletes the picker's copy of a chosen photograph once it has been read.
 *
 * Only a file in the picker's cache folder is touched: anything else is not
 * a copy this app made, and the user's own photographs are never deleted.
 *
 * @throws PhotoNotDiscardedError if the copy is still there afterwards.
 */
export function discardPickedCopy(uri: string): void {
  if (Platform.OS === 'web') return;

  const folder = new Directory(Paths.cache, 'ImagePicker');
  const ours = uri.startsWith(folder.uri) || /\/(cache|Caches)\/ImagePicker\//.test(uri);
  if (!ours) return;

  const file = new File(uri);
  try {
    file.delete();
  } catch (cause) {
    if (stillExists(file)) throw new PhotoNotDiscardedError({ cause });
  }
}

/**
 * Empties both photo caches. Called once at launch, when nothing can be
 * mid-read, so whatever is there was left behind by a run that did not finish.
 *
 * Failures are swallowed: a file that cannot be deleted now is tried again at
 * the next launch, and a launch must not fail because of it.
 */
export function sweepPhotoCaches(): void {
  if (Platform.OS === 'web') return;

  for (const name of PHOTO_CACHES) {
    try {
      const folder = new Directory(Paths.cache, name);
      if (!folder.exists) continue;
      for (const entry of folder.list()) {
        try {
          entry.delete();
        } catch {
          // Next launch.
        }
      }
    } catch {
      // The cache itself unreadable: nothing to do until it is.
    }
  }
}

function stillExists(file: File): boolean {
  try {
    return file.exists;
  } catch {
    return false;
  }
}

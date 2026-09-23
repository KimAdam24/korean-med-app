import type { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Capture that satisfies spec §4: "processed transiently and discarded
 * immediately after data extraction".
 *
 * Worth being precise about what is and isn't achievable here. `expo-camera`
 * has no in-memory capture path on native — `takePictureAsync` always writes a
 * JPEG into the app's cache directory and hands back a `file://` URI. So "never
 * saved to disk" cannot mean "never touches disk"; it means the file's lifetime
 * is bounded, and that bound is enforced here rather than trusted to a caller.
 *
 * ## Why this is scoped rather than a plain function
 *
 * An earlier version deleted the file before returning, and handed back the
 * pixels as base64. That was safe but unusable: every on-device text recognizer
 * — Apple Vision, ML Kit — takes a file URI, and by the time the caller had the
 * image there was no file left to point at.
 *
 * Inverting it fixes that without weakening anything. The caller's work runs
 * *inside* the window, while the file still exists, and the `finally` below
 * deletes it whether that work succeeded, failed, or threw. The guarantee is
 * strictly stronger than before: there is now no way for a caller to hold the
 * image at all, because the only reference it ever sees expires when its own
 * callback returns.
 *
 * The one obligation left with the caller is not to squirrel the URI away and
 * use it later. By then the file is gone, so the failure is loud rather than a
 * silent privacy leak.
 */

/**
 * A photograph that exists only for the duration of the callback it is passed to.
 *
 * Carries no pixel data. Holding this object after the callback returns is
 * meaningless: `uri` will point at a deleted file.
 */
export type TransientImage = {
  /**
   * `file://` URI on native, a data URL on web. Valid only until the enclosing
   * {@link withTransientCapture} callback settles.
   */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'jpg' | 'png';
};

/** The photo was taken but no usable image came back. */
export class CaptureFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CaptureFailedError';
  }
}

/**
 * The cache file outlived the capture. Thrown in preference to returning the
 * recognition result, because a retained photo is a privacy failure and the
 * user is entitled to know the scan was abandoned rather than silently
 * completed.
 */
export class PhotoNotDiscardedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The captured photo could not be deleted from the cache.', options);
    this.name = 'PhotoNotDiscardedError';
  }
}

const CAPTURE_OPTIONS = {
  /**
   * `base64` is deliberately *not* requested. It doubles peak memory for a
   * large JPEG and produces a second copy of the photograph in the JS heap,
   * which is exactly the kind of copy §4 exists to prevent. Recognizers read
   * the file.
   */
  base64: false,
  /**
   * EXIF would carry GPS coordinates and a capture timestamp into the OCR
   * payload. Nothing downstream needs either, so it is never requested.
   */
  exif: false,
  /**
   * High enough that small dosage print stays legible to OCR. Lower values
   * visibly cost accuracy on the fine print of a pharmacy label.
   */
  quality: 0.9,
  /**
   * `shutterSound` is left at its default (on) deliberately: the click is
   * useful confirmation for a user who may not track a visual-only state
   * change, and some jurisdictions require it.
   */
} as const;

/**
 * Takes a photograph, runs `use` against it, and deletes it.
 *
 * @param read Receives the image while its file exists. Must not retain the URI.
 * @returns Whatever `read` returns.
 *
 * @throws CaptureFailedError if no usable photo came back.
 * @throws PhotoNotDiscardedError if the file survived — which takes precedence
 *   over an error from `read`, because an undeleted photo matters more than a
 *   failed read.
 *
 * The callback is named `read` rather than the more natural `use` because
 * React 19 exports a `use` hook, and the lint rule for hooks fires on any
 * call to an identifier of that name — including one that is plainly a
 * parameter. Not worth an eslint-disable.
 */
export async function withTransientCapture<T>(
  camera: CameraView,
  read: (image: TransientImage) => Promise<T>
): Promise<T> {
  const picture = await camera.takePictureAsync(CAPTURE_OPTIONS);

  if (!picture) {
    throw new CaptureFailedError('The camera returned no picture.');
  }
  if (!picture.uri) {
    throw new CaptureFailedError('The camera returned a picture with no image data.');
  }

  try {
    return await read({
      uri: picture.uri,
      width: picture.width,
      height: picture.height,
      format: picture.format ?? 'jpg',
    });
  } finally {
    // Runs on every path, including a throw from `read`. If deletion itself
    // fails this throws out of the `finally` and replaces whatever `read` was
    // propagating — deliberate, per the precedence noted above.
    discardCaptureFile(picture.uri);
  }
}

function discardCaptureFile(uri: string): void {
  // Web never wrote a file: `uri` is the image itself, as a data URL, and it
  // becomes unreachable when the caller's reference goes out of scope.
  if (Platform.OS === 'web') return;
  // On a device every capture is a file. Anything else cannot be deleted from
  // here, so it must not be reported as deleted.
  if (!uri.startsWith('file://')) throw new PhotoNotDiscardedError();

  const file = new File(uri);
  try {
    file.delete();
  } catch (cause) {
    // A "no such file" failure means the file is already gone, which is the
    // outcome we wanted. Anything else is a real leak.
    if (stillExists(file)) {
      throw new PhotoNotDiscardedError({ cause });
    }
  }
}

function stillExists(file: File): boolean {
  try {
    return file.exists;
  } catch {
    // If we cannot even probe the path, treat it as gone rather than reporting
    // a leak we have no evidence for.
    return false;
  }
}

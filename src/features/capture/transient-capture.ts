import type { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Capture that satisfies spec §4: "processed transiently and discarded
 * immediately after data extraction".
 *
 * Worth being precise about what is and isn't achievable here. `expo-camera`
 * has no in-memory capture path on native — `takePictureAsync` always writes a
 * JPEG into the app's cache directory and hands back a `file://` URI, even when
 * `base64: true`. So "never saved to disk" cannot mean "never touches disk"; it
 * means the file's lifetime is bounded by this function, which deletes it
 * before returning and refuses to hand back pixels it could not delete.
 *
 * The other half of the guarantee is the caller's: a {@link TransientImage}
 * must never be written to storage, put in a global store, or logged.
 */
export type TransientImage = {
  /** Raw JPEG bytes, base64-encoded. Lives in JS memory only. */
  readonly base64: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'jpg' | 'png';
};

/** The photo was taken but no usable image data came back. */
export class CaptureFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CaptureFailedError';
  }
}

/**
 * The cache file outlived the capture. Thrown in preference to returning the
 * image, because a retained photo is a privacy failure and the user is entitled
 * to know the scan was abandoned rather than silently completed.
 */
export class PhotoNotDiscardedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The captured photo could not be deleted from the cache.', options);
    this.name = 'PhotoNotDiscardedError';
  }
}

const CAPTURE_OPTIONS = {
  base64: true,
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

export async function captureTransiently(camera: CameraView): Promise<TransientImage> {
  const picture = await camera.takePictureAsync(CAPTURE_OPTIONS);

  if (!picture) {
    throw new CaptureFailedError('The camera returned no picture.');
  }

  // Read, then delete — but delete even if the read throws. If both fail the
  // deletion error propagates, which is the correct precedence: an undeleted
  // photo matters more than an unread one.
  try {
    const base64 = extractBase64(picture);
    if (!base64) {
      throw new CaptureFailedError('The camera returned a picture with no image data.');
    }
    return {
      base64,
      width: picture.width,
      height: picture.height,
      format: picture.format ?? 'jpg',
    };
  } finally {
    discardCaptureFile(picture.uri);
  }
}

/**
 * On web there is no cache file: `uri` is itself the image, as a data URL.
 * Normalise both shapes down to bare base64 so callers never branch on platform.
 */
function extractBase64(picture: { base64?: string; uri: string }): string | undefined {
  const raw = picture.base64 ?? (Platform.OS === 'web' ? picture.uri : undefined);
  if (!raw) return undefined;
  const comma = raw.startsWith('data:') ? raw.indexOf(',') : -1;
  return comma === -1 ? raw : raw.slice(comma + 1);
}

function discardCaptureFile(uri: string): void {
  // Web never wrote a file, so there is nothing to delete.
  if (Platform.OS === 'web') return;
  if (!uri.startsWith('file://')) return;

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

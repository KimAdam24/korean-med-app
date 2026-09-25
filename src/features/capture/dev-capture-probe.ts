import { File } from 'expo-file-system';

import type { TransientImage } from './transient-capture';

/**
 * Development-only inspection of the frame the camera actually returned.
 *
 * Exists because of a failure that is invisible from the OCR output alone: when
 * the recogniser reports text that is nowhere on the label, the natural reading
 * is that recognition is broken, when the likelier explanation is that the
 * camera never photographed the label at all. An Android emulator whose back
 * camera is set to `Emulated` returns a hard-coded synthetic frame — complete
 * with a rendered clock — no matter what is held in front of the host webcam.
 *
 * Showing the captured frame next to the extracted text settles which of those
 * happened in one scan, instead of by argument.
 *
 * **Off unless asked for, even in development.** It holds the photograph
 * itself, and a development build is used on real bottles with real names on
 * them; so it needs `EXPO_PUBLIC_DEV_CAPTURE_PREVIEW=1` in the environment
 * the bundle was built with, as well as a development build. Nothing else in
 * the app keeps pixels past their recognition call.
 *
 * **Returns `null` outside `__DEV__`, and that gate must stay.** The preview is
 * the photograph itself, base64-encoded in memory — precisely the copy that
 * §4 forbids keeping. Metro evaluates `__DEV__` to `false` in production and
 * drops the branch, so no release build can reach the encode; the check lives
 * here rather than at the call site so there is one place to be sure of.
 */
export type CaptureProbe = {
  readonly uri: string;
  /** Bytes on disk. A synthetic test pattern is typically far smaller than a photo. */
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  /** `data:` URL for display. Lives as long as the component holding it, not on disk. */
  readonly previewDataUrl: string;
};

export async function probeCapture(image: TransientImage): Promise<CaptureProbe | null> {
  if (!__DEV__ || process.env.EXPO_PUBLIC_DEV_CAPTURE_PREVIEW !== '1') return null;

  try {
    const file = new File(image.uri);
    return {
      uri: image.uri,
      byteLength: file.size,
      width: image.width,
      height: image.height,
      previewDataUrl: `data:image/${image.format};base64,${await file.base64()}`,
    };
  } catch {
    // A diagnostic that breaks the flow it is diagnosing is worse than no
    // diagnostic. Failing to read the file is itself informative, and the
    // caller renders nothing rather than propagating.
    return null;
  }
}

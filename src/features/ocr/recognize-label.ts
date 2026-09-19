import { Platform } from 'react-native';

import type { TransientImage } from '@/features/capture/transient-capture';

import { deviceLabelRecognizer } from './device-recognizer';
import type { LabelRecognitionResult, LabelRecognizer } from './types';

/**
 * Entry point for spec §3.1 label reading.
 *
 * ## Why the default is static
 *
 * This used to hold a mutable `recognizer` that started as `null`, and the app
 * called an `installDeviceRecognizer()` side effect from the root layout to
 * fill it. That is a wiring scheme with a failure mode: if the install runs
 * against a different instance of this module than the camera reads from — two
 * import specifiers for one file are enough, and bundlers do not always
 * deduplicate them — then the seam is filled on one copy and empty on the
 * other, and the app reports "not configured" while the engine sits there
 * working perfectly.
 *
 * It is also a silent failure. `not-configured` is a legitimate state, so a
 * mis-wire is indistinguishable from an honest "no engine here".
 *
 * So the default engine is now imported directly. There is nothing to install,
 * nothing to run in the right order, and nothing that can be wired to the
 * wrong copy. On a phone, `recognizeLabel` can no longer return
 * `not-configured` at all.
 *
 * `setLabelRecognizer` survives for tests and for swapping engines
 * deliberately; it is an override, not the mechanism the app depends on.
 */

/** Set only by tests, or to deliberately replace the engine. */
let override: LabelRecognizer | null = null;

export function setLabelRecognizer(next: LabelRecognizer | null): void {
  override = next;
}

function activeRecognizer(): LabelRecognizer | null {
  if (override) return override;

  /**
   * There is no on-device recogniser on web, and there will not be one: the
   * only way to read a label in a browser is to send the image somewhere,
   * which spec §4 forbids. `not-configured` is the truth here rather than a
   * wiring accident.
   */
  if (Platform.OS === 'web') return null;

  return deviceLabelRecognizer;
}

export async function recognizeLabel(image: TransientImage): Promise<LabelRecognitionResult> {
  const recognizer = activeRecognizer();
  if (!recognizer) return { status: 'not-configured' };
  return recognizer(image);
}

export type { LabelRecognizer };

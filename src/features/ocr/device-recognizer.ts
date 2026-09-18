import { Platform } from 'react-native';

import type { TransientImage } from '@/features/capture/transient-capture';

import { LabelOcr, type RecognizedLine } from '../../../modules/label-ocr';

import { setLabelRecognizer, type LabelRecognizer } from './recognize-label';
import { LOW_CONFIDENCE_THRESHOLD, type LabelRecognitionResult } from './types';

/**
 * Adapts the native `label-ocr` module to the §3.1 recognizer seam.
 *
 * This is the only file that knows the module exists. `recognizeLabel` is
 * registered through `setLabelRecognizer`, so replacing the engine later — with
 * a community library, or a different one per platform — is a change here and
 * nowhere else.
 *
 * What this deliberately does **not** do is decide what the text means. Turning
 * lines into a name, a strength and a sig is a separate problem with its own
 * failure modes, and mixing it into the engine adapter would make both harder
 * to reason about. Until that lands, the lines are returned as raw text.
 */

/**
 * iOS reports a real 0–1 confidence from Vision; Android reports nothing,
 * because ML Kit exposes no per-line confidence.
 *
 * The asymmetry is handled by refusing to invent a number. An unknown
 * confidence is recorded as one, which flows into `needsConfirmation` and makes
 * every Android result require the user's eyes. That is the honest outcome:
 * we genuinely do not know how sure the engine was, and a medication label is
 * not the place to assume the best.
 */
function scoreOf(line: RecognizedLine): number {
  return line.confidence ?? 0;
}

/**
 * Confidence for the read as a whole: the weakest line in it.
 *
 * A mean would let a page of crisp pharmacy boilerplate outvote the one blurred
 * line that happened to be the dose.
 */
function overallConfidence(lines: readonly RecognizedLine[]): number {
  if (lines.length === 0) return 0;
  return lines.reduce((lowest, line) => Math.min(lowest, scoreOf(line)), 1);
}

export const deviceLabelRecognizer: LabelRecognizer = async (
  image: TransientImage
): Promise<LabelRecognitionResult> => {
  const lines = await LabelOcr.recognizeTextAsync(image.uri);

  if (lines.length === 0) {
    return { status: 'unreadable' };
  }

  const rawText = lines.map((line) => line.text).join('\n');

  return {
    status: 'recognized',
    /**
     * No field extraction yet, so nothing is claimed about which line is the
     * drug name and which is the dose. Leaving the fields empty is what keeps
     * this honest: `needsConfirmation` treats an absent field as unconfirmed,
     * so the UI cannot present a guess as a reading.
     */
    fields: {},
    rawText,
  };
};

/**
 * Registers the recogniser, except on web where the module cannot work.
 *
 * Called for its side effect from the app's root layout. Leaving the seam unset
 * on web means `recognizeLabel` keeps reporting `not-configured`, which is
 * exactly what it is there.
 */
export function installDeviceRecognizer(): void {
  if (Platform.OS === 'web') return;
  setLabelRecognizer(deviceLabelRecognizer);
}

/** Re-exported so callers can reason about the threshold without a second import. */
export { LOW_CONFIDENCE_THRESHOLD, overallConfidence };

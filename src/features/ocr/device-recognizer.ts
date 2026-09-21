import type { TransientImage } from '@/features/capture/transient-capture';

import { LabelOcr } from '../../../modules/label-ocr';
import { logRecognizedLines } from './dev-line-list';
import { assessReadQuality, parseLabelFields } from './sig-parser';
import type {
  LabelRecognitionResult,
  LabelRecognizer,
  RecognizedTextLine,
} from './types';

/**
 * Adapts the native `label-ocr` module to the §3.1 recognizer contract.
 *
 * This is the only file that knows the native module exists, which is what
 * makes swapping engines a one-file change.
 *
 * It deliberately does **not** register itself. Importing a module for its side
 * effects means the wiring depends on that module being evaluated, in the right
 * order, in the same instance as the reader — and when that goes wrong it looks
 * exactly like "no engine installed". `recognize-label` imports this directly
 * instead, so the connection is a fact about the import graph rather than
 * something that has to happen at runtime.
 *
 * What this also does not do is decide what the text *means*. Turning lines
 * into a name, a strength and a sig is a separate problem with its own failure
 * modes, and mixing it into the engine adapter would make both harder to reason
 * about.
 */
/**
 * Interprets engine output, with no reference to where the image came from.
 *
 * Separate from the recogniser so the development file probe can produce
 * exactly what the camera produces. Duplicating these steps there instead would
 * let the two drift, and the probe's whole purpose is to stand in for a camera
 * that cannot be used — a stand-in that reports something different from the
 * real path is worse than none.
 */
export function interpretLines(lines: readonly RecognizedTextLine[]): LabelRecognitionResult {
  if (lines.length === 0) {
    return { status: 'unreadable' };
  }

  const fields = parseLabelFields(lines);

  return {
    status: 'recognized',
    lines,
    /**
     * Assessed here rather than in the UI so the camera and the development
     * probe cannot disagree about whether a read was good enough to act on.
     */
    quality: assessReadQuality(lines, fields),
    /**
     * Heuristics over text that has already been through OCR, so nothing here
     * is presented as verified — `sig-parser` caps every field below the
     * confirmation threshold, and leaves a field absent rather than guess.
     * `needsConfirmation` treats absent as unconfirmed, so an omission is safe
     * where an invention would not be.
     */
    fields,
    rawText: lines.map((line) => line.text).join('\n'),
  };
}

export const deviceLabelRecognizer: LabelRecognizer = async (
  image: TransientImage
): Promise<LabelRecognitionResult> => {
  const lines = await LabelOcr.recognizeTextAsync(image.uri);
  logRecognizedLines('camera', lines);
  return interpretLines(lines);
};

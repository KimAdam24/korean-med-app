import type { TransientImage } from '@/features/capture/transient-capture';

import { LabelOcr } from '../../../modules/label-ocr';
import { logRecognizedLines } from './dev-line-list';
import { interpretLines } from './interpret-lines';
import type { LabelRecognizer } from './recognizer';
import type { LabelRecognitionResult } from './types';

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
export const deviceLabelRecognizer: LabelRecognizer = async (
  image: TransientImage
): Promise<LabelRecognitionResult> => {
  const lines = await LabelOcr.recognizeTextAsync(image.uri);
  logRecognizedLines('camera', lines);
  return interpretLines(lines);
};

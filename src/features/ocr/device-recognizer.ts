import type { TransientImage } from '@/features/capture/transient-capture';

import { LabelOcr } from '../../../modules/label-ocr';
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
 * Prints the engine's output so a real label can be captured verbatim while the
 * sig parser is being written against it.
 *
 * **Gated on `__DEV__` and it must stay that way.** These lines are the text
 * printed on someone's medication: the drug, the dose, and often the
 * prescriber. Spec §4 says that data is the user's alone, and a release build
 * that wrote it to the device log would hand it to every other app able to read
 * logs. Metro evaluates `__DEV__` to `false` in production and drops the
 * branch, so the call disappears entirely from a release bundle — but only
 * because the check is here rather than around the call site.
 *
 * JSON rather than the joined text: line boundaries and per-line confidence are
 * exactly what gets lost in a human-readable dump, and exactly what the parser
 * has to be written against.
 */
function logForDevelopment(lines: readonly RecognizedTextLine[]): void {
  if (!__DEV__) return;
  // Delimited so it can be pulled out of a noisy `adb logcat` with grep.
  console.log(
    `[label-ocr] BEGIN ${lines.length} line(s)\n` +
      JSON.stringify(lines, null, 2) +
      '\n[label-ocr] END'
  );
}

export const deviceLabelRecognizer: LabelRecognizer = async (
  image: TransientImage
): Promise<LabelRecognitionResult> => {
  const lines = await LabelOcr.recognizeTextAsync(image.uri);

  logForDevelopment(lines);

  if (lines.length === 0) {
    return { status: 'unreadable' };
  }

  return {
    status: 'recognized',
    lines,
    /**
     * No field extraction yet, so nothing is claimed about which line is the
     * drug name and which is the dose. Leaving the fields empty is what keeps
     * this honest: `needsConfirmation` treats an absent field as unconfirmed,
     * so the UI cannot present a guess as a reading.
     */
    fields: {},
    rawText: lines.map((line) => line.text).join('\n'),
  };
};

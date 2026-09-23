// Relative with extensions: this module is run under plain Node by the tests
// and the evaluation harness, which do not know the bundler's `@/` alias.
import { assessReadQuality, parseLabelFields } from './sig-parser.ts';
import type { LabelRecognitionResult, RecognizedTextLine } from './types.ts';

/**
 * Interprets engine output, with no reference to where the image came from.
 *
 * One function for every path that turns lines into a result — the camera,
 * the chosen-photo path, the development probe and the evaluation harness —
 * so none of them can report something different from the others. A stand-in
 * that disagrees with the real path is worse than none, and an evaluation
 * that scores a different pipeline from the one users get measures nothing.
 *
 * Kept free of native imports for that last reason: the harness runs under
 * Node, where the OCR module does not exist.
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

/**
 * Types for the label-reading boundary (spec §3.1).
 *
 * Everything here describes text *as printed on the label*. Translation into
 * Korean (§3.2) happens downstream, and is deliberately not modelled here — the
 * original English string has to survive intact, because medication names are
 * normally kept in English or transliterated rather than translated.
 */

/**
 * A label-reading engine.
 *
 * Lives here rather than beside `recognizeLabel` so that an engine can be
 * written without importing the module that selects one. That keeps
 * `recognize-label` free to depend on the default engine directly, which is
 * what makes the wiring static rather than something a side effect has to
 * install at the right moment.
 */
export type LabelRecognizer = (
  image: import('@/features/capture/transient-capture').TransientImage
) => Promise<LabelRecognitionResult>;

export type ExtractedField = {
  /** Verbatim text from the label. Never translated, never normalised. */
  readonly text: string;
  /** 0–1. Compare against {@link LOW_CONFIDENCE_THRESHOLD}. */
  readonly confidence: number;
};

export type MedicationLabelFields = {
  readonly name?: ExtractedField;
  readonly dosage?: ExtractedField;
  readonly instructions?: ExtractedField;
};

export type LabelRecognitionResult =
  | {
      readonly status: 'recognized';
      readonly fields: MedicationLabelFields;
      /** Full OCR text, kept to power a manual-correction flow (spec §5). */
      readonly rawText?: string;
    }
  /** OCR ran but found nothing usable — bad light, blur, label out of frame. */
  | { readonly status: 'unreadable' }
  /** No recognizer registered. Distinct from a failed read, so the UI can be honest. */
  | { readonly status: 'not-configured' };

/**
 * Below this, a field must be confirmed by the user before it reaches the
 * medication profile. A misread dose is the highest-consequence bug in this
 * app, so the threshold is intentionally strict.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export function needsConfirmation(field: ExtractedField | undefined): boolean {
  return field === undefined || field.confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Types for the label-reading boundary (spec §3.1).
 *
 * Everything here describes text *as printed on the label*. Translation into
 * Korean (§3.2) happens downstream, and is deliberately not modelled here — the
 * original English string has to survive intact, because medication names are
 * normally kept in English or transliterated rather than translated.
 */

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

/** A point in image pixels, origin top left. */
export type LinePoint = { readonly x: number; readonly y: number };

/** An axis-aligned box in image pixels, origin top left. */
export type LineFrame = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/**
 * One line as the engine grouped it, before anything tries to interpret it.
 *
 * Engine-agnostic on purpose: Vision and ML Kit split the same label
 * differently. `confidence` is `null` when the engine does not report one and
 * must be read as *unknown*, never as good.
 *
 * Native code returns lines in the engine's own order, with geometry, and
 * `reading-order` sorts them. Geometry is optional because an engine may not
 * report it for every line, and because readings captured before it existed —
 * already sorted natively — must keep working as they are.
 */
export type RecognizedTextLine = {
  readonly text: string;
  readonly confidence: number | null;
  readonly frame?: LineFrame | null;
  /**
   * Clockwise from top left. Not necessarily a rectangle: on a curved or
   * tilted label, these carry the line's slope, which the frame cannot.
   */
  readonly corners?: readonly LinePoint[] | null;
};

/**
 * Why a read looks unreliable beyond the usual "please confirm".
 *
 * `clipped-name` is the one that matters most. A drug name missing its first
 * character — `-Thyroxine` for `L-Thyroxine` — still reads as a drug name, so a
 * user checking it against the box can accept it without noticing. That is a
 * different and worse failure than text that is obviously wrong.
 */
export type QualityReason =
  /** The name begins or ends mid-character, so the engine cut it off. */
  | 'clipped-name'
  /** Enough tokens have impossible capitalisation that the read is suspect. */
  | 'garbled-tokens'
  /**
   * A word on the label is one character away from a real ingredient without
   * being it — `Thyeoxine` for `Thyroxine`. Undetectable from the text alone,
   * because the misread is shaped exactly like a drug name; only comparison
   * against names that exist can see it.
   */
  | 'misread-name'
  /** Text came back, but none of it could be placed into a field. */
  | 'nothing-understood'
  /**
   * Two or more of name, strength and directions are missing or damaged. The
   * page may look fine; what the reader would be shown does not.
   */
  | 'fields-unreadable';

export type ReadQuality = {
  /**
   * `degraded` means: do not ask the user to confirm this, ask them to take the
   * photograph again. Confirmation assumes the text is close enough to check
   * against the box, and these signals say it may not be.
   */
  readonly level: 'ok' | 'degraded';
  readonly reasons: readonly QualityReason[];
};

export type LabelRecognitionResult =
  | {
      readonly status: 'recognized';
      readonly fields: MedicationLabelFields;
      /** Full OCR text, kept to power a manual-correction flow (spec §5). */
      readonly rawText?: string;
      /**
       * The lines behind `rawText`, retained separately because joining them
       * throws away the two things a parser needs most: where the engine
       * thought each line ended, and how sure it was about each one.
       */
      readonly lines?: readonly RecognizedTextLine[];
      /**
       * How much to trust the fields above, beyond their individual
       * confidences. Absent means it was not assessed.
       */
      readonly quality?: ReadQuality;
      /**
       * Lines cut off where the label curves out of sight, and the fields they
       * belong to. A field listed here is incomplete whatever its own text
       * looks like, and is never shown as a value. `null` when no such edge
       * was found. See `truncation`.
       */
      readonly truncation?: import('./truncation').EdgeTruncation | null;
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

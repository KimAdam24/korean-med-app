/**
 * The medication profile (spec §3.3).
 *
 * This is the only medication data that persists. Spec §4 permits storing
 * extracted structured data and nothing else, so there is deliberately no field
 * here for an image, a thumbnail, a crop, or a file path — not even a
 * "temporary" one. The absence is the guarantee: a type with nowhere to put a
 * photo cannot accidentally carry one into storage.
 */

export type MedicationSource =
  /** Read off a label by the recognizer in `features/ocr`. */
  | 'label-scan'
  /** Typed or corrected by the user. */
  | 'manual';

export type MedicationRecord = {
  readonly id: string;
  /**
   * As printed on the label, never translated. The §3.2 decision is to show the
   * original name alongside a Korean phonetic rendering, which means the
   * original has to survive in storage exactly as read — a translated name
   * cannot be turned back into the one on the box.
   */
  readonly name: string;
  readonly dosage?: string;
  readonly instructions?: string;
  /** ISO 8601, UTC. */
  readonly addedAt: string;
  readonly source: MedicationSource;
  /**
   * Present when the medicine was identified from a barcode against an
   * authoritative reference, absent when it came from OCR or was typed.
   *
   * Stored because §3.4 interaction checking needs a stable handle, and
   * `rxcui` is that handle — a name string is not. Its presence is also what
   * separates "we know exactly which product this is" from "this is what the
   * label appeared to say", which are different levels of confidence and
   * should not be flattened into one.
   */
  readonly identity?: {
    /** RxNorm concept unique identifier. */
    readonly rxcui: string;
    /** The 11-digit CMS code that resolved, unformatted. */
    readonly ndc11: string;
  };
  /**
   * Set when a field arrived below the OCR confidence threshold and the user
   * has not confirmed it. Carried into storage rather than resolved at scan
   * time so the UI can keep flagging an unverified dose every time it is shown.
   * A wrong dose the user silently accepted once should not become
   * indistinguishable from one they checked.
   */
  readonly needsReview: boolean;
};

/**
 * The document shape actually written to the vault.
 *
 * Versioned from the outset: this file will change once §3.2 translation and
 * §3.4 interaction data land, and a migration needs somewhere to look before it
 * starts guessing from field presence.
 */
export type MedicationProfile = {
  readonly version: 1;
  readonly medications: readonly MedicationRecord[];
};

export const EMPTY_PROFILE: MedicationProfile = { version: 1, medications: [] };

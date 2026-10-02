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

/**
 * A time of day to be reminded at, on the phone's own clock: 8:00 means 8:00
 * wherever the phone is, on the day it fires — across daylight-saving changes
 * and across timezones. See docs/reminders.md for why, and for what each
 * platform does with it.
 */
export type ReminderTime = {
  /** 0–23. */
  readonly hour: number;
  /** 0–59. */
  readonly minute: number;
};

export type MedicationRecord = {
  readonly id: string;
  /**
   * As printed on the label, never translated. §3.2 shows the original name
   * with 식약처's Korean name for its ingredients beneath it (looked up from
   * `identity.ingredients`), which means the original has to survive in
   * storage exactly as read — a translated name cannot be turned back into
   * the one on the box.
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
    /**
     * RxNorm ingredient names for the product, lower-cased.
     *
     * Stored rather than looked up on demand for two reasons. Interactions are
     * between ingredients, not products — two different tablets can carry the
     * same one — so this is the level any check has to work at. And keeping it
     * on the record makes that check pure: an elderly user should not have to
     * be online, or wait, to be told two of their medicines do not mix.
     *
     * Absent on older records and on anything not identified from a barcode.
     */
    readonly ingredients?: readonly string[];
  };
  /**
   * Set when a field arrived below the OCR confidence threshold and the user
   * has not confirmed it. Carried into storage rather than resolved at scan
   * time so the UI can keep flagging an unverified dose every time it is shown.
   * A wrong dose the user silently accepted once should not become
   * indistinguishable from one they checked.
   */
  readonly needsReview: boolean;
  /**
   * What the printed name was identified as, at ingredient level, for a
   * medicine read from a photo (`features/drugs/identify-name`): the handle
   * its FDA label is looked up by. Kept apart from `identity`, which says
   * "exactly this product, from its barcode": a name on a label says which
   * medicine, not which product. Cleared when the name is edited, since it
   * was a match for the old one. Absent on older records, on barcode ones,
   * and where the name identified nothing.
   */
  readonly nameMatch?: {
    readonly rxcui: string;
    readonly ingredients: readonly string[];
    readonly matched: string;
    /**
     * The dose form its reading named (capsule or tablet), which chose among
     * the ingredient's labels: kept, so its page chooses the same label the
     * reading showed, even where the text that named it was not saved. Null
     * where it named none (or not a swallowed one), and nothing was shown.
     * Forgotten when the user rewrites the strength or directions, whose
     * words then decide.
     */
    readonly form?: 'TABLET' | 'CAPSULE' | null;
  };
  /**
   * Set when the name was saved as read but its reading withheld it: damaged,
   * or cut off at the label's edge ("LISINOPRIL" of "LISINOPRIL AND
   * HYDROCHLOROTHIAZIDE"). Such a name is not identified, on its page either,
   * until the user takes it over by confirming or editing it: identified as
   * read, it would be some other medicine. Cleared when the name is edited.
   */
  readonly nameIncomplete?: true;
  /**
   * Where the name came from, which is a different kind of evidence each time:
   *
   * - `read`: the reading of a photo of the label, so any misreading is the
   *   camera's;
   * - `typed`: the user, typing it from the bottle (on the result screen, or
   *   by editing it later), so any mistake is theirs, and it was never read;
   * - `rxnorm`: RxNorm's name for a barcode's product.
   *
   * Kept for any later check of one source against another (a printed NDC
   * against the name, say), where which kind of evidence the name is matters.
   * Absent on records saved before it was kept.
   */
  readonly nameSource?: 'read' | 'typed' | 'rxnorm';
  /**
   * What kind of label the medicine was read from, where its lines said: a
   * pharmacy's prescription label, or an over-the-counter package's Drug
   * Facts (`labelKindOf`). It chooses between an ingredient's prescription
   * and over-the-counter FDA labels, which list different uses. Kept on the
   * record, not with `nameMatch`, since it is the photo's evidence, which no
   * later edit can give again. Absent where neither was read, and on older
   * records.
   */
  readonly labelKind?: 'prescription' | 'otc';
  /**
   * Daily reminder times, sorted, no two alike. Stored here, in the encrypted
   * vault, and nowhere else: what the phone's scheduler holds is only an
   * identifier and a generic "time for your medicine", never a name — see
   * `features/reminders`. Absent on records with no reminders.
   */
  readonly reminders?: readonly ReminderTime[];
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

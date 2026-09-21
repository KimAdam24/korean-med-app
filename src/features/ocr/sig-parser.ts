import type {
  ExtractedField,
  MedicationLabelFields,
  RecognizedTextLine,
} from './types';

/**
 * Pulls the drug, its strength, and the directions out of OCR'd label lines
 * (spec §3.1).
 *
 * ## Why this does not trust line order
 *
 * A pharmacy label is laid out in columns, and both OCR engines return lines
 * ordered by vertical position. On a real label that interleaves the columns:
 *
 *     07 MAY CAUSE DROWSINESS: TAKE WITH      <- auxiliary sticker, left
 *     08 300 MG PILLNAMELOL                   <- product, right
 *     09 FOOD. ALCOHOL MAY INTENSIFY THIS     <- auxiliary
 *     10 TAKE 1 TABLET BY MOUTHUP TO 3 TIMES  <- directions, right
 *     11 EFFECT. USE CAUTION WHEN OPERATING   <- auxiliary
 *     12 AS NEEDED. TAKE WITH FOoD.           <- directions
 *
 * Joining that in order produces a sentence that is not on the label and tells
 * the user to do something nobody prescribed. Ordering it correctly needs
 * column detection, which needs geometry the engines do not currently hand up.
 *
 * So each line is classified on its own content, and only lines that look like
 * directions are assembled — in index order, which is right *within* a column
 * even when it is wrong across them.
 *
 * ## Why nothing here is ever treated as verified
 *
 * These rules are heuristics over text that already passed through OCR. Two
 * kinds of error compound: the engine may have misread characters (this sample
 * contains `MOUTHUP`, `FOoD` and `aTY`), and the classifier may have picked the
 * wrong line. Neither is detectable from the text alone.
 *
 * So every field this produces is marked for the user to confirm, and anything
 * the rules cannot place confidently is left absent rather than guessed —
 * `needsConfirmation` treats absent as unconfirmed, so an omission is safe
 * while an invention is not. Nothing here repairs a typo: a corrected drug name
 * that is corrected wrongly is indistinguishable from a correct one.
 */

/**
 * Assigned to any field built from lines whose engine confidence is unknown,
 * which on Android is all of them.
 *
 * Deliberately below `LOW_CONFIDENCE_THRESHOLD`: not knowing how sure the
 * engine was is not the same as it being sure, and must never read that way.
 */
const UNKNOWN_ENGINE_CONFIDENCE = 0.5;

/**
 * Caps confidence even when the engine reported a high one. A perfectly
 * recognised line can still be the wrong line — structure is a guess in a way
 * character recognition is not.
 */
const MAX_STRUCTURAL_CONFIDENCE = 0.75;

/** Strength as printed: a number, optional decimal, and a dose unit. */
const STRENGTH = /\b(\d+(?:\.\d+)?)\s*(MG|MCG|G|ML|UNITS?|%)\b/i;

/** How a direction line opens. Route and frequency follow; the verb leads. */
const SIG_OPENER =
  /^(TAKE|APPLY|INSTILL|INJECT|INHALE|USE|PLACE|CHEW|SWALLOW|DISSOLVE|SPRAY|GIVE)\b/i;

/**
 * How a *continuation* of a direction opens, once the verb is on a previous
 * line. Kept narrow: every phrase here would be odd at the start of anything
 * other than directions.
 */
const SIG_CONTINUATION =
  /^(AS NEEDED|AS DIRECTED|EVERY\b|ONCE\b|TWICE\b|THREE TIMES|UNTIL\b|FOR \d|WITH (FOOD|MEALS|WATER))/i;

/**
 * Auxiliary sticker text. These are warnings printed beside the directions, not
 * part of them, and several contain administration verbs — "TAKE WITH FOOD"
 * appears inside the drowsiness warning on this very label — so they have to be
 * recognised explicitly rather than by the absence of a sig marker.
 */
const AUXILIARY = [
  /^MAY CAUSE\b/i,
  /^DO NOT\b/i,
  /^AVOID\b/i,
  /\bALCOHOL\b/i,
  /^EFFECT\b/i,
  /\bUSE CAUTION\b/i,
  /\bOPERATING\b/i,
  /\bMOVING VEHICLE\b/i,
  /\bMACHINERY\b/i,
  /\bKEEP OUT OF REACH\b/i,
  /\bFOR EXTERNAL USE\b/i,
];

/**
 * Dispensing and provenance fields. Present on every label, never part of the
 * medicine's identity, and actively dangerous to confuse with one — an Rx
 * number is digits beside text and would happily pass for a dose.
 *
 * `aTY` rather than `QTY` in the sample is an OCR misread of the same field,
 * which is why these match loosely on the surrounding punctuation.
 */
const DISPENSING = [
  /^[AQO]TY\b/i,
  /^REFILLS?\b/i,
  /^RX\s*#/i,
  /^NDC\b/i,
  /^ISSUED BY\b/i,
  /^DISCARD\b/i,
  /^FILLED\b/i,
  /\bPHARMAC(Y|IST)\b/i,
  /\bM\.?D\.?$/i,
  /\bST\.?$/i,
  /\b[A-Z]{2},?\s*\d{5}\b/,
  /^\d+\s+[NSEWV]\b/i,
];

/**
 * Watermarks from stock label artwork. Not something a dispensed label carries,
 * but they reach the engine during testing and must not be mistaken for a drug
 * name, which is otherwise exactly what an isolated capitalised word looks like.
 */
const TEMPLATE_NOISE = /^(EDITABLE|TEMPLATE|SAMPLE|SPECIMEN|VOID|THMMD)\b/i;

export type LineRole =
  | 'product'
  | 'directions'
  | 'auxiliary'
  | 'dispensing'
  | 'noise'
  | 'unknown';

export function classifyLine(text: string): LineRole {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'noise';
  if (TEMPLATE_NOISE.test(trimmed)) return 'noise';

  // Auxiliary is tested before directions on purpose: warning text contains
  // administration verbs, and misreading a warning as a direction would put
  // "take with food. alcohol may intensify this" into the dose line.
  if (AUXILIARY.some((pattern) => pattern.test(trimmed))) return 'auxiliary';

  if (SIG_OPENER.test(trimmed) || SIG_CONTINUATION.test(trimmed)) return 'directions';

  if (DISPENSING.some((pattern) => pattern.test(trimmed))) return 'dispensing';

  // A strength is the strongest single signal that a line names the product,
  // but only once everything that legitimately contains numbers is excluded.
  if (STRENGTH.test(trimmed)) return 'product';

  return 'unknown';
}

/**
 * Splits a product line into its strength and the name around it.
 *
 * Handles both orders — "300 MG PILLNAMELOL" and "PILLNAMELOL 300 MG" — because
 * both are printed, and returns the name verbatim. Nothing is title-cased or
 * otherwise tidied: §3.2 shows this string so the user can match it against the
 * box, and a reformatted name is a worse match than a shouted one.
 */
export function splitProduct(text: string): { name?: string; strength?: string } {
  const match = STRENGTH.exec(text);
  if (!match) return {};

  const strength = `${match[1]} ${match[2].toUpperCase()}`;
  const name = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();

  return { name: name.length > 0 ? name : undefined, strength };
}

function field(text: string, lines: readonly RecognizedTextLine[]): ExtractedField {
  // The weakest line wins: a dose assembled from one crisp line and one blurred
  // one is only as trustworthy as the blurred one.
  const engine = lines.reduce<number | null>((lowest, line) => {
    if (line.confidence === null) return null;
    return lowest === null ? null : Math.min(lowest, line.confidence);
  }, 1);

  return {
    text,
    confidence:
      engine === null
        ? UNKNOWN_ENGINE_CONFIDENCE
        : Math.min(engine, MAX_STRUCTURAL_CONFIDENCE),
  };
}

export function parseLabelFields(lines: readonly RecognizedTextLine[]): MedicationLabelFields {
  const classified = lines.map((line) => ({ line, role: classifyLine(line.text) }));

  const directionLines = classified.filter((entry) => entry.role === 'directions');
  const productLines = classified.filter((entry) => entry.role === 'product');

  const fields: {
    name?: ExtractedField;
    dosage?: ExtractedField;
    instructions?: ExtractedField;
  } = {};

  /**
   * Only one product line is used, and only when there is exactly one.
   *
   * Two lines carrying a strength means either the label names two medicines or
   * the classifier picked up something else, and there is no way to tell which
   * from the text. Presenting one of them would be a coin flip about which drug
   * the user is holding.
   */
  if (productLines.length === 1) {
    const [entry] = productLines;
    const { name, strength } = splitProduct(entry.line.text);
    if (name) fields.name = field(name, [entry.line]);
    if (strength) fields.dosage = field(strength, [entry.line]);
  }

  if (directionLines.length > 0) {
    // Index order, which is correct within a column even when the columns
    // themselves are interleaved. Joined with a space: the line break is an
    // artefact of the label's width, not punctuation.
    const text = directionLines
      .map((entry) => entry.line.text.trim())
      .join(' ')
      .replace(/\s+/g, ' ');

    fields.instructions = field(
      text,
      directionLines.map((entry) => entry.line)
    );
  }

  return fields;
}

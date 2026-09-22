// Relative, with its extension, rather than the `@/` alias used elsewhere.
// This is a value import, so it survives type erasure and has to resolve under
// Node when the tests run — and Node knows nothing about the bundler's alias.
import { nearestIngredient } from '../drugs/ingredients.ts';

import type {
  ExtractedField,
  MedicationLabelFields,
  QualityReason,
  ReadQuality,
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
 * which some engines never report.
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

  const sigLines = withContinuations(classified);

  if (sigLines.length > 0) {
    // Index order, which is correct within a column even when the columns
    // themselves are interleaved. Joined with a space: the line break is an
    // artefact of the label's width, not punctuation.
    const text = sigLines
      .map((line) => line.text.trim())
      .join(' ')
      .replace(/\s+/g, ' ');

    fields.instructions = field(text, sigLines);
  }

  return fields;
}

/**
 * Collects the direction lines, absorbing wrapped continuations.
 *
 * Labels wrap directions across lines, and the tail carries no marker saying so
 * — `egular motabosn.` is the second half of `...to treat irregular metabolism`
 * and looks like nothing on its own. Dropping it truncates the instruction
 * halfway, which is worse than useless: "Take tablets with food to" reads as a
 * complete thought that is missing its point.
 *
 * Absorbing the *next* line unconditionally is not an option. On a
 * column-interleaved label the next line belongs to the warning sticker, and
 * joining it produces directions nobody prescribed — the failure this parser
 * exists to avoid. So a line is absorbed only when all of these hold:
 *
 *   - the directions so far do not end in terminal punctuation, so something is
 *     evidently missing;
 *   - the candidate could not be classified as anything else, so it is not a
 *     warning, a dispensing field or another product;
 *   - it begins lowercase, which a new field on a label almost never does.
 *
 * Geometry would settle this properly — a continuation sits directly below its
 * line and shares its left edge, while a neighbouring column does not — but the
 * engines do not currently hand boxes up. These three conditions are what can
 * be decided from text alone.
 */
function withContinuations(
  classified: readonly { line: RecognizedTextLine; role: LineRole }[]
): RecognizedTextLine[] {
  const collected: RecognizedTextLine[] = [];

  for (let index = 0; index < classified.length; index += 1) {
    const entry = classified[index];
    if (entry.role !== 'directions') continue;

    collected.push(entry.line);

    let cursor = index + 1;
    let tail = entry.line.text.trim();

    while (cursor < classified.length && !/[.!?]$/.test(tail)) {
      const candidate = classified[cursor];
      if (candidate.role !== 'unknown') break;
      if (!/^[a-z]/.test(candidate.line.text.trim())) break;

      collected.push(candidate.line);
      tail = candidate.line.text.trim();
      cursor += 1;
    }

    index = cursor - 1;
  }

  return collected;
}

/**
 * A token whose capitalisation is impossible for a real word — neither all
 * lower, all upper, nor capitalised. `FOoD` and `aTY` are the engine confusing
 * letterforms, and a page with many of them was read badly.
 */
export function hasImpossibleCase(token: string): boolean {
  /**
   * Judged per part, split on hyphens and slashes. Stripping the punctuation
   * and judging the whole token would read `L-Thyroxine` as `LThyroxine` — a
   * capital in the middle of a word — and flag a correctly printed drug name
   * as garbled. Hyphenated prefixes (`L-`, `D-`, `Co-`) are common on labels.
   */
  return token.split(/[-/]/).some((part) => {
    const letters = part.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2) return false;
    return !(
      letters === letters.toLowerCase() ||
      letters === letters.toUpperCase() ||
      letters === letters[0].toUpperCase() + letters.slice(1).toLowerCase()
    );
  });
}

/** Above this share of impossible-case tokens, treat the whole read as suspect. */
const GARBLED_TOKEN_RATIO = 0.25;

/**
 * Judges whether a read is too poor to ask the user to confirm.
 *
 * ## What this can and cannot see
 *
 * It catches damage with a *shape*: a name cut off at its first character,
 * capitalisation no typesetter would produce, a page of text that parsed into
 * nothing at all.
 *
 * It cannot catch a plausible misspelling. `motabosn` for `metabolism` and
 * `Thyeoxine` for `Thyroxine` are well-formed words that happen not to exist,
 * and separating those from real drug names — which also look like words that
 * do not exist — needs a lexicon this app does not have yet. The Korean
 * ingredient list §3.2 requires is the natural source for one, and that is when
 * this should get stricter.
 *
 * So a `degraded` verdict is reliable; an `ok` verdict only means nothing
 * structural was wrong, which is why every field stays flagged for confirmation
 * regardless.
 */
export function assessReadQuality(
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields
): ReadQuality {
  const reasons: QualityReason[] = [];

  /**
   * A name that starts or ends on punctuation lost a character to the frame
   * edge or a crop. This is the signal worth having: `-Thyroxine` is still
   * shaped like a drug name, so a user checking it against the box can accept
   * it without seeing that the `L` is gone.
   */
  const name = fields.name?.text.trim();
  if (name && (!/^[A-Za-z0-9]/.test(name) || !/[A-Za-z0-9.)]$/.test(name))) {
    reasons.push('clipped-name');
  }

  const tokens = lines.flatMap((line) => line.text.split(/\s+/)).filter((token) => token.length > 1);
  const garbled = tokens.filter(hasImpossibleCase).length;
  if (tokens.length > 0 && garbled / tokens.length >= GARBLED_TOKEN_RATIO) {
    reasons.push('garbled-tokens');
  }

  /**
   * A word one character from a real ingredient, anywhere on the label.
   *
   * Scanned across every line rather than only the name field, because the
   * evidence is often elsewhere: on the label that prompted this, the
   * extracted name was clipped but legible while `L-Thyeoxine` sat in a
   * "Generic for:" line the parser does not otherwise use. Either way it is
   * the same conclusion — the engine misread this page.
   *
   * Only near misses count. An unrecognised word is not evidence of anything,
   * since the lexicon is partial and most real drugs are missing from it.
   */
  const misread = tokens.some((token) => nearestIngredient(token) !== null);
  if (misread) {
    reasons.push('misread-name');
  }

  // Text came back and none of it could be placed. A handful of lines may
  // legitimately be a label edge; a page of them means the read failed.
  const understood = Boolean(fields.name || fields.dosage || fields.instructions);
  if (!understood && lines.length >= 5) {
    reasons.push('nothing-understood');
  }

  return { level: reasons.length > 0 ? 'degraded' : 'ok', reasons };
}

import type { RecognizedTextLine } from './types.ts';

/**
 * What kind of label was read, as far as its own lines say: a pharmacy's
 * prescription label, or an over-the-counter package's.
 *
 * It chooses which FDA label a medicine's approved uses are taken from. One
 * ingredient's prescription and over-the-counter labels list different uses
 * (esomeprazole on prescription is for GERD, ulcers and H. pylori; over the
 * counter, for frequent heartburn), and a name does not say which applies.
 *
 * - `prescription`: a pharmacy's dispensing label (its Rx number, refills,
 *   quantity, prescriber, fill or discard date, "generic for"), or "Rx only".
 *   A pharmacy can dispense an over-the-counter medicine on prescription too,
 *   so this prefers the prescription label rather than requiring one.
 * - `otc`: the package's Drug Facts. That is the manufacturer's own, and wins
 *   over a pharmacy sticker on the same box.
 * - `null`: neither found, as when the lines that say were not read.
 *
 * "Compare to", printed on a store brand's box, is not a pharmacy's mark.
 */
export type LabelKind = 'prescription' | 'otc';

const PRESCRIPTION = [
  /^\s*RX\s*(#|NO\b|NUM|:|\d)/i,
  /^\s*REFILLS?\b/i,
  /^\s*[AQO]TY\b/i,
  /^\s*(GENERIC( EQUIVALENT)? (FOR|TO)|SUBSTITUTED? FOR|SUBST?\.? FOR)\b/i,
  /^\s*(PRESCRIBER|PRESCRIBED BY)\b/i,
  /^\s*DR\.?\s+[A-Z]/i,
  /^\s*(DATE\s+)?FILLED\b/i,
  /^\s*DISCARD\s+(AFTER|BY|DATE)\b/i,
  /\bRX\s+ONLY\b/i,
];

const OTC = [/\bDRUG\s+FACTS\b/i, /^\s*ACTIVE\s+INGREDIENTS?\b/i, /^\s*PURPOSES?\b/i];

export function labelKindOf(lines: readonly RecognizedTextLine[] | undefined): LabelKind | null {
  if (!lines) return null;
  const texts = lines.map((line) => line.text);
  if (texts.some((text) => OTC.some((pattern) => pattern.test(text)))) return 'otc';
  if (texts.some((text) => PRESCRIPTION.some((pattern) => pattern.test(text)))) return 'prescription';
  return null;
}

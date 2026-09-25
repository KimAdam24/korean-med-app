import { findIngredient } from '../drugs/ingredients.ts';
import { isSigWord } from './field-integrity.ts';
import { classifyLine } from './sig-parser.ts';
import type { RecognizedTextLine } from './types.ts';

/**
 * What of a reading may be written to a development build's log.
 *
 * The log is a copy outside the app: on a development phone it sits in the
 * system log until it rotates, readable over USB by anything with `adb`. It
 * used to carry every reading verbatim — the patient's name and address, the
 * prescriber, the Rx number. Now each line is written as it is only when it is
 * evidently the label's own text, and everything else is redacted in shape at
 * the source (capitals to `X`, lower case to `x`, digits to `0`), which is the
 * form the corpus requires before a reading may be committed anyway.
 *
 * Evidently label text:
 * - a product, directions or warning line, judged as the parser judges it but
 *   without a leading edge mark (`|Take …` is directions);
 * - a dispensing line that identifies nobody — "Generic for", quantity,
 *   refills, NDC; other dispensing lines (addresses, prescribers, Rx numbers,
 *   pharmacies, fill dates) are exactly what is being kept out;
 * - a line of dosing words and numbers only, with at least one dosing word
 *   (`days`, `7 days`), or any line with two or more dosing words;
 * - a line naming a known ingredient, or with a product word no person is
 *   named (`VITAMIN D2`, `… TABLET`). A drug the lexicon does not know, alone
 *   on its line, is redacted: it looks like a name, and that is the safe way
 *   to be wrong. The drug name is not personal, and can be restored by hand.
 *
 * Errs toward redacting. One known gap: a surname that is also a dosing word
 * ("Weeks"), alone on its line, would stay. The corpus header's rule — review
 * the redaction before committing — still stands.
 */
const NON_IDENTIFYING_DISPENSING = /^(generic\b|[AQO]TY\b|REFILLS?\b|NDC\b)/i;
const NUMBER_ONLY = /^[^A-Za-z]*\d[^A-Za-z]*$/;

/** Words in product names that are nobody's name. `DR` is not here: it is also "doctor". */
const PRODUCT_WORDS = new Set(
  `vitamin vit tablet tablets tab tabs capsule capsules cap caps cream ointment gel solution
  suspension syrup drops inhaler patch spray lotion powder hcl er xr sr sodium potassium calcium`.split(
    /\s+/
  )
);

export function isEvidentlyLabelText(text: string): boolean {
  const bare = text.replace(/^[^A-Za-z0-9]+/, '');
  const role = classifyLine(bare);
  if (role === 'product' || role === 'directions' || role === 'auxiliary') return true;
  if (role === 'dispensing') return NON_IDENTIFYING_DISPENSING.test(bare);

  const tokens = bare.split(/\s+/).filter(Boolean);
  const words = tokens.map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (words.some((word) => PRODUCT_WORDS.has(word) || (word.length >= 4 && findIngredient(word)))) {
    return true;
  }

  const dosing = tokens.filter(isSigWord).length;
  if (dosing >= 2) return true;
  return dosing >= 1 && tokens.every((token) => isSigWord(token) || NUMBER_ONLY.test(token));
}

export const redactInShape = (text: string) =>
  text.replace(/[A-Z]/g, 'X').replace(/[a-z]/g, 'x').replace(/[0-9]/g, '0');

/** The reading as it may be logged: geometry and confidence intact, identifying text redacted. */
export function redactForLog(lines: readonly RecognizedTextLine[]): RecognizedTextLine[] {
  return lines.map((line) =>
    isEvidentlyLabelText(line.text) ? line : { ...line, text: redactInShape(line.text) }
  );
}

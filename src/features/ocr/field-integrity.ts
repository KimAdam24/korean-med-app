// Relative with extensions: value imports in tested modules must resolve under
// plain Node, which does not know the bundler's `@/` alias.
import { editDistance, nearestIngredient } from '../drugs/ingredients.ts';
import { hasImpossibleCase } from './sig-parser.ts';

/**
 * Whether a single field's text can be shown as what it claims to be.
 *
 * ## The problem this solves
 *
 * The parser deliberately never repairs OCR text — a drug name "corrected" to
 * the wrong drug is indistinguishable from a right one. But not repairing is a
 * different thing from presenting raw damage as an answer. A reader shown
 *
 *     TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY AS NEEDED
 *
 * under the heading "how to take it" will read it as their instructions — and
 * this particular damage is not cosmetic. `MOUTHUP` has swallowed the `UP` of
 * `UP TO`, the ceiling qualifier, so what survives reads as "3 times daily":
 * a limit turned into a schedule, which for an as-needed medicine is an
 * overdose arrived at by following the screen.
 *
 * So each field is judged on its own, and a damaged one is shown as damaged —
 * never as the value.
 *
 * ## Why directions can be checked and names cannot
 *
 * Dosing instructions are written from a small, closed vocabulary: verbs of
 * administration, dose forms, routes, frequencies, conditions. A word outside
 * that set, or one character away from a word in it, is strong evidence of a
 * misread. Drug names are the opposite — an open vocabulary of words that
 * mostly do not exist in any dictionary — so a name can only be judged by
 * damage with a shape: a clipped edge, impossible capitalisation, or a near
 * miss against the ingredient lexicon.
 *
 * ## Which way errors fall
 *
 * A false positive tells the user to read the bottle themselves, which is
 * safe. A false negative presents garbled text as a dosing instruction, which
 * is not. Every threshold here leans towards the first.
 */

export type DamageKind =
  /** Capitalisation no typesetter produces: `FOoD`. */
  | 'impossible-case'
  /** Two known words run together: `MOUTHUP`, `foodto`. */
  | 'merged-words'
  /** One character from a known word without being it: `teat`, `egular`. */
  | 'near-miss'
  /** A letter sequence that is not shaped like a word: `xqzt`. */
  | 'not-a-word'
  /** The field starts or ends mid-character: `-Thyroxine`. */
  | 'clipped';

export type IntegritySpan = {
  /** Verbatim, including the whitespace between words. Joined, spans are the original text. */
  readonly text: string;
  readonly damaged: boolean;
};

export type FieldIntegrity = {
  readonly level: 'readable' | 'damaged';
  readonly reasons: readonly DamageKind[];
  /**
   * The original text, segmented so damaged words can be marked where the raw
   * reading is shown as evidence. Never used to build a corrected string.
   */
  readonly spans: readonly IntegritySpan[];
};

export type FieldKind = 'name' | 'dosage' | 'instructions';

/**
 * Words that appear in US dispensing instructions.
 *
 * Broad on purpose. A legitimate word missing from this set is only a problem
 * if a garbled token happens to sit one character from something that is
 * here, and each such gap is a false positive — safe, but corrosive to trust
 * if common. Body sites, common indications and the Latin sig abbreviations
 * (`PO BID PRN`) are included for that reason.
 */
const SIG_VOCABULARY = new Set(
  `
  take taken taking apply applied instill inject inhale use used place chew swallow
  dissolve spray give insert rub wash rinse gargle mix shake dilute crush open
  sprinkle repeat continue stop start finish finished complete discard avoid remain
  sit lie stand drink eat sleep wake treat prevent relieve reduce control help

  tablet tablets tab tabs capsule capsules cap caps pill pills drop drops puff puffs
  sprays patch patches dose doses dosage teaspoon teaspoons teaspoonful teaspoonfuls
  tablespoon tablespoons tablespoonful tsp tbsp ml mg mcg unit units application
  applications film lozenge lozenges suppository suppositories inhalation inhalations
  vial packet packets scoop scoops piece pieces half halves quarter whole amount thin
  layer dab liquid solution cream ointment gel lotion

  mouth orally oral tongue under cheek eye eyes ear ears nose nostril nostrils skin
  scalp rectally rectum vaginally vagina topically externally affected area areas face
  hand hands foot feet leg legs arm arms chest back body nail nails lips gums teeth
  throat lungs left right both each into onto inside outside

  once twice three four five six seven eight ten times time daily day days week weeks
  weekly month months monthly hour hours hourly minute minutes every other morning
  mornings evening evenings night nightly nights noon bedtime afternoon today tomorrow
  before after during while until then again first next last one two per a an

  with without food foods meal meals mealtime mealtimes breakfast lunch dinner supper
  snack milk water juice glass full empty stomach needed need necessary required pain
  fever nausea vomiting headache cough itching itch anxiety constipation diarrhea
  allergy allergies symptom symptoms relief directed prescribed instructed doctor
  physician pharmacist as if when not do dont no more than less least most maximum max
  exceed only also may can should must keep store refrigerate cool dry up to for of
  the in on at by or and is be it this these your you all any same regular regularly
  irregular slowly gently well thoroughly immediately
  blood pressure sugar heart cholesterol thyroid infection infections inflammation
  swelling muscle muscles joint joints acid metabolism

  po bid tid qid qd qod qhs hs prn qam qpm ac pc sl od os ou ad au gtt gtts
  `
    .split(/\s+/)
    .filter(Boolean)
);

/** `q4h`, `q12h` — every N hours, in sig shorthand. */
const INTERVAL_SHORTHAND = /^q\d{1,2}h$/i;

/** A quantity, possibly with a unit or multiplier attached: `3`, `1.5`, `500mg`, `3x`. */
const NUMERIC = /^\d+([.,/]\d+)?(mg|mcg|ml|g|x|%)?$/i;

/** A number fused to a word that is not a unit: `1tablet`. */
const NUMBER_FUSED_TO_WORD = /^(\d+)([a-z]{2,})$/i;

/** Letters only, lower-cased, stripped of surrounding punctuation and brackets. */
function core(token: string): string {
  return token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase();
}

function isKnownSigWord(word: string): boolean {
  return SIG_VOCABULARY.has(word) || INTERVAL_SHORTHAND.test(word);
}

/** Splits a token that is two sig words run together, if it is one. */
function isMergedSigWords(word: string): boolean {
  for (let split = 2; split <= word.length - 2; split += 1) {
    if (isKnownSigWord(word.slice(0, split)) && isKnownSigWord(word.slice(split))) {
      return true;
    }
  }
  return false;
}

/**
 * One character from a vocabulary word without being it.
 *
 * Bounded to words of four letters or more: shorter ones sit within a single
 * edit of too many unrelated words for a match to mean anything.
 */
function isNearMissSigWord(word: string): boolean {
  if (word.length < 4) return false;
  for (const known of SIG_VOCABULARY) {
    if (known.length >= 4 && editDistance(word, known, 1) === 1) return true;
  }
  return false;
}

/**
 * Not shaped like a word: no vowel in three or more letters.
 *
 * `y` counts as a vowel so that words like `dry` pass. Sig abbreviations that
 * genuinely lack vowels (`prn`, `qhs`) are in the vocabulary and never reach
 * this check.
 */
function isNotAWord(word: string): boolean {
  return word.length >= 3 && /^[a-z]+$/.test(word) && !/[aeiouy]/.test(word);
}

function tokenDamage(token: string, kind: FieldKind): DamageKind | null {
  const word = core(token);
  if (word.length === 0) return null;

  // Checked on the raw token, before case-folding hides the evidence.
  if (hasImpossibleCase(token)) return 'impossible-case';

  if (kind !== 'instructions') return null;

  if (NUMERIC.test(word) || isKnownSigWord(word)) return null;

  const fused = NUMBER_FUSED_TO_WORD.exec(word);
  if (fused && isKnownSigWord(fused[2])) return 'merged-words';

  if (isMergedSigWords(word)) return 'merged-words';
  if (isNearMissSigWord(word)) return 'near-miss';
  if (isNotAWord(word)) return 'not-a-word';

  // Unknown but well-formed — "hypertension", say. Not evidence of damage:
  // indications and drug-specific advice legitimately fall outside the set.
  return null;
}

/**
 * Judges one field of a label reading.
 *
 * Pure and synchronous, and applied at display time rather than stored, so it
 * covers records saved before it existed as well as fresh readings.
 */
export function assessField(kind: FieldKind, text: string): FieldIntegrity {
  const reasons = new Set<DamageKind>();

  const spans: IntegritySpan[] = text.split(/(\s+)/).map((piece) => {
    if (piece.length === 0 || /^\s+$/.test(piece)) return { text: piece, damaged: false };

    let damage = tokenDamage(piece, kind);

    // A name word one character from a real ingredient is far likelier to be
    // that ingredient misread than an unknown drug. Exact matches and unknown
    // names are both fine; only the near miss is informative.
    if (!damage && kind === 'name' && nearestIngredient(piece) !== null) damage = 'near-miss';

    if (damage) reasons.add(damage);
    return { text: piece, damaged: damage !== null };
  });

  const trimmed = text.trim();

  // A field starting or ending on punctuation lost a character to the frame
  // edge. Checked on the whole field, since the evidence is at its boundary.
  if (kind === 'name' && trimmed.length > 0) {
    const clippedStart = !/^[a-z0-9]/i.test(trimmed);
    const clippedEnd = !/[a-z0-9.)]$/i.test(trimmed);
    if (clippedStart || clippedEnd) {
      reasons.add('clipped');
      const edge = clippedStart
        ? spans.findIndex((span) => span.text.trim().length > 0)
        : spans.map((span) => span.text.trim().length > 0).lastIndexOf(true);
      if (edge >= 0) spans[edge] = { ...spans[edge], damaged: true };
    }
  }

  // A strength is a number and a unit, and nothing else. Anything more is not
  // a strength the app should present as one.
  if (kind === 'dosage' && !/^\d+(\.\d+)?\s*(MG|MCG|G|ML|UNITS?|%)$/i.test(trimmed)) {
    reasons.add('not-a-word');
  }

  return {
    level: reasons.size > 0 ? 'damaged' : 'readable',
    reasons: [...reasons],
    spans,
  };
}

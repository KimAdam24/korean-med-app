// Relative with extensions: value imports in tested modules must resolve under
// plain Node, which does not know the bundler's `@/` alias.
import { editDistance, nearestIngredient } from '../drugs/ingredients.ts';

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
 * ## Words are not enough
 *
 * Checking each word against the vocabulary catches damage *inside* a word.
 * It cannot catch damage *between* them, and the worst misreads are made of
 * well-formed words. A real vial printed
 *
 *     Take 1 capsule (50,000 units) by mouth every 7 days
 *
 * (the 7 under a finger in the photograph) and was read as
 *
 *     Take 1 capsule (b units) by mouth eve days
 *
 * — every word of which passed. Both dosing numbers are gone, and what is
 * left still reads as a sentence. So directions are also checked for the
 * structure a dose needs: a unit has a quantity before it, `every` has an
 * interval after it, a word is not a stray letter or a vocabulary word cut
 * short, and the text does not stop mid-phrase.
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
  /** A known word with its start or end missing: `eve` for `every`, `ery`. */
  | 'truncated'
  /** Not shaped like a word: `xqzt`, or a stray letter like the `b` in `(b units)`. */
  | 'not-a-word'
  /**
   * A quantity the surrounding words require is absent or broken: `units`
   * with no number before it, `every days`, `up to times daily`, `000 units`.
   */
  | 'missing-number'
  /**
   * A direction that never says when or how often — `TAKE 1 TABLET BY MOUTH`
   * — which is what is left when the rest of it was cut off.
   */
  | 'incomplete'
  /**
   * The field starts or ends mid-word or mid-phrase: `-Thyroxine`, or
   * directions that stop on `every` or `up to`.
   */
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
  within upon another nighttime daytime anytime everyday

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

  x g iu meq am pm hr hrs min mins wk wks ea gt dr
  even very let ice side sides out top are lay via bed tea pat pack packs halve
  break head ache sure rate lip gum lung fast spoon spoonful was
  nebulizer check pulse
  so feel feeling soon skip miss missed some that those mild light heat reach bath shower
  upright mood sliding scale external
  `
    .split(/\s+/)
    .filter(Boolean)
);

/*
 * Some entries above exist to keep a check from misfiring rather than because
 * they are common:
 *
 *   - `within`, `another`, `nighttime` and the like are compounds of two
 *     vocabulary words, and would otherwise read as words run together.
 *   - The short abbreviations (`hr`, `wk`, `ea`) and the last group are
 *     ordinary instruction words that happen to be the start or end of a
 *     longer one — `even` of `evening`, `let` of `tablet`, `via` of `vial`,
 *     `bed` of `bedtime` — and would otherwise be flagged as that word cut
 *     short. `hrs` and `wks` would also fail the vowel test.
 *
 *   - `feel`, `soon`, `skip`, `some`, `that`, `mild` and the rest of the
 *     final line are one letter from a vocabulary word (`feet`, `noon`,
 *     `skin`, `same`, `than`, `milk`) and would otherwise be near misses.
 *     "Take the missed dose as soon as you remember" is common wording.
 *
 * Missing ones surface as false positives: safe, but add them when found.
 *
 * `ever` and `table` are left out on purpose. They are the likeliest
 * surviving halves of `every` and `tablet`, and neither belongs in directions.
 */

/**
 * Units that are meaningless without a number in front of them.
 *
 * Dose forms (`tablet`, `capsule`) are not here: "take tablets with food" is a
 * complete instruction. "Take units" is not.
 */
const DOSE_UNITS = new Set(['unit', 'units', 'mg', 'mcg', 'ml', 'g', 'iu', 'meq']);

/** Plurals that, straight after `every`, mean the number between them was lost. */
const PLURAL_INTERVALS = new Set([
  'days', 'weeks', 'months', 'hours', 'minutes', 'nights', 'hrs', 'mins', 'wks',
]);

const SPELLED_QUANTITIES = new Set(
  'one two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty hundred thousand half'.split(
    ' '
  )
);

/** Letters that stand alone legitimately in directions: `a`, `3 x daily`, `1 g`. */
const LONE_LETTERS = new Set(['a', 'x', 'g']);

/**
 * Words directions never end on. Stopping on one means the rest was cut off,
 * and what was cut is usually the part that matters — `up to` loses its
 * ceiling, `every` its interval.
 */
const DANGLING = new Set(
  `every other to for with without within by of per at before after and or than up the
  a an each under into onto until in on then if as not no from about your do dont may
  can should must is be`
    .split(/\s+/)
    .filter(Boolean)
);

/** `q4h`, `q12h` — every N hours, in sig shorthand. */
const INTERVAL_SHORTHAND = /^q\d{1,2}h$/i;

/**
 * A quantity, possibly with a unit, multiplier or time attached: `3`, `1.5`,
 * `500mg`, `3x`, `8am`, `8hrs`.
 */
const NUMERIC = /^\d+([.,/]\d+)?(mg|mcg|ml|g|x|%|h|hr|hrs|am|pm|min|mins)?$/i;

/**
 * Words that say when or how often. Every dispensed direction has one; a
 * direction without one has lost it.
 */
const TIMING = new Set(
  `daily day days everyday week weeks weekly month months monthly hour hours hourly hr hrs
  minute minutes min mins night nights nightly nighttime daytime anytime bedtime morning
  mornings evening evenings noon afternoon today tomorrow meal meals mealtime mealtimes
  breakfast lunch dinner supper times once twice every needed directed until am pm
  prn bid tid qid qd qod qhs hs qam qpm ac pc`
    .split(/\s+/)
    .filter(Boolean)
);

/** The verbs directions open with — the same set the parser starts them at. */
const OPENING_VERBS = new Set(
  'take apply instill inject inhale use place chew swallow dissolve spray give'.split(' ')
);

/** A number fused to a word that is not a unit: `1tablet`. */
const NUMBER_FUSED_TO_WORD = /^(\d+)([a-z]{2,})$/i;

/**
 * Letters only, lower-cased, stripped of surrounding punctuation and brackets.
 * A printed optional plural — `TABLET(S)`, `DROP(S)` — is the word itself.
 */
function core(token: string): string {
  return token
    .replace(/\((e?s)\)([^a-z0-9]*)$/i, '$2')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .toLowerCase();
}

/**
 * Whether a word belongs to the vocabulary of directions, or is a number. The
 * parser uses this to tell a wrapped tail of directions from other text.
 */
export function isDirectionWord(token: string): boolean {
  const word = core(token);
  return word.length > 0 && (NUMERIC.test(word) || isKnownSigWord(word));
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

/**
 * The start or end of a vocabulary word, without being a word itself: `eve`
 * of `every`, `ery` of `every`, `mor` of `morning`.
 *
 * This is how a label curving away from the lens, or a finger over its edge,
 * damages text — the word is cut rather than misread, so it is too far from
 * the original for a one-character near miss to catch. Ends need three
 * letters to count, since two-letter endings are shared by too many words.
 */
function isTruncatedSigWord(word: string): boolean {
  if (word.length < 2 || !/^[a-z]+$/.test(word)) return false;
  for (const known of SIG_VOCABULARY) {
    if (known.length < 4 || known.length <= word.length) continue;
    if (known.startsWith(word)) return true;
    if (word.length >= 3 && known.endsWith(word)) return true;
  }
  return false;
}

/** A number, a range, or a quantity in words — what a unit needs in front of it. */
function isQuantity(token: string): boolean {
  if (/[½¼¾⅓⅔]/.test(token)) return true;
  const word = core(token);
  // A bare zero is a digit lost, never an amount to take.
  if (word === '0') return false;
  return (/^\d/.test(word) && !hasLeadingZero(word)) || SPELLED_QUANTITIES.has(word);
}

/**
 * `000`, `05` — a number with digits missing from its front. What is left of
 * `50,000` when the `50,` is lost. `0.5` is a real quantity and is not this.
 */
function hasLeadingZero(word: string): boolean {
  return /^0\d/.test(word);
}

function tokenDamage(token: string, kind: FieldKind): DamageKind | null {
  const word = core(token);
  if (word.length === 0) return null;

  // Checked on the raw token, before case-folding hides the evidence.
  if (hasImpossibleCase(token)) return 'impossible-case';

  if (kind !== 'instructions') return null;

  if (hasLeadingZero(word) || word === '0') return 'missing-number';

  if (NUMERIC.test(word) || isKnownSigWord(word)) return null;

  // A digit with one stray letter: `1O` for `10`, `4A` for `4`. Units that
  // are one letter are already numeric above.
  if (/^\d+[a-z]$/.test(word)) return 'not-a-word';

  const fused = NUMBER_FUSED_TO_WORD.exec(word);
  if (fused && isKnownSigWord(fused[2])) return 'merged-words';

  if (isMergedSigWords(word)) return 'merged-words';
  if (isNearMissSigWord(word)) return 'near-miss';
  if (isTruncatedSigWord(word)) return 'truncated';
  if (isNotAWord(word)) return 'not-a-word';

  // Unknown but well-formed — "hypertension", say. Not evidence of damage:
  // indications and drug-specific advice legitimately fall outside the set.
  return null;
}

/**
 * Damage visible only in how the words of a direction relate to each other.
 *
 * Takes the direction's words in order and returns the positions that are
 * wrong. Each check here is a rule a dispensed direction always follows, so a
 * break in it is evidence of damage rather than of an unusual prescription.
 */
function structuralDamage(tokens: readonly string[]): { position: number; damage: DamageKind }[] {
  const words = tokens.map(core);
  const found: { position: number; damage: DamageKind }[] = [];

  words.forEach((word, position) => {
    const previous = position > 0 ? words[position - 1] : undefined;

    // A single letter is a character that survived when the rest of its word
    // did not: the `b` of `(b units)` is what the engine made of `50,000`.
    // Vitamin letters are the exception that appears in directions.
    if (/^[a-z]$/.test(word) && !LONE_LETTERS.has(word) && previous !== 'vitamin') {
      found.push({ position, damage: 'not-a-word' });
    }

    // A unit, or a count of times, needs its number: "up to times daily" is
    // "up to 3 times daily" with the ceiling gone.
    if (
      (DOSE_UNITS.has(word) || word === 'times') &&
      !(position > 0 && isQuantity(tokens[position - 1]))
    ) {
      found.push({ position, damage: 'missing-number' });
    }

    // "every days" and "for days" are "every N days" and "for N days" with the
    // N lost; "every a hours" is the N misread as a letter. Both words are
    // marked, because the gap between them is where the damage is.
    const next = words[position + 1] ?? '';
    const lostBefore = PLURAL_INTERVALS.has(next) || (next === 'times' && word.length === 1);
    if ((word === 'every' || word === 'for' || LONE_LETTERS.has(word)) && lostBefore) {
      found.push({ position, damage: 'missing-number' });
      found.push({ position: position + 1, damage: 'missing-number' });
    }
  });

  // Judged on the last word that has any letters or digits, so a trailing
  // stray full stop does not hide a dangling `every`.
  const last = words.map((word) => word.length > 0).lastIndexOf(true);
  if (last >= 0 && DANGLING.has(words[last]) && !(words[last] === 'a' && words[last - 1] === 'vitamin')) {
    found.push({ position: last, damage: 'clipped' });
  }

  // A direction that opens with a verb of administration and never says when:
  // the frequency was on a line that did not make it. Marked at the end,
  // where the missing part would have been.
  const opens = OPENING_VERBS.has(words.find((word) => word.length > 0) ?? '');
  const timed = words.some(
    (word) => TIMING.has(word) || INTERVAL_SHORTHAND.test(word) || /^\d+(am|pm|h|hr|hrs)$/.test(word)
  );
  if (last >= 0 && opens && !timed) {
    found.push({ position: last, damage: 'incomplete' });
  }

  return found;
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

    // A digit between letters inside a name word is an O or an I misread:
    // `CALCIFER0L`. Digits at a word's edge are real — `D2`, `B12`.
    if (!damage && kind === 'name' && /[a-z]\d+[a-z]/i.test(piece)) damage = 'not-a-word';

    if (damage) reasons.add(damage);
    return { text: piece, damaged: damage !== null };
  });

  if (kind === 'instructions') {
    const wordSpans = spans.flatMap((span, index) => (/\S/.test(span.text) ? [index] : []));
    for (const { position, damage } of structuralDamage(wordSpans.map((index) => spans[index].text))) {
      reasons.add(damage);
      const index = wordSpans[position];
      spans[index] = { ...spans[index], damaged: true };
    }
  }

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
  // a strength the app should present as one — and neither is a number that
  // has lost its front, like the `000 UNIT` left of `50,000 UNIT`.
  if (kind === 'dosage' && !WELL_FORMED_STRENGTH.test(trimmed)) {
    reasons.add(hasLeadingZero(trimmed) ? 'missing-number' : 'not-a-word');
  }

  return {
    level: reasons.size > 0 ? 'damaged' : 'readable',
    reasons: [...reasons],
    spans,
  };
}

const STRENGTH_NUMBER = String.raw`(?:0(?=\.\d)|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d+)?`;
/** A strength's numbers: one, or a slash-separated combination — `5/325`. */
const STRENGTH_NUMBERS = String.raw`${STRENGTH_NUMBER}(?:\/${STRENGTH_NUMBER})*`;
const STRENGTH_UNIT = String.raw`(?:MG|MCG|G|ML|UNITS?|IU|MEQ|%)`;
/** Per volume or per hour: `/ML`, `/5 ML`, `/HR`. */
const STRENGTH_PER = String.raw`(?:\s*\/\s*(?:\d+(?:\.\d+)?\s*)?(?:ML|HR))?`;

/**
 * A strength as the parser formats one: `300 MG`, `0.5 MG`, `50,000 UNIT`,
 * a concentration — `100 UNITS/ML`, `400 MG/5 ML` — optionally restated in
 * brackets: `1.25 MG (50,000 UNIT)`. Thousands are grouped in threes, and
 * nothing but a decimal below one starts with a zero, in both halves.
 */
const WELL_FORMED_STRENGTH = new RegExp(
  String.raw`^${STRENGTH_NUMBERS}\s*${STRENGTH_UNIT}${STRENGTH_PER}(?:\s*\(${STRENGTH_NUMBER}\s*${STRENGTH_UNIT}\))?$`,
  'i'
);

/**
 * Terms whose standard spelling mixes case: units (`5 mL`, `10 mEq`) and the
 * salts printed after a drug name (`Metformin HCl`). Read as words, each has a
 * capital after a lower-case letter.
 */
const MIXED_CASE_UNITS = new Set(['mL', 'mEq', 'dL', 'mcL', 'HCl', 'HBr', 'KCl', 'NaCl']);

/**
 * A token whose capitalisation is impossible for a real word — neither all
 * lower, all upper, nor capitalised. `FOoD` and `aTY` are the engine confusing
 * letterforms, and a page with many of them was read badly.
 *
 * Lives here rather than in the parser, which also uses it, so that the
 * parser can depend on this module without the two depending on each other.
 */
export function hasImpossibleCase(token: string): boolean {
  /**
   * Judged per part, split on hyphens, slashes and commas. Stripping the
   * punctuation and judging the whole token would read `L-Thyroxine` as
   * `LThyroxine` — a capital in the middle of a word — and flag a correctly
   * printed drug name as garbled. Hyphenated prefixes (`L-`, `D-`, `Co-`) are
   * common on labels, and so are lists without a space: `Calciferol,Drisdol`.
   */
  return token.split(/[-/,]/).some((part) => {
    const letters = part.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2 || MIXED_CASE_UNITS.has(letters)) return false;
    return !(
      letters === letters.toLowerCase() ||
      letters === letters.toUpperCase() ||
      letters === letters[0].toUpperCase() + letters.slice(1).toLowerCase()
    );
  });
}

// --- The edge of a curved label --------------------------------------------

/**
 * Words a direction follows with a number, so a line ending on one continues
 * with that number on the next — or lost it. `every` / `7 days`, `for` /
 * `10 days`, `take` / `1 tablet`, `up to` / `3 times`.
 */
const NEEDS_NUMBER_NEXT = new Set(['every', 'for', 'take']);

/**
 * Whether a line of a label ends cut off, judged from its own text and, for
 * a word that needs a number, the first word of the line after it.
 *
 * The evidence a label curving out of sight leaves at the edge where it turns:
 * a thousands group short of digits (`(50,0`), a stray letter (the `b` of
 * `(b`), the start of a word without its end (`eve`), or a word that needs a
 * number whose number never arrives (`every` above `days`).
 *
 * Deliberately not evidence: a trailing comma (`1.25MG(50,` wraps legitimately
 * onto `000 UNIT)`), an unclosed bracket (a phrase in brackets can wrap), or a
 * word that is merely unknown. Used by `truncation`, which also requires the
 * line to end where others do; on its own this says nothing about a curve.
 */
export function endsCutOff(text: string, next?: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (!last) return false;

  if (/\d,\d{1,2}\)?$/.test(last)) return true;

  const word = core(last);
  if (word.length === 0) return false;
  if (/^[a-z]$/.test(word) && !LONE_LETTERS.has(word)) return true;
  if (!isKnownSigWord(word) && startsKnownWord(word)) return true;

  const needsNumber =
    NEEDS_NUMBER_NEXT.has(word) || (word === 'to' && core(tokens[tokens.length - 2] ?? '') === 'up');
  if (needsNumber) {
    const following = next?.split(/\s+/).find((token) => core(token).length > 0);
    return !(following && isQuantity(following));
  }
  return false;
}

/**
 * The same judgement for the start of a line, for a label cut at its left
 * edge: the end of a word without its start (`nits)` for `units)`), or a stray
 * letter. Numbers are not judged here: `000 UNIT)` legitimately continues
 * `(50,` from the line before.
 */
export function startsCutOff(text: string): boolean {
  const first = text.split(/\s+/).find((token) => core(token).length > 0);
  if (!first) return false;
  const word = core(first);
  if (/^[a-z]$/.test(word) && !LONE_LETTERS.has(word)) return true;
  return !isKnownSigWord(word) && endsKnownWord(word);
}

function startsKnownWord(word: string): boolean {
  if (word.length < 2 || !/^[a-z]+$/.test(word)) return false;
  for (const known of SIG_VOCABULARY) {
    if (known.length >= 4 && known.length > word.length && known.startsWith(word)) return true;
  }
  return false;
}

function endsKnownWord(word: string): boolean {
  if (word.length < 3 || !/^[a-z]+$/.test(word)) return false;
  for (const known of SIG_VOCABULARY) {
    if (known.length >= 4 && known.length > word.length && known.endsWith(word)) return true;
  }
  return false;
}

/**
 * Whether a token is a word dispensed directions use — for telling a line of
 * label text from a line naming a person, a street or a pharmacy. See
 * `log-redaction`.
 */
export function isSigWord(token: string): boolean {
  const word = core(token);
  return word.length > 0 && isKnownSigWord(word);
}

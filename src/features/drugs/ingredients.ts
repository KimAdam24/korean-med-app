import { koreanIngredientNames } from './korean-names.ts';

/**
 * The ingredient lexicon: English names from RxNorm, Korean names to come.
 *
 * Two jobs, which is why they share a table.
 *
 * The first is §3.2: showing a Korean reader the Korean name of what they are
 * taking. That mapping is data, not logic, and it is **not filled in here** —
 * see the note on `ko` below.
 *
 * The second is catching bad reads. An OCR engine that turns `Thyroxine` into
 * `Thyeoxine` produces a word that is shaped exactly like a drug name, which is
 * why no amount of pattern-matching over the text alone can flag it. Comparing
 * against a list of names that actually exist can: a token one character away
 * from a real ingredient is far likelier to be that ingredient misread than a
 * different drug nobody has heard of.
 */

/**
 * `en` is spelled as RxNorm spells it, because that is what the `rxcui`
 * lookups return and matching has to be able to round-trip.
 */
export type IngredientEntry = {
  readonly en: string;
  /**
   * Other spellings printed on real packaging for the same ingredient —
   * `thyroxine` and `l-thyroxine` are both on the label RxNorm calls
   * `levothyroxine`. Used for matching only; never displayed.
   */
  readonly aliases?: readonly string[];
  /**
   * Korean ingredient name: **never set here.**
   *
   * These are not translations to be derived — 식약처 publishes the Korean
   * name for each ingredient, and that list is the only acceptable source.
   * Writing plausible Hangul here would produce a name that looks
   * authoritative to a reader who cannot check it, which is precisely the
   * failure this app must not have. The names are imported from 식약처's own
   * data into `mfds-names.ts` (by `scripts/import-mfds-names.ts`), and
   * `koreanNameFor` reads them from there. A test fails if this field is
   * ever filled in.
   */
  readonly ko?: never;
};

/**
 * Common US ingredients, for spotting misreads.
 *
 * Nowhere near complete, and does not need to be: an unrecognised name is
 * simply not checked, so coverage bounds how much this *catches*, never how
 * much it *breaks*. Chosen for prescribing frequency, and deliberately free of
 * anything within an edit or two of an ordinary English word, which would make
 * label text look like a misread drug.
 *
 * Every `en` value is an RxNorm ingredient name; every alias is a spelling that
 * appears on packaging. Both are facts, checkable against RxNorm, and neither
 * is a translation.
 */
export const INGREDIENTS: readonly IngredientEntry[] = [
  { en: 'levothyroxine', aliases: ['thyroxine', 'l-thyroxine', 'levothyroxine sodium'] },
  { en: 'amoxicillin' },
  { en: 'metformin' },
  { en: 'lisinopril' },
  { en: 'atorvastatin' },
  { en: 'amlodipine' },
  { en: 'omeprazole' },
  { en: 'gabapentin' },
  { en: 'sertraline' },
  { en: 'losartan' },
  { en: 'simvastatin' },
  { en: 'metoprolol' },
  { en: 'prednisone' },
  { en: 'warfarin' },
  { en: 'furosemide' },
  { en: 'tramadol' },
  { en: 'hydrochlorothiazide' },
  { en: 'atenolol' },
  { en: 'albuterol', aliases: ['salbutamol'] },
  { en: 'clopidogrel' },
  { en: 'montelukast' },
  { en: 'pantoprazole' },
  { en: 'rosuvastatin' },
  { en: 'escitalopram' },
  { en: 'duloxetine' },
  { en: 'bupropion' },
  { en: 'trazodone' },
  { en: 'citalopram' },
  { en: 'ibuprofen' },
  { en: 'acetaminophen', aliases: ['paracetamol'] },
  { en: 'aspirin' },
  { en: 'insulin glargine' },
  { en: 'rivaroxaban' },
  { en: 'apixaban' },
  { en: 'tamsulosin' },
];

/**
 * Words that describe the package rather than the medicine. Stripped before
 * matching so `Thyroxine Tabs` compares as `thyroxine`.
 */
const DOSE_FORM_WORDS =
  /\b(tabs?|tablets?|caps?|capsules?|sodium|hcl|hydrochloride|er|xr|sr|oral|solution|suspension|injection|cream|ointment|drops?)\b/gi;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(DOSE_FORM_WORDS, ' ')
    // Hyphens survive this pass because they are part of real names —
    // `l-thyroxine` is one word, not two.
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // But a hyphen at either *end* is not part of a name. It is the engine
    // clipping a character, which is exactly the case worth matching through:
    // `-Thyroxine` has to reach `thyroxine` or the clipped read goes
    // unrecognised precisely when recognising it matters most.
    .replace(/^-+|-+$/g, '')
    .trim();
}

/** Every spelling that identifies an entry, normalised. */
function spellingsOf(entry: IngredientEntry): string[] {
  return [entry.en, ...(entry.aliases ?? [])].map(normalise);
}

/**
 * Levenshtein distance, bounded.
 *
 * Bounded because the answer is only interesting when it is small: anything
 * past `limit` is "a different word" and the exact figure does not matter.
 * Returning early also keeps a scan over the whole lexicon cheap.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowBest = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
      rowBest = Math.min(rowBest, current[j]);
    }

    // No cell in this row is within the limit, so no later row can be either.
    if (rowBest > limit) return limit + 1;
    previous = current;
  }

  return previous[b.length];
}

/** The entry `text` names exactly, by primary name or alias. */
export function findIngredient(text: string): IngredientEntry | null {
  const needle = normalise(text);
  if (needle.length === 0) return null;

  return (
    INGREDIENTS.find((entry) => spellingsOf(entry).some((spelling) => spelling === needle)) ?? null
  );
}

export type NearMiss = {
  readonly entry: IngredientEntry;
  readonly spelling: string;
  readonly distance: number;
};

/**
 * The closest ingredient to `text` within `maxDistance`, when it is not an
 * exact match.
 *
 * Returns null for an exact match, because that is a hit rather than a miss,
 * and null when nothing is close, because an unknown name is *not evidence of
 * anything* — the lexicon is partial, and most real drugs are missing from it.
 * Only the near miss is informative, which is what keeps this from flagging
 * every drug it has not heard of.
 */
export function nearestIngredient(text: string, maxDistance = 1): NearMiss | null {
  const needle = normalise(text);
  // Short tokens are too easy to land near something by accident.
  if (needle.length < 6) return null;
  if (findIngredient(needle)) return null;

  let best: NearMiss | null = null;

  for (const entry of INGREDIENTS) {
    for (const spelling of spellingsOf(entry)) {
      const distance = editDistance(needle, spelling, maxDistance);
      if (distance <= maxDistance && (best === null || distance < best.distance)) {
        best = { entry, spelling, distance };
      }
    }
  }

  return best;
}

/**
 * The Korean name for an ingredient, or null when 식약처's imported names
 * (`mfds-names.ts`) have none for it: the honest answer, and until the first
 * import, the only one. Callers show the English name in that case, which
 * §3.2 specifies.
 */
export function koreanNameFor(text: string): string | null {
  const entry = findIngredient(text);
  return entry ? (koreanIngredientNames([entry.en])?.[0] ?? null) : null;
}

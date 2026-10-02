/**
 * Identifying a medicine from the name printed on its label, as far as RxNorm
 * can say: its ingredient (or, for a combination, its ingredients).
 *
 * A photograph gives the words on the label, not a product. The words are
 * enough to say which medicine, not which product: "VITAMIN D2 1.25MG" matched
 * against RxNorm with its strength came back as the 1.25 MG oral **tablet**,
 * where the vial holds capsules. So the match stops at the ingredient, which
 * is what "what it is approved to treat" is about, and the strength and
 * directions stay as read, beside it.
 *
 * ## Refusing rather than guessing
 *
 * A wrong match would put another medicine's uses under this one's name, so:
 *
 * - The caller asks only with a name that reads whole: never one withheld as
 *   cut off at the label's edge ("VITAMIN D" of "VITAMIN D2"), or as damaged.
 * - RxNorm's approximate match is taken only at its best rank, and only where
 *   the name it matched is, forms and strengths aside, exactly the words
 *   given: none changed and none added. The salt counts, since it can be the
 *   medicine ("POTASSIUM CHLORIDE"); one that only carries it ("METOPROLOL
 *   SUCCINATE") is left out of both on a second try. A misread ("Thyeoxine") or a
 *   typo matches nothing; a word RxNorm would have to guess at is not guessed;
 *   one word of a longer name ("ACID") is not that name. This holds as much
 *   for a name the user typed as for one read from the label.
 * - Every best-ranked match must come to the same ingredients. If they differ,
 *   the name is ambiguous, and nothing is identified.
 *
 * What is identified is shown, with RxNorm as its source, so it can be checked
 * against the bottle.
 *
 * ## What this sends
 *
 * The name as read, to RxNav (NLM), over HTTPS, with nothing else: no
 * identifier, no list, no photo. `privacy.lookup` says so to the user.
 */

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const REQUEST_TIMEOUT_MS = 8000;

export type NameMatch = {
  /**
   * The RxNorm concept to look labels up by: the ingredient, or for a
   * combination the multiple-ingredient concept.
   */
  readonly rxcui: string;
  /** RxNorm's names for its ingredients, e.g. `['ergocalciferol']`. */
  readonly ingredients: readonly string[];
  /** RxNorm's name for what the printed name matched, e.g. "vitamin D2". */
  readonly matched: string;
};

export type NameIdentification =
  | { readonly status: 'identified'; readonly match: NameMatch }
  /** Nothing matched, or not certainly enough to say. */
  | { readonly status: 'unidentified' }
  /** RxNav could not be reached: trying again may work. */
  | { readonly status: 'unavailable' };

/**
 * Words that say what form a medicine comes in, how it is released, or how
 * much: never which medicine it is. They are left out of the words that must
 * match.
 */
const NOT_THE_MEDICINE = new Set([
  'er', 'xr', 'xl', 'sr', 'dr', 'cr', 'la', 'cd', 'ec', 'ir', 'odt', 'tab', 'tabs', 'tablet', 'tablets', 'cap',
  'caps', 'capsule', 'capsules', 'oral', 'solution', 'susp', 'suspension', 'mg', 'mcg', 'g', 'ml', 'unit',
  'units', 'iu', 'meq', 'usp',
  // What joins a combination's names ("LISINOPRIL AND HYDROCHLOROTHIAZIDE"),
  // where RxNorm writes "hydrochlorothiazide / lisinopril".
  'and', 'with',
]);

/**
 * A salt as pharmacy labels shorten it ("AMLODIPINE BESY", "METFORMIN HCL"),
 * and as RxNorm spells it. Only abbreviations that stand for nothing else.
 */
const SPELLED_OUT: Readonly<Record<string, string>> = {
  hcl: 'hydrochloride',
  hbr: 'hydrobromide',
  sod: 'sodium',
  pot: 'potassium',
  calc: 'calcium',
  mag: 'magnesium',
  besy: 'besylate',
  besyl: 'besylate',
  succ: 'succinate',
  tart: 'tartrate',
  prop: 'propionate',
};

/**
 * Salts that only carry a medicine, never being one: "METOPROLOL SUCCINATE" is
 * metoprolol. Left out on a second try, where RxNorm has no name with the
 * salt. Not the metals (sodium, potassium, calcium, magnesium, zinc), nor the
 * salts that are medicines with them (chloride, acetate, citrate, gluconate,
 * sulfate, phosphate, carbonate): "POTASSIUM CHLORIDE" and "CALCIUM ACETATE"
 * are medicines, and "chloride" or "acetate" alone would be another.
 */
const CARRIER_SALTS = new Set([
  'hydrochloride', 'dihydrochloride', 'hydrobromide', 'besylate', 'maleate', 'succinate', 'tartrate', 'bitartrate',
  'mesylate', 'fumarate', 'bisulfate', 'hyclate', 'monohydrate', 'dihydrate', 'trihydrate', 'anhydrous',
]);

/**
 * A name's words, lower case. A single letter and the short number after it
 * are one word, however printed or read: "D2", "D-2" and "D 2" are all "d2",
 * and RxNorm's "vitamin B 12" is "b12". Without that, "VITAMIN D-2" lost its
 * "2" as a bare number and was identified as plain vitamin D. A long number is
 * not joined: "D 50000" is a strength.
 */
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .reduce<string[]>((joined, word) => {
      const previous = joined[joined.length - 1];
      if (previous && /^[a-z]$/.test(previous) && /^\d{1,2}$/.test(word)) joined[joined.length - 1] = previous + word;
      else joined.push(word);
      return joined;
    }, []);

/**
 * The words of a printed name that say which medicine it is, its salt
 * included and spelled out: without forms, release, units and bare numbers.
 * "D2" and "B12" are kept; "10MG" and "ER" are not; "HCL" is "hydrochloride".
 */
export function medicineWords(name: string): string[] {
  return words(name)
    .filter((word) => !NOT_THE_MEDICINE.has(word) && !/^\d+(?:mg|mcg|g|ml|units?|iu|meq)?$/.test(word))
    .map((word) => SPELLED_OUT[word] ?? word);
}

/** The same, without the salts that only carry the medicine (`CARRIER_SALTS`). */
const withoutCarrier = (medicine: readonly string[]) => medicine.filter((word) => !CARRIER_SALTS.has(word));

type Fetched<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

async function getJson<T>(url: string): Promise<Fetched<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { ok: false };
    return { ok: true, value: (await response.json()) as T };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

type Approximate = {
  approximateGroup?: { candidate?: { rxcui?: string; name?: string; rank?: string; source?: string }[] };
};
type Related = {
  relatedGroup?: { conceptGroup?: { tty?: string; conceptProperties?: { rxcui?: string; name?: string }[] }[] };
};

/** Identifies the medicine a printed name names. Never throws. */
export async function identifyByName(name: string): Promise<NameIdentification> {
  const printed = medicineWords(name);
  if (printed.length === 0) return { status: 'unidentified' };

  // First as printed, salt and all: where the salt is the medicine
  // ("POTASSIUM CHLORIDE", "CALCIUM ACETATE"), the name without it is another
  // medicine's, or none. "CALCIUM GLUCONATE" used to be asked as "gluconate".
  const asPrinted = await identifyWords(printed, (words) => words);
  if (asPrinted.status !== 'unidentified') return asPrinted;

  // Then without a salt that only carries the medicine, for a name RxNorm does
  // not give with it: compared without it on both sides, so still exact.
  const bare = withoutCarrier(printed);
  if (bare.length === 0 || bare.length === printed.length) return asPrinted;
  return identifyWords(bare, withoutCarrier);
}

/**
 * Identifies the medicine named by exactly these words, compared with each
 * candidate's own words as `comparable` leaves them.
 */
async function identifyWords(
  given: readonly string[],
  comparable: (words: readonly string[]) => readonly string[]
): Promise<NameIdentification> {
  // Asked with only the words that name the medicine: its strength or form
  // would steer the match to products ("... 500 MG Extended Release Oral
  // Tablet"), some of them combinations, and it is the ingredient that is
  // wanted.
  const found = await getJson<Approximate>(
    `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(given.join(' '))}&maxEntries=8&option=1`
  );
  if (!found.ok) return { status: 'unavailable' };

  // The best rank, from whichever source names it: RxNorm's own row is not
  // always among them ("Conjugated Estrogens" is USP's and ATC's name for
  // RxNorm's concept), and the words must match exactly either way.
  const best = (found.value.approximateGroup?.candidate ?? []).filter(
    (candidate) => candidate.rank === '1' && candidate.rxcui && candidate.name
  );
  // What it matched must name the medicine in exactly the words given, forms
  // and strengths aside: no word changed (a match that had to change one is a
  // guess about it, so a typo identifies nothing), and none added (a lone
  // "ACID" is not "ascorbic acid"). RxNorm's search is approximate; this is
  // what makes the answer exact. Not to be loosened for a typed name either:
  // a misspelling must fail safe, never land on some other medicine.
  const wanted = new Set(given);
  const whole = best.filter((candidate) => {
    const named = new Set(comparable(medicineWords(candidate.name!)));
    return named.size === wanted.size && [...wanted].every((word) => named.has(word));
  });
  if (whole.length === 0) return { status: 'unidentified' };

  const matches: NameMatch[] = [];
  for (const candidate of [...new Map(whole.map((c) => [c.rxcui!, c])).values()].slice(0, 3)) {
    const related = await getJson<Related>(
      `${RXNAV_BASE}/rxcui/${encodeURIComponent(candidate.rxcui!)}/related.json?tty=IN+MIN`
    );
    if (!related.ok) return { status: 'unavailable' };
    const groups = related.value.relatedGroup?.conceptGroup ?? [];
    const concepts = (tty: string) =>
      (groups.find((group) => group.tty === tty)?.conceptProperties ?? []).filter(
        (concept) => concept.rxcui && concept.name
      );
    const ingredients = concepts('IN');
    if (ingredients.length === 0) return { status: 'unidentified' };

    // One ingredient: that ingredient. Several: the combination they make,
    // which RxNorm lists as the one multiple-ingredient concept.
    const combination = concepts('MIN');
    const rxcui = ingredients.length === 1 ? ingredients[0].rxcui! : combination.length === 1 ? combination[0].rxcui! : null;
    if (!rxcui) return { status: 'unidentified' };

    matches.push({ rxcui, ingredients: ingredients.map((concept) => concept.name!), matched: candidate.name! });
  }

  const [first] = matches;
  return matches.every((match) => match.rxcui === first.rxcui)
    ? { status: 'identified', match: first }
    : { status: 'unidentified' };
}

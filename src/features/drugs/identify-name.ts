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
 *   the name it matched is, salts, forms and strengths aside, exactly the
 *   words given: none changed and none added. A misread ("Thyeoxine") or a
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
 * Words that say what form or salt a medicine comes in, not which medicine it
 * is: they are left out of the words that must match.
 */
const NOT_THE_MEDICINE = new Set([
  'hcl', 'hydrochloride', 'hbr', 'hydrobromide', 'sodium', 'sod', 'na', 'potassium', 'pot', 'calcium', 'ca',
  'magnesium', 'besylate', 'maleate', 'succinate', 'tartrate', 'bitartrate', 'mesylate', 'fumarate', 'sulfate',
  'phosphate', 'acetate', 'citrate', 'er', 'xr', 'xl', 'sr', 'dr', 'cr', 'la', 'ec', 'odt', 'tab', 'tabs',
  'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'oral', 'solution', 'susp', 'suspension', 'mg',
  'mcg', 'g', 'ml', 'unit', 'units', 'iu', 'meq', 'usp',
  // What joins a combination's names ("LISINOPRIL AND HYDROCHLOROTHIAZIDE"),
  // where RxNorm writes "hydrochlorothiazide / lisinopril".
  'and', 'with',
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
 * The words of a printed name that say which medicine it is: without salts,
 * forms, units and bare numbers. "D2" and "B12" are kept; "10MG" is not.
 */
export function medicineWords(name: string): string[] {
  return words(name).filter(
    (word) => !NOT_THE_MEDICINE.has(word) && !/^\d+(?:mg|mcg|g|ml|units?|iu)?$/.test(word)
  );
}

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

  // Asked with only the words that name the medicine: its strength or form
  // would steer the match to products ("... 500 MG Extended Release Oral
  // Tablet"), some of them combinations, and it is the ingredient that is
  // wanted.
  const found = await getJson<Approximate>(
    `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(printed.join(' '))}&maxEntries=8&option=1`
  );
  if (!found.ok) return { status: 'unavailable' };

  const best = (found.value.approximateGroup?.candidate ?? []).filter(
    (candidate) => candidate.source === 'RXNORM' && candidate.rank === '1' && candidate.rxcui && candidate.name
  );
  // What it matched must name the medicine in exactly the words given, salts
  // and forms aside: no word changed (a match that had to change one is a
  // guess about it, so a typo identifies nothing), and none added (a lone
  // "ACID" is not "ascorbic acid"). RxNorm's search is approximate; this is
  // what makes the answer exact. Not to be loosened for a typed name either:
  // a misspelling must fail safe, never land on some other medicine.
  const given = new Set(printed);
  const whole = best.filter((candidate) => {
    const named = new Set(medicineWords(candidate.name!));
    return named.size === given.size && [...given].every((word) => named.has(word));
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

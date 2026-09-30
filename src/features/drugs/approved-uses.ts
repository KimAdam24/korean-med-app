/**
 * What a medicine's FDA label says it is approved to treat: the label's
 * Indications and Usage section, from DailyMed, verbatim.
 *
 * ## Verbatim, and only from an approved label
 *
 * The text is shown as the label has it, prescriber's English and all, with
 * its source; nothing here shortens, rewords or chooses among its uses. Where
 * the label has a Highlights summary of the section, that is what is shown:
 * the manufacturer's own short form, approved with the rest. Otherwise it is
 * the whole section.
 *
 * The screen says this is the FDA-approved indication, so it is only taken
 * from a label whose marketing category is an FDA approval (NDA, ANDA, BLA, or
 * an authorised generic). A label marketed as an unapproved drug, or under an
 * OTC monograph, has uses too, but they are not approved ones, and saying they
 * were would be false. For those the answer is "none".
 *
 * ## Which label: every one must prove it is this medicine's
 *
 * DailyMed's lookups are loose, so nothing it lists is taken on trust:
 *
 * - Its NDC lookup matches by prefix. "70518-317" returns RemedyRepack's
 *   ibuprofen as readily as the terazosin a barcode meant ("70518-0317-0").
 *   So a barcode is looked up by its full package code, in each printed
 *   shape the 11-digit code could have (`dailyMedPackageCodes`), and a label
 *   is taken only if it lists that product's code itself.
 * - Its list for an RxNorm concept holds labels that are not that medicine at
 *   all: ascorbic acid's lists an omeprazole tablet, potassium chloride's a
 *   lung-cancer drug. So a label found that way is taken only if its active
 *   ingredients are exactly the medicine's, by name (`sameIngredients`), and
 *   of the form the reading names (capsule or tablet) where it names one.
 *
 * A barcode whose package DailyMed does not list (discontinued, say) falls
 * back to its RxNorm product's list, held to the ingredient check like a name.
 * The label chosen is named on screen, so which it was can be seen.
 *
 * This is not the reason the user was prescribed it. A label lists what the
 * medicine is approved for; a doctor may prescribe it for something else, and
 * the screen says so beside it.
 */

import { attribute, type AttributedGuidance } from '../guidance/attribution.ts';
import { Strings } from '../../i18n/strings.ts';
import { DAILYMED_BASE, REQUEST_TIMEOUT_MS, labelMarkupToText, type LabelDocument } from './dailymed.ts';

/** LOINC's code for a label's Indications and Usage section. */
export const INDICATIONS_SECTION = '34067-9';

/** Marketing categories under which the FDA approved the label's indications. */
const APPROVED = /^(NDA|ANDA|BLA|NDA AUTHORIZED GENERIC)$/i;

/** The code system of an NDC in SPL. */
const NDC_SYSTEM = '2.16.840.1.113883.6.69';

/** How many labels are opened before giving up: each is a download. */
const LABELS_TRIED = 4;

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';

/** One active ingredient of a label: its substance, and the moiety it counts as. */
export type ActiveIngredient = { readonly substance: string; readonly moiety: string | null };

/** What one label document says, as far as this needs. */
export type LabelIndications = {
  /** The marketing category of each product on the label, e.g. "ANDA"; '' where unnamed. */
  readonly approvals: readonly string[];
  /** Its active ingredients, one per moiety (or substance, where none is given). */
  readonly actives: readonly ActiveIngredient[];
  /** The products it covers, as 9-digit labeler-and-product codes. */
  readonly products: readonly string[];
  /** The Highlights summary of the Indications section, where it has one. */
  readonly summary: string | null;
  /** The whole Indications section, as text, without its heading. */
  readonly section: string | null;
};

export type ApprovedUses = {
  /** The label's own words. */
  readonly text: string;
  /** Whether `text` is the label's Highlights summary rather than the whole section. */
  readonly summary: boolean;
  /** Which label it came from: shown, so the product it describes can be seen. */
  readonly label: LabelDocument;
};

export type ApprovedUsesLookup =
  | { readonly status: 'found'; readonly uses: AttributedGuidance<ApprovedUses> }
  /** No current FDA-approved label for this medicine, with an Indications section, was found. */
  | { readonly status: 'none' }
  /** DailyMed or RxNav could not be reached, or answered with an error: trying again may work. */
  | { readonly status: 'unavailable' };

export type UsesTarget =
  /** A barcode's product: its 11-digit CMS code, and its RxNorm product. */
  | { readonly kind: 'product'; readonly ndc11: string; readonly rxcui: string }
  /** A name read from a label: its RxNorm ingredient (or a combination's), with the ingredients' names. */
  | {
      readonly kind: 'ingredients';
      readonly rxcui: string;
      readonly ingredients: readonly string[];
      /** The dose form the label's own words give, if they give one. */
      readonly form: DoseForm | null;
    };

export type DoseForm = 'TABLET' | 'CAPSULE';

/**
 * The dose form a reading names, from its strength and directions: "Take 1
 * capsule" names a capsule. Null when it names neither, or both.
 */
export function doseFormOf(...texts: readonly (string | undefined)[]): DoseForm | null {
  const all = texts.filter(Boolean).join(' ');
  const capsule = /\bcap(?:sule)?s?\b/i.test(all);
  const tablet = /\btab(?:let)?s?\b/i.test(all);
  return capsule === tablet ? null : capsule ? 'CAPSULE' : 'TABLET';
}

/**
 * The full package codes an 11-digit CMS code could have been printed as.
 *
 * DailyMed looks an NDC up only as printed, in its original 10-digit shape
 * (4-4-2, 5-3-2 or 5-4-1), and the CMS form hides which that was behind a
 * padding zero: each place the zero could have been padded in gives one
 * shape. Whole package codes, never a labeler-product prefix, which DailyMed
 * would match against other products of the same labeler.
 */
export function dailyMedPackageCodes(ndc11: string): string[] {
  if (!/^\d{11}$/.test(ndc11)) return [];
  const codes: string[] = [];
  if (ndc11[0] === '0') codes.push(`${ndc11.slice(1, 5)}-${ndc11.slice(5, 9)}-${ndc11.slice(9)}`);
  if (ndc11[5] === '0') codes.push(`${ndc11.slice(0, 5)}-${ndc11.slice(6, 9)}-${ndc11.slice(9)}`);
  if (ndc11[9] === '0') codes.push(`${ndc11.slice(0, 5)}-${ndc11.slice(5, 9)}-${ndc11.slice(10)}`);
  return [...new Set(codes)];
}

/** A printed NDC's labeler and product, padded to the 5 and 4 digits of the CMS form. */
export function productKey(ndc: string): string | null {
  const [labeler, product] = ndc.split('-');
  if (!labeler || !product || !/^\d{4,5}$/.test(labeler) || !/^\d{3,4}$/.test(product)) return null;
  return labeler.padStart(5, '0') + product.padStart(4, '0');
}

/**
 * The markup of the section carrying `code`, from its opening tag to the
 * matching close, nested sections included. Null if absent, or if the
 * document is cut off before the section ends: a truncated section is not
 * shown as though it were the whole.
 */
export function sectionMarkup(xml: string, code: string): string | null {
  const at = xml.indexOf(`code="${code}"`);
  if (at === -1) return null;
  const start = xml.lastIndexOf('<section', at);
  if (start === -1) return null;

  const tags = /<section\b[^>]*>|<\/section>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(xml); match; match = tags.exec(xml)) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return xml.slice(start, match.index + match[0].length);
    } else {
      depth += 1;
    }
  }
  return null;
}

/** Reads what this needs from one SPL document. Pure, for tests. */
export function readIndications(xml: string): LabelIndications {
  // Each approval's own code, looked for only inside it: one without a named
  // code counts as unnamed (and so not approved), never as whatever named code
  // comes next in the document.
  const approvals = [...xml.matchAll(/<approval\b[^>]*>([\s\S]*?)<\/approval>/g)].map(
    ([, body]) => /<code\b[^>]*displayName="([^"]+)"/.exec(body)?.[1].trim() ?? ''
  );

  const actives = new Map<string, ActiveIngredient>();
  for (const [, body] of xml.matchAll(/<ingredient\s+classCode="ACTI[BMR]"[^>]*>([\s\S]*?)<\/ingredient>/g)) {
    const substance = /<name>([^<]+)<\/name>/.exec(body)?.[1].trim().toUpperCase();
    if (!substance) continue;
    // The moiety, so a salt ("METFORMIN HYDROCHLORIDE") counts as its drug;
    // an ingredient given as its moiety has no separate one.
    const moiety = /<activeMoiety>\s*<activeMoiety>[\s\S]*?<name>([^<]+)<\/name>/.exec(body)?.[1].trim().toUpperCase() ?? null;
    const key = moiety ?? substance;
    if (!actives.has(key)) actives.set(key, { substance, moiety });
  }

  const products = new Set<string>();
  for (const [tag] of xml.matchAll(/<code\b[^>]*>/g)) {
    if (!tag.includes(`codeSystem="${NDC_SYSTEM}"`)) continue;
    const key = productKey(/\bcode="([^"]+)"/.exec(tag)?.[1] ?? '');
    if (key) products.add(key);
  }

  const section = sectionMarkup(xml, INDICATIONS_SECTION);
  const excerpt = section ? /<excerpt>([\s\S]*?)<\/excerpt>/.exec(section) : null;
  const summary = excerpt ? labelMarkupToText(excerpt[1]) : null;
  // The section without its Highlights and without its own heading ("1
  // INDICATIONS AND USAGE"), which the screen's frame already says.
  const body = section
    ? section.replace(/<excerpt>[\s\S]*?<\/excerpt>/g, '').replace(/<title\b[^>]*>[\s\S]*?<\/title>/, '')
    : null;

  return {
    approvals,
    actives: [...actives.values()],
    products: [...products],
    summary,
    section: body ? labelMarkupToText(body) : null,
  };
}

const nameWords = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Whether a label's active ingredients are exactly these, by name: as many of
 * them, and each named in one of them, as its substance ("METFORMIN
 * HYDROCHLORIDE") or its moiety ("METFORMIN"). A name RxNorm and the label
 * spell differently ("vitamin B 12", "CYANOCOBALAMIN") does not match, and
 * its label is not shown: no answer rather than someone else's.
 */
export function sameIngredients(actives: readonly ActiveIngredient[], ingredients: readonly string[]): boolean {
  if (ingredients.length === 0 || actives.length !== ingredients.length) return false;
  return ingredients.every((ingredient) => {
    const wanted = nameWords(ingredient);
    return actives.some((active) =>
      [active.substance, active.moiety].some((name) => {
        if (!name) return false;
        const has = new Set(nameWords(name));
        return wanted.every((word) => has.has(word));
      })
    );
  });
}

type Fetched<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

async function get<T>(url: string, read: (response: Response) => Promise<T>): Promise<Fetched<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false };
    return { ok: true, value: await read(response) };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

type Listing = { data?: { setid?: string; title?: string; spl_version?: number }[] };

async function labelsAt(query: string): Promise<Fetched<LabelDocument[]>> {
  const listing = await get(`${DAILYMED_BASE}/spls.json?${query}`, (response) => response.json() as Promise<Listing>);
  if (!listing.ok) return listing;
  return {
    ok: true,
    value: (listing.value.data ?? [])
      .filter((entry) => typeof entry.setid === 'string')
      .map((entry) => ({
        setId: entry.setid as string,
        title: entry.title ?? '',
        version: typeof entry.spl_version === 'number' ? entry.spl_version : null,
      })),
  };
}

type Related = { relatedGroup?: { conceptGroup?: { tty?: string; conceptProperties?: { name?: string }[] }[] } };

/** An RxNorm concept's ingredients' names; `unavailable` if RxNav could not say. */
async function ingredientsOf(rxcui: string): Promise<Fetched<string[]>> {
  const related = await get(`${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN`, (response) =>
    response.json() as Promise<Related>
  );
  if (!related.ok) return related;
  return {
    ok: true,
    value: (related.value.relatedGroup?.conceptGroup ?? [])
      .filter((group) => group.tty === 'IN')
      .flatMap((group) => group.conceptProperties ?? [])
      .map((concept) => concept.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  };
}

/** What a label must be, besides approved, to be shown for this lookup. */
type Proof = { readonly kind: 'product'; readonly key: string } | { readonly kind: 'ingredients'; readonly names: readonly string[] };

/**
 * The labels to try, best first, with what each must prove; `unavailable` if
 * DailyMed or RxNav could not say.
 */
async function candidates(target: UsesTarget): Promise<Fetched<{ labels: LabelDocument[]; proof: Proof }>> {
  let names: readonly string[];
  let listed: LabelDocument[];
  let form: DoseForm | null = null;

  if (target.kind === 'product') {
    for (const code of dailyMedPackageCodes(target.ndc11)) {
      const byNdc = await labelsAt(`ndc=${encodeURIComponent(code)}`);
      if (!byNdc.ok) return byNdc;
      if (byNdc.value.length > 0) {
        return { ok: true, value: { labels: byNdc.value, proof: { kind: 'product', key: target.ndc11.slice(0, 9) } } };
      }
    }
    // Not listed by its package: its RxNorm product's labels, which must then
    // prove they are this medicine by their ingredients.
    const ingredients = await ingredientsOf(target.rxcui);
    if (!ingredients.ok) return ingredients;
    const byProduct = await labelsAt(`rxcui=${encodeURIComponent(target.rxcui)}`);
    if (!byProduct.ok) return byProduct;
    names = ingredients.value;
    listed = byProduct.value;
  } else {
    const byIngredient = await labelsAt(`rxcui=${encodeURIComponent(target.rxcui)}&pagesize=100`);
    if (!byIngredient.ok) return byIngredient;
    names = target.ingredients;
    listed = byIngredient.value;
    form = target.form;
  }

  // Titles name the medicine and its form ("GLUMETZA (METFORMIN
  // HYDROCHLORIDE) TABLET [...]"): first the labels whose titles could be
  // this one, of the form read (or else a tablet or capsule, never an
  // injection), so the few downloads go on likely ones. Each is still held to
  // its own ingredient list, below; a title is only a way to choose.
  const formWord = form ? new RegExp(`\\b${form}`, 'i') : /\b(TABLET|CAPSULE)/i;
  const labels = listed.filter((label) => {
    const title = label.title.replace(/\[.*$/, '');
    const words = new Set(nameWords(title));
    return (
      formWord.test(title) &&
      names.every((name) => nameWords(name).every((word) => words.has(word))) &&
      // One ingredient's list also holds its combinations ("PIOGLITAZONE AND
      // METFORMIN ..."), which would only fail the count after a download.
      (names.length > 1 || !words.has('and'))
    );
  });
  return { ok: true, value: { labels, proof: { kind: 'ingredients', names } } };
}

/** What the target's label says it is approved to treat. Never throws. */
export async function findApprovedUses(target: UsesTarget): Promise<ApprovedUsesLookup> {
  const found = await candidates(target);
  if (!found.ok) return { status: 'unavailable' };
  const { labels, proof } = found.value;

  let failed = false;
  for (const label of labels.slice(0, LABELS_TRIED)) {
    const xml = await get(`${DAILYMED_BASE}/spls/${encodeURIComponent(label.setId)}.xml`, (response) =>
      response.text()
    );
    if (!xml.ok) {
      failed = true;
      continue;
    }

    const read = readIndications(xml.value);
    const approved = read.approvals.length > 0 && read.approvals.every((category) => APPROVED.test(category));
    const thisMedicine =
      proof.kind === 'product' ? read.products.includes(proof.key) : sameIngredients(read.actives, proof.names);
    const text = read.summary ?? read.section;
    if (!approved || !thisMedicine || !text) continue;

    return {
      status: 'found',
      uses: attribute(
        { text, summary: read.summary !== null, label },
        {
          source: 'fda-label',
          label: Strings.guidance.perFdaLabel,
          citation: `DailyMed SPL ${label.setId} (${INDICATIONS_SECTION}${read.summary !== null ? ', highlights' : ''})`,
          revision: label.version === null ? undefined : `v${label.version}`,
        }
      ),
    };
  }
  return failed ? { status: 'unavailable' } : { status: 'none' };
}

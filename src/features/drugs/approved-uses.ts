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
 *   of the form the reading names: a tablet, or a capsule.
 *
 * ## By name, only for a tablet or a capsule
 *
 * A name says which medicine, not which of its forms, and the forms' labels
 * are not alike: timolol's tablets are for blood pressure and heart attacks,
 * its eye drops for glaucoma; budesonide's capsules for Crohn's disease, its
 * inhaler for asthma. So a label is found by name only where the reading says
 * the medicine is a tablet or a capsule, and says nothing of drops, inhaling,
 * patches or injections (`doseFormOf`). Anything else, or a reading that does
 * not say, is refused (`formUnknown`), rather than shown a tablet's uses.
 *
 * ## By name, the salt, release and kind printed
 *
 * One ingredient's labels can be different medicines, approved for different
 * things: metoprolol succinate extended-release is approved for heart
 * failure, metoprolol tartrate is not; prescription esomeprazole is for GERD,
 * ulcers and H. pylori, the over-the-counter one for frequent heartburn. So:
 *
 * - **A salt printed is required** of the label's own active ingredient
 *   ("METOPROLOL SUCC" only a label whose active is metoprolol succinate).
 * - **A release printed is required** of the label's title (ER, XL, CD:
 *   extended; DR, EC: delayed). Where none is printed, labels released at
 *   once are tried first, since a pharmacy prints the release when there is
 *   one, but not required, since a label may leave out one that is always so
 *   (omeprazole is always delayed-release).
 * - **The kind of label read decides prescription or over-the-counter**
 *   (`labelKindOf`). A pharmacy's label: a prescription label, or an
 *   over-the-counter one only where there is no prescription one (a pharmacy
 *   can dispense either). Drug Facts: over-the-counter. Neither read: if both
 *   kinds have a label, which applies cannot be told, and none is shown
 *   (`kindUnknown`). DailyMed is asked for each kind separately.
 *
 * Where nothing of the salt and release printed has a label, the answer is
 * "none", not a label of another salt.
 *
 * A barcode whose package DailyMed does not list (discontinued, say) falls
 * back to its RxNorm product's list, held to the ingredient check like a name.
 * Its form, salt and release are the product's, which the RxNorm code already
 * fixes, so none is asked of its labels; its kind is not, and is held to the
 * same rule as a name's that was not read. The label chosen is named on
 * screen, so which it was can be seen.
 *
 * This is not the reason the user was prescribed it. A label lists what the
 * medicine is approved for; a doctor may prescribe it for something else, and
 * the screen says so beside it.
 */

import { attribute, type AttributedGuidance } from '../guidance/attribution.ts';
import { Strings } from '../../i18n/strings.ts';
import type { LabelKind } from '../ocr/label-kind.ts';
import { DAILYMED_BASE, REQUEST_TIMEOUT_MS, labelMarkupToText, type LabelDocument } from './dailymed.ts';
import type { Release } from './identify-name.ts';

/** LOINC's code for a label's Indications and Usage section. */
export const INDICATIONS_SECTION = '34067-9';

/** Marketing categories under which the FDA approved the label's indications. */
const APPROVED = /^(NDA|ANDA|BLA|NDA AUTHORIZED GENERIC)$/i;

/** The code system of an NDC in SPL. */
const NDC_SYSTEM = '2.16.840.1.113883.6.69';

/** DailyMed's document types, by their LOINC codes: a prescription drug's label, an over-the-counter one's. */
const DOCUMENT_TYPES = { prescription: '34391-3', otc: '34390-5' } as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

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
  /** What kind of label the document says it is; null where it says neither. */
  readonly documentType: DocumentType | null;
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
  /**
   * Looked up by name, and the reading does not say it is a tablet or a
   * capsule: its labels are not looked for, since which form's would apply
   * cannot be told. Nothing is asked of DailyMed.
   */
  | { readonly status: 'formUnknown' }
  /**
   * Both a prescription and an over-the-counter label would do, and which this
   * is was not read: they list different uses, so neither is shown.
   */
  | { readonly status: 'kindUnknown' }
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
      /**
       * The dose form the label's own words give (`doseFormOf`). Null when
       * they give none, or not one swallowed: then nothing is looked up.
       */
      readonly form: DoseForm | null;
      /** The salts the name printed beyond its ingredients (`printedSalts`), required of the label. */
      readonly salts?: readonly string[];
      /** The release the name printed (`printedRelease`), required of the label. */
      readonly release?: Release | null;
      /** The kind of label read (`labelKindOf`): prescription or over-the-counter. */
      readonly labelKind?: LabelKind | null;
    };

export type DoseForm = 'TABLET' | 'CAPSULE';

/**
 * Words that say a medicine is not swallowed: put in the eye or ear, inhaled,
 * applied to the skin, injected, sprayed, used vaginally or rectally. Its
 * labels are of another form than a tablet's, with other uses, and a tablet's
 * are not to be shown for it, though its directions say "tablet" too ("INSERT
 * 1 TABLET VAGINALLY"). Not "insert" itself: "SEE PACKAGE INSERT" is printed
 * on tablets too.
 */
const NOT_SWALLOWED =
  /\b(?:drops?|eyes?|ears?|instill\w*|ophthalmic|otic|inhal\w*|puffs?|nebuli[sz]\w*|patch(?:es)?|transdermal|apply|applied|topical\w*|rub|creams?|ointments?|gels?|lotions?|shampoo|inject\w*|subcutaneous\w*|intramuscular\w*|pens?|sprays?|nasal\w*|nostrils?|vaginal\w*|rectal\w*|suppositor\w*|enema)\b/i;

/**
 * The dose form a reading names, from its name, strength and directions:
 * "Take 1 capsule" names a capsule, and a softgel is one too. Null when it
 * names neither, or both, or says the medicine is not swallowed: a name is
 * then not enough to choose a label by.
 */
export function doseFormOf(...texts: readonly (string | undefined)[]): DoseForm | null {
  const all = texts.filter(Boolean).join(' ');
  if (NOT_SWALLOWED.test(all)) return null;
  const capsule = /\b(?:cap(?:sule)?s?|softgels?)\b/i.test(all);
  const tablet = /\b(?:tab(?:let)?s?|caplets?)\b/i.test(all);
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

  // The document's own code, its first: "HUMAN PRESCRIPTION DRUG LABEL" or
  // "HUMAN OTC DRUG LABEL".
  const type = /<document\b[^>]*>[\s\S]*?<code\b[^>]*\bcode="([^"]+)"/.exec(xml)?.[1];
  const documentType =
    type === DOCUMENT_TYPES.prescription ? 'prescription' : type === DOCUMENT_TYPES.otc ? 'otc' : null;

  return {
    approvals,
    actives: [...actives.values()],
    products: [...products],
    summary,
    section: body ? labelMarkupToText(body) : null,
    documentType,
  };
}

/**
 * A name's words, lower case. Without "USP", which RxNorm adds to some names
 * ("estrogens, conjugated (USP)") and labels do not: with it, PREMARIN's own
 * label was not its ingredient's.
 */
const nameWords = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && word !== 'usp');

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
type Proof =
  | { readonly kind: 'product'; readonly key: string }
  | { readonly kind: 'ingredients'; readonly names: readonly string[]; readonly salts: readonly string[] };

type Outcome = Extract<ApprovedUsesLookup, { status: 'found' | 'none' | 'unavailable' }>;

/** The release a label's title names ("TABLET, FILM COATED, EXTENDED RELEASE"). */
const releaseOf = (title: string): Release | null =>
  /\bEXTENDED[- ]RELEASE\b/i.test(title) ? 'extended' : /\bDELAYED[- ]RELEASE\b/i.test(title) ? 'delayed' : null;

/**
 * Of the labels DailyMed lists for an RxNorm concept, those whose titles could
 * be this medicine's, best first. Titles name the medicine and its form
 * ("GLUMETZA (METFORMIN HYDROCHLORIDE) TABLET [...]"), so the few downloads
 * go on likely ones; each is still held to its own ingredient list after. A
 * title is only a way to choose, except for the release, which only the
 * title says.
 */
function likely(
  listed: readonly LabelDocument[],
  names: readonly string[],
  want: { form: DoseForm | null; salts: readonly string[]; release: Release | null; preferAtOnce: boolean }
): LabelDocument[] {
  const formWord = want.form ? new RegExp(`\\b${want.form}`, 'i') : null;
  const scored = listed.flatMap((label, index) => {
    const title = label.title.replace(/\[.*$/, '');
    const words = new Set(nameWords(title));
    const fits =
      (formWord === null || formWord.test(title)) &&
      names.every((name) => nameWords(name).every((word) => words.has(word))) &&
      // One ingredient's list also holds its combinations ("PIOGLITAZONE AND
      // METFORMIN ..."), which would only fail the count after a download.
      (names.length > 1 || !words.has('and')) &&
      (want.release === null || releaseOf(title) === want.release);
    if (!fits) return [];
    // First the titles that name the salt printed; then, where no release was
    // printed, those released at once.
    const score =
      (want.salts.every((salt) => words.has(salt)) ? 2 : 0) +
      (want.preferAtOnce && want.release === null && releaseOf(title) === null ? 1 : 0);
    return [{ label, index, score }];
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ label }) => label);
}

/** The first of these labels that proves it is this medicine's, of this kind; or why none did. */
async function firstProven(
  labels: readonly LabelDocument[],
  proof: Proof,
  type: DocumentType | null
): Promise<Outcome> {
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
      proof.kind === 'product'
        ? read.products.includes(proof.key)
        : sameIngredients(read.actives, proof.names) &&
          // The salt printed, in the label's own active ingredient.
          proof.salts.every((salt) => read.actives.some((active) => nameWords(active.substance).includes(salt)));
    // Listed by DailyMed as this kind; and not saying otherwise itself.
    const ofKind = type === null || read.documentType === null || read.documentType === type;
    const text = read.summary ?? read.section;
    if (!approved || !thisMedicine || !ofKind || !text) continue;

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

/**
 * The label of the kind read: for a pharmacy's label, a prescription one, or
 * else an over-the-counter one; for Drug Facts, an over-the-counter one; for
 * neither, whichever kind alone has one, and none if both do.
 */
async function ofKind(
  kind: LabelKind | null,
  attempt: (type: DocumentType) => Promise<Outcome>
): Promise<ApprovedUsesLookup> {
  if (kind === 'otc') return attempt('otc');
  const prescription = await attempt('prescription');
  if (prescription.status === 'unavailable') return prescription;
  if (kind === 'prescription') return prescription.status === 'found' ? prescription : attempt('otc');
  const otc = await attempt('otc');
  if (otc.status === 'unavailable') return otc;
  if (prescription.status === 'found' && otc.status === 'found') return { status: 'kindUnknown' };
  return prescription.status === 'found' ? prescription : otc;
}

/** What the target's label says it is approved to treat. Never throws. */
export async function findApprovedUses(target: UsesTarget): Promise<ApprovedUsesLookup> {
  if (target.kind === 'ingredients' && target.form === null) return { status: 'formUnknown' };

  if (target.kind === 'product') {
    for (const code of dailyMedPackageCodes(target.ndc11)) {
      const byNdc = await labelsAt(`ndc=${encodeURIComponent(code)}`);
      if (!byNdc.ok) return { status: 'unavailable' };
      // The package's own labels: this product's, whatever their kind.
      if (byNdc.value.length > 0) {
        return firstProven(byNdc.value, { kind: 'product', key: target.ndc11.slice(0, 9) }, null);
      }
    }
    // Not listed by its package: its RxNorm product's labels, which must then
    // prove they are this medicine by their ingredients.
    const ingredients = await ingredientsOf(target.rxcui);
    if (!ingredients.ok) return { status: 'unavailable' };
    return ofKind(null, async (type) => {
      const listed = await labelsAt(`rxcui=${encodeURIComponent(target.rxcui)}&doctype=${DOCUMENT_TYPES[type]}`);
      if (!listed.ok) return { status: 'unavailable' };
      const labels = likely(listed.value, ingredients.value, { form: null, salts: [], release: null, preferAtOnce: false });
      return firstProven(labels, { kind: 'ingredients', names: ingredients.value, salts: [] }, type);
    });
  }

  const { rxcui, ingredients, form, salts = [], release = null, labelKind = null } = target;
  return ofKind(labelKind, async (type) => {
    const listed = await labelsAt(
      `rxcui=${encodeURIComponent(rxcui)}&doctype=${DOCUMENT_TYPES[type]}&pagesize=100`
    );
    if (!listed.ok) return { status: 'unavailable' };
    const labels = likely(listed.value, ingredients, { form, salts, release, preferAtOnce: true });
    return firstProven(labels, { kind: 'ingredients', names: ingredients, salts }, type);
  });
}

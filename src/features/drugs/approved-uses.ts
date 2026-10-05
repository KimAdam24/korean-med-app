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
import {
  CARRIER_SALTS,
  SALT_WORDS,
  medicineWords,
  same,
  strengthOf,
  type Release,
  type Strength,
} from './identify-name.ts';

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
  /** Each product's strength, per tablet or capsule, from its active ingredients' quantities. */
  readonly strengths: readonly Strength[];
  /** The routes its products are given by, e.g. "ORAL", "VAGINAL". */
  readonly routes: readonly string[];
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
  /**
   * Sold, at this strength and form, as products approved for different
   * things that only their brand tells apart (`BY_BRAND`), and no brand was
   * printed: none is shown. Nothing is asked of DailyMed.
   */
  | { readonly status: 'productUnknown' }
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
      /** The strengths the reading printed (`printedStrengths`), required of the label where it gives one alike. */
      readonly strengths?: readonly Strength[];
      /** The particular release marker printed (`printedReleaseToken`): "XL", "SR"... */
      readonly releaseToken?: string | null;
      /** The brand's words printed (`printedBrandWords`): a label titled with them is tried first. */
      readonly brand?: readonly string[];
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
/** Words that say a medicine is swallowed. */
const BY_MOUTH_WORDS = /\b(?:by\s+mouth|orally|swallow(?:ed)?)\b/i;

/**
 * The dose form a reading names, where some of its text was not read whole
 * (cut at the label's edge, or damaged). Text read whole is used as it is.
 * Text not read whole can still say what a medicine is ("by mouth"; "drops"),
 * but not what it is not: "INSERT 1 TABLET VAGIN", cut before "VAGINALLY",
 * used to pass for a tablet to swallow, and was shown the oral label. So it
 * is used only where it says the medicine is swallowed, or that it is not.
 */
export function doseFormOfReading(
  whole: readonly (string | undefined)[],
  notWhole: readonly (string | undefined)[]
): DoseForm | null {
  const usable = notWhole.filter(
    (text): text is string => !!text && (BY_MOUTH_WORDS.test(text) || NOT_SWALLOWED.test(text))
  );
  return doseFormOf(...whole, ...usable);
}

export function doseFormOf(...texts: readonly (string | undefined)[]): DoseForm | null {
  // A "Liqui-Gel" is a capsule, not a gel put on the skin.
  const all = texts
    .filter(Boolean)
    .join(' ')
    .replace(/\bliqu(?:i|id)[- ]?gels?\b/gi, 'capsule');
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

  // Strengths per tablet or capsule (a denominator of one unit), of every
  // product: "<numerator unit="mg" value="5"/>".
  const strengths: Strength[] = [];
  for (const [, body] of xml.matchAll(/<ingredient\s+classCode="ACTI[BMR]"[^>]*>([\s\S]*?)<\/ingredient>/g)) {
    const numerator = /<numerator\b([^>]*)>/.exec(body)?.[1] ?? '';
    const denominator = /<denominator\b([^>]*)>/.exec(body)?.[1] ?? '';
    const attribute = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
    if (attribute(denominator, 'unit') !== '1' || attribute(denominator, 'value') !== '1') continue;
    const strength = strengthOf(Number(attribute(numerator, 'value')), attribute(numerator, 'unit') ?? '');
    if (strength && !strengths.some((s) => s.unit === strength.unit && same(s.value, strength.value))) {
      strengths.push(strength);
    }
  }
  const routes = [
    ...new Set([...xml.matchAll(/<routeCode\b[^>]*displayName="([^"]+)"/g)].map(([, route]) => route.trim().toUpperCase())),
  ];

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
    strengths,
    routes,
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

/** Metals a salt of a medicine is made with: "LEVOTHYROXINE SODIUM" is levothyroxine. */
const CATIONS = new Set(['sodium', 'potassium', 'calcium', 'magnesium', 'zinc', 'lithium', 'aluminum']);

/**
 * Whether a label's name for an active ingredient is this ingredient's: its
 * words exactly, or with nothing more than what carries it. A salt that
 * carries a medicine, its water ("TRIHYDRATE") and, for a medicine that is
 * not itself a salt, a metal: "METFORMIN HYDROCHLORIDE" is metformin,
 * "LEVOTHYROXINE SODIUM" levothyroxine. But not a word that makes it another
 * medicine: "CALCIUM ACETATE" is not calcium, nor "ATORVASTATIN CALCIUM".
 */
function names(label: string, ingredient: string): boolean {
  const wanted = new Set(nameWords(ingredient));
  const has = nameWords(label);
  if (wanted.size === 0 || ![...wanted].every((word) => has.includes(word))) return false;
  const medicine = [...wanted].some((word) => !SALT_WORDS.has(word));
  return has
    .filter((word) => !wanted.has(word))
    .every((word) => CARRIER_SALTS.has(word) || /hydrate$/.test(word) || (medicine && CATIONS.has(word)));
}

/**
 * Whether a label's active ingredients are exactly these, by name: as many of
 * them, and each named by one of them, as its moiety ("METFORMIN") or its
 * substance ("METFORMIN HYDROCHLORIDE"), exactly (`names`). A name RxNorm and
 * the label spell differently ("vitamin B 12", "CYANOCOBALAMIN") does not
 * match, and its label is not shown: no answer rather than someone else's.
 * It used to be enough that the label's name contained the ingredient's
 * words, and a calcium supplement was shown calcium acetate's label, for
 * kidney failure.
 */
export function sameIngredients(actives: readonly ActiveIngredient[], ingredients: readonly string[]): boolean {
  if (ingredients.length === 0 || actives.length !== ingredients.length) return false;
  return ingredients.every((ingredient) =>
    actives.some((active) => [active.moiety, active.substance].some((name) => name !== null && names(name, ingredient)))
  );
}

type Fetched<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * A label's XML, often 200 to 500 KB, gets longer than a listing: on a slow
 * connection the eight seconds that are plenty for a listing ran out partway
 * through a label, which then showed as "could not be reached", every time.
 */
const LABEL_TIMEOUT_MS = 30000;

async function get<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Fetched<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
  | {
      readonly kind: 'ingredients';
      readonly names: readonly string[];
      readonly salts: readonly string[];
      readonly strengths: readonly Strength[];
      readonly releaseToken: string | null;
      /** By name: the label must be of a medicine taken by mouth. */
      readonly byMouth: boolean;
    };

/**
 * Medicines sold, at one strength and form, as products approved for
 * different things, which nothing on a generic's label tells apart but the
 * brand. Refused unless the brand is printed, and then shown only that
 * brand's own label: every other ambiguity (salt, strength, route, release,
 * prescription or over the counter) refuses rather than guesses, and so does
 * this.
 *
 * Tadalafil 20 mg tablets: CIALIS is for erectile dysfunction and benign
 * prostatic hyperplasia, ADCIRCA and ALYQ for pulmonary arterial
 * hypertension, and both kinds of generic are titled "TADALAFIL TABLET"
 * (2026-10-05: 91 such labels of 183). CIALIS's other strengths (2.5, 5, 10
 * mg) are its own, so the strength chooses there. Looked for and not found:
 * bupropion SR for smoking cessation (ZYBAN) among 40 of its extended-release
 * labels.
 */
const BY_BRAND: readonly {
  readonly ingredient: string;
  readonly strengths: readonly Strength[];
  readonly brands: readonly string[];
}[] = [{ ingredient: 'tadalafil', strengths: [{ value: 20, unit: 'mg' }], brands: ['cialis', 'adcirca', 'alyq'] }];

/**
 * For a medicine told apart only by its brand: the brand whose label alone
 * may be shown; null where none is needed; 'refuse' where one is and none was
 * printed. Needed at the strength the products share, or where no strength
 * was read.
 */
function brandRequired(
  ingredients: readonly string[],
  strengths: readonly Strength[],
  brand: readonly string[]
): string | null | 'refuse' {
  const entry = BY_BRAND.find((one) => ingredients.length === 1 && nameWords(ingredients[0]).join(' ') === one.ingredient);
  if (!entry) return null;
  const masses = strengths.filter((strength) => strength.unit === 'mg');
  const shared =
    masses.length === 0 ||
    masses.some((strength) => entry.strengths.some((one) => one.unit === strength.unit && same(one.value, strength.value)));
  if (!shared) return null;
  return entry.brands.find((one) => brand.includes(one)) ?? 'refuse';
}

/** Routes of a medicine taken by mouth, of which a name's tablet or capsule is one. */
const BY_MOUTH = new Set(['ORAL', 'SUBLINGUAL', 'BUCCAL']);

/** The particular release markers ("XL", "SR") a title or label text names. */
const releaseTokensIn = (text: string) =>
  new Set([...text.matchAll(/\b(XL|SR|XR|CR|LA|CD)\b/g)].map(([token]) => token.toLowerCase()));

/**
 * Whether a label gives each strength printed: where it gives strengths in
 * the same measure (a mass, units, mEq), one of them must be it. Finasteride
 * 5 mg is for the prostate, its 1 mg label for hair loss; sildenafil 20 mg for
 * pulmonary hypertension, its 25 to 100 mg label for erectile dysfunction. A
 * label giving none in that measure ("10 MEQ" printed, "750 mg" labelled)
 * cannot be told apart by it, and is not refused for it.
 */
function givesStrengths(label: readonly Strength[], printed: readonly Strength[]): boolean {
  return printed.every((wanted) => {
    const comparable = label.filter((strength) => strength.unit === wanted.unit);
    return comparable.length === 0 || comparable.some((strength) => same(strength.value, wanted.value));
  });
}

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
  want: {
    form: DoseForm | null;
    salts: readonly string[];
    release: Release | null;
    releaseToken: string | null;
    brand: readonly string[];
    /** A brand whose title alone may be shown (`brandRequired`). */
    onlyBrand?: string | null;
    preferAtOnce: boolean;
  }
): LabelDocument[] {
  const formWord = want.form ? new RegExp(`\\b${want.form}`, 'i') : null;
  const scored = listed.flatMap((label, index) => {
    const title = label.title.replace(/\[.*$/, '');
    // Its words as printed, and spelled out as a name's are ("HCL").
    const words = new Set([...nameWords(title), ...medicineWords(title)]);
    const tokens = releaseTokensIn(title.toUpperCase());
    const fits =
      (formWord === null || formWord.test(title)) &&
      names.every((name) => nameWords(name).every((word) => words.has(word))) &&
      // One ingredient's list also holds its combinations ("PIOGLITAZONE AND
      // METFORMIN ...", "AMLODIPINE / VALSARTAN"), which would only fail the
      // count after a download. A slash only before a tablet's or capsule's
      // form, by name: a barcode's fallback may be "SOLUTION/ DROPS".
      (names.length > 1 ||
        (!words.has('and') && !(formWord !== null && /\//.test(title.replace(/\b(TABLET|CAPSULE)\b.*$/i, ''))))) &&
      (want.release === null || releaseOf(title) === want.release) &&
      // Another product's marker in the title ("(SR)" for an XL bottle).
      (want.releaseToken === null || tokens.size === 0 || tokens.has(want.releaseToken)) &&
      // Only the brand's own label, where only the brand tells them apart.
      (!want.onlyBrand || words.has(want.onlyBrand));
    if (!fits) return [];
    // First the titles that name the salt printed, the brand, the marker;
    // then, where no release was printed, those released at once.
    const score =
      (want.salts.length > 0 && want.salts.every((salt) => words.has(salt)) ? 4 : 0) +
      (want.brand.length > 0 && want.brand.every((word) => words.has(word)) ? 4 : 0) +
      (want.releaseToken !== null && tokens.has(want.releaseToken) ? 2 : 0) +
      (want.preferAtOnce && want.release === null && releaseOf(title) === null ? 1 : 0);
    return [{ label, index, score }];
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ label }) => label);
}

type Packaging = { data?: { products?: { active_ingredients?: { strength?: string }[] }[] } };

/**
 * A label's strengths as DailyMed's packaging summary gives them ("20 mg"):
 * a kilobyte, against the hundreds of a label's XML. Null where it could not
 * be read, so the label is left to its XML to judge.
 */
async function packagedStrengths(setId: string): Promise<Strength[] | null> {
  const got = await get(`${DAILYMED_BASE}/spls/${encodeURIComponent(setId)}/packaging.json`, (response) =>
    response.json() as Promise<Packaging>
  );
  if (!got.ok) return null;
  const strengths: Strength[] = [];
  for (const product of got.value.data?.products ?? []) {
    for (const ingredient of product.active_ingredients ?? []) {
      // "20 mg", not a concentration ("100 mg/5 mL").
      const amount = /^\s*([\d.,]+)\s*([^\s/]+)\s*$/.exec(ingredient.strength ?? '');
      const strength = amount ? strengthOf(Number(amount[1].replace(/,/g, '')), amount[2]) : null;
      if (strength) strengths.push(strength);
    }
  }
  return strengths;
}

/** How many labels' packaging is read, at most, looking for the strength printed; and how many at once. */
const SCREENED = 24;
const AT_ONCE = 6;

/**
 * The labels that give the strength printed, in their order. Most labels in
 * a list are repackagers', each of one strength (RemedyRepack's atorvastatin
 * 10 mg, its 40 mg...), so the few label downloads went on the wrong
 * strengths, and nothing was found for a 20 mg bottle. Their packaging is
 * read first, a few at a time, until enough labels give it.
 */
async function ofStrength(labels: readonly LabelDocument[], printed: readonly Strength[]): Promise<LabelDocument[]> {
  if (printed.length === 0) return [...labels];
  const kept: LabelDocument[] = [];
  const screened = labels.slice(0, SCREENED);
  for (let at = 0; at < screened.length && kept.length < LABELS_TRIED; at += AT_ONCE) {
    const batch = screened.slice(at, at + AT_ONCE);
    const strengths = await Promise.all(batch.map((label) => packagedStrengths(label.setId)));
    batch.forEach((label, index) => {
      const given = strengths[index];
      if (given === null || givesStrengths(given, printed)) kept.push(label);
    });
  }
  return kept;
}

/** The first of these labels that proves it is this medicine's, of this kind; or why none did. */
async function firstProven(
  labels: readonly LabelDocument[],
  proof: Proof,
  type: DocumentType | null
): Promise<Outcome> {
  let failed = false;
  for (const label of labels.slice(0, LABELS_TRIED)) {
    const xml = await get(
      `${DAILYMED_BASE}/spls/${encodeURIComponent(label.setId)}.xml`,
      (response) => response.text(),
      LABEL_TIMEOUT_MS
    );
    if (!xml.ok) {
      failed = true;
      continue;
    }

    const read = readIndications(xml.value);
    const approved = read.approvals.length > 0 && read.approvals.every((category) => APPROVED.test(category));
    const text = read.summary ?? read.section;
    const thisMedicine =
      proof.kind === 'product'
        ? read.products.includes(proof.key)
        : sameIngredients(read.actives, proof.names) &&
          // The salt printed, in the label's own active ingredient.
          proof.salts.every((salt) =>
            read.actives.some((active) => new Set([...nameWords(active.substance), ...medicineWords(active.substance)]).has(salt))
          ) &&
          // The strength printed, among its products'.
          givesStrengths(read.strengths, proof.strengths) &&
          // Taken by mouth, as a name's tablet or capsule is: not a tablet
          // put in the vagina ("YUVAFEM (ESTRADIOL) TABLET").
          (!proof.byMouth || read.routes.length === 0 || read.routes.some((route) => BY_MOUTH.has(route))) &&
          // Not another product's marker ("(SR)" for an XL bottle), in its
          // title or its own words.
          (proof.releaseToken === null ||
            ((tokens) => tokens.size === 0 || tokens.has(proof.releaseToken!))(
              releaseTokensIn(`${label.title} ${text ?? ''}`)
            ));
    // Listed by DailyMed as this kind; and not saying otherwise itself.
    const ofKind = type === null || read.documentType === null || read.documentType === type;
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
  if (kind === 'prescription') {
    const prescription = await attempt('prescription');
    if (prescription.status === 'unavailable') return prescription;
    return prescription.status === 'found' ? prescription : attempt('otc');
  }
  // Neither read: both are needed to tell, so both are asked at once.
  const [prescription, otc] = await Promise.all([attempt('prescription'), attempt('otc')]);
  if (prescription.status === 'unavailable') return prescription;
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
      const labels = likely(listed.value, ingredients.value, {
        form: null,
        salts: [],
        release: null,
        releaseToken: null,
        brand: [],
        preferAtOnce: false,
      });
      const proof: Proof = {
        kind: 'ingredients',
        names: ingredients.value,
        salts: [],
        strengths: [],
        releaseToken: null,
        byMouth: false,
      };
      return firstProven(labels, proof, type);
    });
  }

  const {
    rxcui,
    ingredients,
    form,
    salts = [],
    release = null,
    labelKind = null,
    strengths = [],
    releaseToken = null,
    brand = [],
  } = target;
  const onlyBrand = brandRequired(ingredients, strengths, brand);
  if (onlyBrand === 'refuse') return { status: 'productUnknown' };
  return ofKind(labelKind, async (type) => {
    const listed = await labelsAt(
      `rxcui=${encodeURIComponent(rxcui)}&doctype=${DOCUMENT_TYPES[type]}&pagesize=100`
    );
    if (!listed.ok) return { status: 'unavailable' };
    const labels = await ofStrength(
      likely(listed.value, ingredients, { form, salts, release, releaseToken, brand, onlyBrand, preferAtOnce: true }),
      strengths
    );
    const proof: Proof = { kind: 'ingredients', names: ingredients, salts, strengths, releaseToken, byMouth: true };
    return firstProven(labels, proof, type);
  });
}

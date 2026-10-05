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
 *   extended; DR, EC: delayed). Where none is printed, RxNorm's products say
 *   which releases are made at the strength (`releasesMade`): one, and it is
 *   required as though printed (omeprazole is always delayed-release); two,
 *   and the user is asked which marker the bottle shows (`releaseUnknown`),
 *   their answer then taken as printed, "none of these" as released at once.
 *   Never guessed: labels released at once used to be tried first, and an
 *   extended-release bottle whose marker went unread was shown the uses of
 *   one released at once (clonidine ER, for ADHD alone, blood pressure).
 * - **A brand's own label only where that brand is printed** (`likely`):
 *   GRALISE's label lists other uses than generic gabapentin's at the same
 *   strength. A bottle with no brand is shown a generic's label, unless the
 *   medicine is sold only under brands.
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
 * ## Its text, its own uses
 *
 * A label can be this medicine's and still not show its uses: 51 of the top
 * 200 medicines' approved labels did not (docs/label-scan.md). So a label is
 * passed over where its text is not uses (`notUses`: a bullet, a fragment,
 * a warning, a guide); where it is of two medicines (`mixed`), its one text
 * one of theirs; where its title or its own text says it is of another
 * release than the bottle (`labelRelease`); and its ingredient is the
 * medicine's by its moiety only where its substance is that moiety's salt
 * (`carries`), not a prodrug of it.
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
  printedBrandWords,
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
  /**
   * Whether its tablets and capsules are of different medicines: one label
   * for metoprolol succinate and tartrate, lisinopril and lisinopril with
   * hydrochlorothiazide, acyclovir and valacyclovir. Its one text is one
   * product's, and not the other's.
   */
  readonly mixed: boolean;
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
  /**
   * Made, at this strength and form, released at once and over time (or
   * later), as RxNorm's products say, and the bottle said neither: the
   * releases are approved for different things (clonidine ER for ADHD, the
   * tablet released at once for blood pressure), so none is shown until the
   * user says which marker the bottle shows. `releases` are those made at it,
   * so the question offers only their markers. Nothing is asked of DailyMed.
   */
  | { readonly status: 'releaseUnknown'; readonly releases: readonly ('immediate' | Release)[] }
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
      /**
       * The release the name printed (`printedRelease`), or the user said the
       * bottle shows (`releaseOfMarker`), required of the label: "immediate"
       * where they said it shows no marker.
       */
      readonly release?: Release | 'immediate' | null;
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

  // Each tablet's or capsule's active substances, from its own <subject>,
  // without the water a substance is named with ("HEMIHYDRATE").
  const medicines = new Set<string>();
  for (const [, body] of xml.matchAll(/<subject>([\s\S]*?)<\/subject>/g)) {
    const form = /<formCode\b[^>]*displayName="([^"]+)"/.exec(body)?.[1] ?? '';
    if (!/\b(?:TABLET|CAPSULE)/i.test(form)) continue;
    const substances = [...body.matchAll(/<ingredient\s+classCode="ACTI[BMR]"[^>]*>[\s\S]*?<name>([^<]+)<\/name>/g)].map(
      ([, name]) =>
        nameWords(name)
          .filter((word) => !/hydrate$|^anhydrous$/.test(word))
          .join(' ')
    );
    medicines.add([...new Set(substances)].sort().join(' + '));
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
    strengths,
    routes,
    mixed: medicines.size > 1,
  };
}

/**
 * Whether a label's text is not uses at all, though it stands where they
 * should: nothing but a bullet ("•", on 18 labels of one repackager); a
 * sentence cut off at "indicated for:"; a boxed warning, the Highlights'
 * opening lines, a medication guide, warnings, directions or pharmacology
 * put in the Indications section. Each pattern here was checked against
 * every approved tablet and capsule label of the top 200 medicines (27,440,
 * docs/label-scan.md): it matched only labels whose text is not uses.
 */
export function notUses(text: string): boolean {
  if (text.replace(/[^A-Za-z]/g, '').length < 12) return true;
  if (/(?:indicated|used)\s+(?:for|in|as)\s*:?\s*$/i.test(text.trim())) return true;
  // At its start, or after a first line naming the product.
  return /^(?:[^\n]{0,80}\n)?\s*(?:BOXED WARNING|WARNING\b|These highlights do not include|Read (?:this|the) (?:Medication Guide|Patient Information)|What is the most important|Medication Guide\b|Patient Information\b|Keep out of reach|Do not (?:use|take)\b|drowsines?s may occur|Ask a doctor|Stop use|When using this product|Taking more than|Adults and children|Directions\b|Pharmacokinetics|Clinical Pharmacology|Mechanism of Action|\S+ is an? [\w-]+ that exerts)/i.test(
    text
  );
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
    actives.some(
      (active) =>
        names(active.substance, ingredient) ||
        (active.moiety !== null && names(active.moiety, ingredient) && carries(active.substance, active.moiety))
    )
  );
}

/**
 * Whether a substance is its moiety with only what carries it: a salt, an
 * ester, its water ("CODEINE PHOSPHATE" is codeine). Not a prodrug, which
 * SPL also names by the moiety it becomes: valacyclovir's labels give
 * acyclovir as their moiety, HORIZANT's gabapentin enacarbil gabapentin, and
 * each was accepted as the other medicine.
 */
function carries(substance: string, moiety: string): boolean {
  const own = new Set(nameWords(moiety));
  return nameWords(substance).every((word) => own.has(word) || SALT_WORDS.has(word) || /hydrate$/.test(word));
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

/** One of RxNorm's clinical drugs (SCD): what is made, as its name says it. */
export type ClinicalDrug = {
  /** How many ingredients: "hydrochlorothiazide 12.5 MG / lisinopril 10 MG" is two. */
  readonly ingredients: number;
  /** Its ingredients' words, salts with them ("metoprolol succinate"). */
  readonly words: readonly string[];
  readonly strengths: readonly Strength[];
  readonly form: DoseForm;
  readonly release: 'immediate' | Release;
};

/**
 * A clinical drug's name read: "24 HR metformin hydrochloride 500 MG Extended
 * Release Oral Tablet" is metformin hydrochloride, 500 mg, an extended-release
 * tablet. Null for any form but a tablet or a capsule.
 */
export function clinicalDrug(name: string): ClinicalDrug | null {
  const parts = [...name.matchAll(/([A-Za-z][A-Za-z0-9 ,'()-]*?)\s+([\d.]+)\s+(MG|MCG|UNT|MEQ)\b/g)];
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  const doseForm = name.slice(last.index + last[0].length);
  const form = /\bTablet\b/i.test(doseForm) ? 'TABLET' : /\bCapsule\b/i.test(doseForm) ? 'CAPSULE' : null;
  if (!form) return null;
  const strengths = parts
    .map(([, , value, unit]) => strengthOf(Number(value), unit === 'UNT' ? 'unit' : unit))
    .filter((strength): strength is Strength => strength !== null);
  return {
    ingredients: parts.length,
    // Without the "24 HR" before the first.
    words: parts.flatMap(([, words]) => nameWords(words)).filter((word) => !/^\d/.test(word) && word !== 'hr'),
    strengths,
    form,
    release: /\bExtended Release\b/i.test(doseForm) ? 'extended' : /\bDelayed Release\b/i.test(doseForm) ? 'delayed' : 'immediate',
  };
}

/** The tablets and capsules RxNorm makes of an ingredient (or with it); `unavailable` if RxNav could not say. */
async function clinicalDrugsOf(rxcui: string): Promise<Fetched<ClinicalDrug[]>> {
  const related = await get(`${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=SCD`, (response) =>
    response.json() as Promise<Related>
  );
  if (!related.ok) return related;
  return {
    ok: true,
    value: (related.value?.relatedGroup?.conceptGroup ?? [])
      .filter((group) => group.tty === 'SCD')
      .flatMap((group) => group.conceptProperties ?? [])
      .map((concept) => (typeof concept.name === 'string' ? clinicalDrug(concept.name) : null))
      .filter((drug): drug is ClinicalDrug => drug !== null),
  };
}

/**
 * The releases RxNorm makes this medicine in, at the strength and form and
 * salt the bottle printed: its clinical drugs of as many ingredients, each
 * strength printed among theirs.
 */
export function releasesMade(
  drugs: readonly ClinicalDrug[],
  bottle: { ingredients: number; form: DoseForm; salts: readonly string[]; strengths: readonly Strength[] }
): ('immediate' | Release)[] {
  const made = drugs.filter(
    (drug) =>
      drug.ingredients === bottle.ingredients &&
      drug.form === bottle.form &&
      bottle.salts.every((salt) => drug.words.includes(salt)) &&
      givesStrengths(drug.strengths, bottle.strengths) &&
      bottle.strengths.some((printed) => drug.strengths.some((strength) => strength.unit === printed.unit && same(strength.value, printed.value)))
  );
  return [...new Set(made.map((drug) => drug.release))].sort();
}

/** What a label must be, besides approved, to be shown for this lookup. */
type Proof =
  | { readonly kind: 'product'; readonly key: string }
  | {
      readonly kind: 'ingredients';
      readonly names: readonly string[];
      readonly salts: readonly string[];
      readonly strengths: readonly Strength[];
      /** The release the bottle printed or the user said: required of the label, by its title or its own text. */
      readonly release: Release | 'immediate' | null;
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
 * Found by reading every label of the ingredient (2026-10-05):
 *
 * - Tadalafil 20 mg tablets: CIALIS is for erectile dysfunction and benign
 *   prostatic hyperplasia, ADCIRCA and ALYQ for pulmonary arterial
 *   hypertension, and both kinds of generic are titled "TADALAFIL TABLET"
 *   (91 such labels of 183). CIALIS's other strengths (2.5, 5, 10 mg) are its
 *   own, so the strength chooses there.
 * - Bupropion SR 150 mg tablets: 7 of its 368 labels are ZYBAN's generics,
 *   for smoking cessation; the rest of its SR labels, WELLBUTRIN SR's, for
 *   depression; both titled "BUPROPION HYDROCHLORIDE SR ... EXTENDED RELEASE".
 *   Not where the bottle says XL (depression and seasonal affective
 *   disorder), which no smoking-cessation label is; nor at 100 or 200 mg.
 *   ZYBAN itself has no label on DailyMed, and is not identified by RxNorm.
 */
const BY_BRAND: readonly {
  readonly ingredient: string;
  readonly strengths: readonly Strength[];
  readonly brands: readonly string[];
  /** Release markers that, printed, rule the ambiguous products out. */
  readonly unlessReleaseToken?: readonly string[];
}[] = [
  { ingredient: 'tadalafil', strengths: [{ value: 20, unit: 'mg' }], brands: ['cialis', 'adcirca', 'alyq'] },
  { ingredient: 'bupropion', strengths: [{ value: 150, unit: 'mg' }], brands: ['wellbutrin', 'zyban'], unlessReleaseToken: ['xl'] },
];

/**
 * For a medicine told apart only by its brand: the brand whose label alone
 * may be shown; null where none is needed; 'refuse' where one is and none was
 * printed. Needed at the strength the products share, or where no strength
 * was read; not where a release marker printed rules them out.
 */
function brandRequired(
  ingredients: readonly string[],
  strengths: readonly Strength[],
  brand: readonly string[],
  releaseToken: string | null
): string | null | 'refuse' {
  const entry = BY_BRAND.find((one) => ingredients.length === 1 && nameWords(ingredients[0]).join(' ') === one.ingredient);
  if (!entry) return null;
  if (releaseToken !== null && entry.unlessReleaseToken?.includes(releaseToken)) return null;
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

/**
 * The release a label's title names ("TABLET, FILM COATED, EXTENDED RELEASE").
 * Controlled, sustained and prolonged release are extended release by other
 * names: "OXYCODONE HCL CONTROLLED-RELEASE TABLET" was taken for one released
 * at once, and tried first for an immediate-release bottle, whose uses its
 * "around-the-clock ... for an extended period" are not.
 */
const releaseOf = (title: string): Release | null =>
  /\b(?:EXTENDED|CONTROLLED|SUSTAINED|PROLONGED)[- ]RELEASE\b/i.test(title)
    ? 'extended'
    : /\bDELAYED[- ]RELEASE\b/i.test(title)
      ? 'delayed'
      : null;

/**
 * Whether a label of this release can be the bottle's. The release the bottle
 * printed, the user said, or the only one RxNorm makes at its strength: a
 * label must say it is of it, by its title or its own text (or carry the
 * particular marker); and where it is released at once, a label must say it
 * is of none. Where nothing is known, any.
 */
function releaseFits(label: Release | null, wanted: Release | 'immediate' | null, markerTitled: boolean): boolean {
  if (wanted === null) return true;
  if (wanted === 'immediate') return label === null;
  return label === wanted || markerTitled;
}

/**
 * The release a label is of: its title's, in words or by a marker ("ENTOCORT
 * EC", "WELLBUTRIN SR"), or else what its own text first says it is. Some
 * labels titled plain "TABLET" are of an extended-release product, and say so
 * only in their text: "Verapamil hydrochloride extended-release tablets are
 * indicated for the treatment of hypertension", for a strength an
 * immediate-release verapamil also has, approved for angina and arrhythmias
 * too. Not "DR", which starts names ("DR SIMI").
 */
function labelRelease(title: string, text: string): Release | null {
  const titled = title.replace(/\[.*$/, '');
  if (releaseOf(titled)) return releaseOf(titled);
  if (/\b(?:ER|XR|XL|SR|CR|LA|CD)\b/.test(titled)) return 'extended';
  if (/\bEC\b/.test(titled)) return 'delayed';
  const first = text.split(/(?<=[.:])\s/, 1)[0].slice(0, 300);
  return /\b(?:extended|sustained|controlled|prolonged)[- ]release\b/i.test(first)
    ? 'extended'
    : /\b(?:delayed[- ]release|enteric[- ]coated)\b/i.test(first)
      ? 'delayed'
      : null;
}

/** The words of a title that say what form its products are, not what they are called. */
const FORM_WORDS = new Set([
  'tablet', 'tablets', 'capsule', 'capsules', 'film', 'coated', 'coat', 'sugar', 'liquid', 'filled', 'gelatin',
  'chewable', 'orally', 'disintegrating', 'dispersible', 'effervescent', 'sublingual', 'buccal', 'soft', 'hard',
  'pellets', 'beads', 'kit', 'extended', 'delayed', 'release', 'controlled', 'sustained', 'prolonged', 'injection',
  'solution', 'suspension', 'powder', 'for', 'oral', 'concentrate', 'granule', 'granules', 'syrup', 'elixir',
  'lozenge', 'troche', 'cream', 'ointment', 'gel', 'spray', 'aerosol', 'inhalation', 'patch', 'drops', 'ophthalmic',
]);

/**
 * The names of a title's products other than their ingredients: one list of
 * words for each product it titles ("WEGOVY (SEMAGLUTIDE) INJECTION, SOLUTION
 * WEGOVY (SEMAGLUTIDE) TABLET" is WEGOVY twice), empty for a product titled by
 * its ingredients alone ("ATORVASTATIN CALCIUM TABLET"). A brand, mostly
 * (GRALISE, INDERAL XL); a product's own name sometimes ("CETIRIZINE
 * HYDROCHLORIDE (HIVES RELIEF) TABLET"), which is a different product too.
 */
export function titledNames(title: string, ingredients: readonly string[]): string[][] {
  const named: string[][] = [];
  let product: string[] = [];
  let inForm = false;
  for (const [part] of title.replace(/\[.*$/, '').matchAll(/\([^)]*\)|[^\s(]+/g)) {
    // What is in brackets belongs to the product before it ("(ORAL SEMAGLUTIDE)").
    if (part.startsWith('(')) {
      product.push(...nameWords(part));
      continue;
    }
    for (const word of nameWords(part)) {
      if (FORM_WORDS.has(word)) {
        inForm = true;
        continue;
      }
      // A word after a product's form starts the next product.
      if (inForm) {
        named.push(product);
        product = [];
        inForm = false;
      }
      product.push(word);
    }
  }
  if (product.length > 0) named.push(product);
  return named.map((words) => printedBrandWords(words.join(' '), ingredients).filter((word) => !FORM_WORDS.has(word)));
}

/**
 * Of the labels DailyMed lists for an RxNorm concept, those whose titles could
 * be this medicine's, best first. Titles name the medicine and its form
 * ("GLUMETZA (METFORMIN HYDROCHLORIDE) TABLET [...]"), so the few downloads
 * go on likely ones; each is still held to its own ingredient list after. A
 * title is only a way to choose, except for the release, which only the
 * title says, and the brand.
 *
 * A brand's own label is this medicine's only where that brand is printed.
 * At a strength its generics share, a brand's label can list other uses than
 * theirs: GRALISE, gabapentin taken once a day, is for nerve pain after
 * shingles alone, where the generic 600 mg tablet is for epilepsy too;
 * INDERAL XL is for blood pressure, where propranolol ER is for angina and
 * migraine as well; XARELTO's one label for every strength lists clots and
 * atrial fibrillation for the 2.5 mg tablet, which is for neither. So a bottle
 * that prints no brand is shown a label that names none, and one that prints a
 * brand, that brand's or one naming none; never another brand's. Only where no
 * label of the medicine is titled without a brand (sold only under brands, its
 * bottle printing the generic name) is a brand's label shown without its
 * brand printed.
 */
function likely(
  listed: readonly LabelDocument[],
  names: readonly string[],
  want: {
    form: DoseForm | null;
    salts: readonly string[];
    release: Release | 'immediate' | null;
    releaseToken: string | null;
    brand: readonly string[];
    /** A brand whose title alone may be shown (`brandRequired`). */
    onlyBrand?: string | null;
    /** By name: a brand's own label only where that brand is printed. */
    byPrintedBrand?: boolean;
  }
): LabelDocument[] {
  const formWord = want.form ? new RegExp(`\\b${want.form}`, 'i') : null;
  const fitting = listed.flatMap((label, index) => {
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
      // The release printed, in the title's words or by the marker itself:
      // "WELLBUTRIN SR (BUPROPION HYDROCHLORIDE) TABLET, FILM COATED" says
      // "EXTENDED RELEASE" nowhere.
      releaseFits(
        labelRelease(title, ''),
        want.release,
        want.releaseToken !== null && tokens.has(want.releaseToken)
      ) &&
      // Another product's marker in the title ("(SR)" for an XL bottle).
      (want.releaseToken === null || tokens.size === 0 || tokens.has(want.releaseToken)) &&
      // Only the brand's own label, where only the brand tells them apart.
      (!want.onlyBrand || words.has(want.onlyBrand));
    if (!fits) return [];
    // First the titles that name the salt printed, the brand, the marker.
    const score =
      (want.salts.length > 0 && want.salts.every((salt) => words.has(salt)) ? 4 : 0) +
      (want.brand.length > 0 && want.brand.every((word) => words.has(word)) ? 4 : 0) +
      (want.releaseToken !== null && tokens.has(want.releaseToken) ? 2 : 0);
    const named = titledNames(title, names);
    return [
      {
        label,
        index,
        score,
        // Titled by its ingredients alone, as a generic is.
        plain: named.some((words) => words.length === 0),
        // Titled with the brand printed, all its words.
        printed: named.some((words) => words.length > 0 && words.every((word) => want.brand.includes(word))),
      },
    ];
  });
  const scored = !want.byPrintedBrand
    ? fitting
    : want.brand.length > 0
      ? fitting.filter((label) => label.plain || label.printed)
      : fitting.some((label) => label.plain)
        ? fitting.filter((label) => label.plain)
        : // Sold only under brands: its bottle printed the generic name.
          fitting;
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
            )) &&
          // The release printed, as the label's title or its own text says
          // it is: not a title naming none over an extended-release text.
          releaseFits(
            labelRelease(label.title, text ?? ''),
            proof.release,
            proof.releaseToken !== null && releaseTokensIn(label.title.toUpperCase()).has(proof.releaseToken)
          ) &&
          // One medicine's label: not one text for two.
          !read.mixed;
    // Listed by DailyMed as this kind; and not saying otherwise itself.
    const ofKind = type === null || read.documentType === null || read.documentType === type;
    // Its text its uses: not a bullet, a fragment, a warning or a guide.
    if (!approved || !thisMedicine || !ofKind || !text || notUses(text)) continue;

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
      });
      const proof: Proof = {
        kind: 'ingredients',
        names: ingredients.value,
        salts: [],
        strengths: [],
        release: null,
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
  const onlyBrand = brandRequired(ingredients, strengths, brand, releaseToken);
  if (onlyBrand === 'refuse') return { status: 'productUnknown' };

  // No release printed, nor said: which RxNorm makes at this strength. Two,
  // and which this is decides its uses, so the user is asked; one, and it is
  // the bottle's. Never guessed: labels released at once used to be tried
  // first, and clonidine ER, for ADHD alone, was shown blood pressure.
  let wanted = release;
  if (release === null && form !== null) {
    const drugs = await clinicalDrugsOf(rxcui);
    if (!drugs.ok) return { status: 'unavailable' };
    const releases = releasesMade(drugs.value, { ingredients: ingredients.length, form, salts, strengths });
    if (releases.length > 1) return { status: 'releaseUnknown', releases };
    if (releases.length === 1) wanted = releases[0];
  }

  return ofKind(labelKind, async (type) => {
    const listed = await labelsAt(
      `rxcui=${encodeURIComponent(rxcui)}&doctype=${DOCUMENT_TYPES[type]}&pagesize=100`
    );
    if (!listed.ok) return { status: 'unavailable' };
    const labels = await ofStrength(
      likely(listed.value, ingredients, {
        form,
        salts,
        release: wanted,
        releaseToken,
        brand,
        onlyBrand,
        byPrintedBrand: true,
      }),
      strengths
    );
    const proof: Proof = {
      kind: 'ingredients',
      names: ingredients,
      salts,
      strengths,
      release: wanted,
      releaseToken,
      byMouth: true,
    };
    return firstProven(labels, proof, type);
  });
}

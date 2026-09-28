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
 * ## Which label
 *
 * - A barcode names the exact product, so its own label is used: looked up by
 *   the product's NDC, and failing that (a discontinued package, say) by its
 *   RxNorm product.
 * - A name read from a photo names only the ingredient (`identify-name`), and
 *   DailyMed's list for an ingredient is every product containing it:
 *   combinations, injections, extended-release forms. So the label is one
 *   with the same number of active ingredients as the medicine identified,
 *   and of the form the label's own words give (capsule or tablet), newest
 *   first. The one chosen is named on screen, so which it was can be seen.
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

/** How many labels are opened before giving up: each is a download. */
const LABELS_TRIED = 4;

/** What one label document says, as far as this needs. */
export type LabelIndications = {
  /** The marketing category of each product on the label, e.g. "ANDA". */
  readonly approvals: readonly string[];
  /** Its active ingredients, by active moiety, distinct, upper case. */
  readonly activeIngredients: readonly string[];
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
  /** No current FDA-approved label with an Indications section was found. */
  | { readonly status: 'none' }
  /** DailyMed could not be reached, or answered with an error: trying again may work. */
  | { readonly status: 'unavailable' };

export type UsesTarget =
  /** A barcode's product: its 11-digit CMS code, and its RxNorm product. */
  | { readonly kind: 'product'; readonly ndc11: string; readonly rxcui: string }
  /** A name read from a label: its RxNorm ingredient, or a combination's. */
  | {
      readonly kind: 'ingredients';
      readonly rxcui: string;
      readonly count: number;
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
 * The forms of a product code DailyMed might store an 11-digit CMS code as.
 *
 * DailyMed looks an NDC up only as printed, in its original 10-digit shape
 * (4-4-2, 5-3-2 or 5-4-1), and the CMS form hides which that was behind a
 * padding zero. Each place the zero could have been padded in gives one
 * labeler-product code; only the real one is on file, since a labeler's
 * codes all share one shape.
 */
export function dailyMedProductCodes(ndc11: string): string[] {
  if (!/^\d{11}$/.test(ndc11)) return [];
  const codes: string[] = [];
  if (ndc11[0] === '0') codes.push(`${ndc11.slice(1, 5)}-${ndc11.slice(5, 9)}`);
  if (ndc11[5] === '0') codes.push(`${ndc11.slice(0, 5)}-${ndc11.slice(6, 9)}`);
  if (ndc11[9] === '0') codes.push(`${ndc11.slice(0, 5)}-${ndc11.slice(5, 9)}`);
  return [...new Set(codes)];
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
  const approvals = [...xml.matchAll(/<approval>[\s\S]*?<code\b[^>]*displayName="([^"]+)"/g)].map((match) =>
    match[1].trim()
  );

  const active = new Set<string>();
  for (const [, body] of xml.matchAll(/<ingredient\s+classCode="ACTI[BMR]"[^>]*>([\s\S]*?)<\/ingredient>/g)) {
    // The moiety, so a salt ("METFORMIN HYDROCHLORIDE") counts as its drug;
    // an ingredient given as its moiety has no separate one.
    const moiety = /<activeMoiety>\s*<activeMoiety>[\s\S]*?<name>([^<]+)<\/name>/.exec(body)?.[1];
    const name = moiety ?? /<name>([^<]+)<\/name>/.exec(body)?.[1];
    if (name) active.add(name.trim().toUpperCase());
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
    activeIngredients: [...active],
    summary,
    section: body ? labelMarkupToText(body) : null,
  };
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

/** The labels to try, best first; `unavailable` if DailyMed could not say. */
async function candidates(target: UsesTarget): Promise<Fetched<LabelDocument[]>> {
  if (target.kind === 'product') {
    for (const code of dailyMedProductCodes(target.ndc11)) {
      const byNdc = await labelsAt(`ndc=${encodeURIComponent(code)}`);
      if (!byNdc.ok) return byNdc;
      if (byNdc.value.length > 0) return byNdc;
    }
    return labelsAt(`rxcui=${encodeURIComponent(target.rxcui)}`);
  }

  const listed = await labelsAt(`rxcui=${encodeURIComponent(target.rxcui)}&pagesize=100`);
  if (!listed.ok) return listed;
  // Titles give the dose form ("ERGOCALCIFEROL CAPSULE [...]"): the one the
  // label names, or else a tablet or capsule, never an injection. A single
  // ingredient's list also holds its combinations, which name two ("... AND
  // ..."); the label's own ingredients are checked as well, below.
  const form = target.form ? new RegExp(`\\b${target.form}`, 'i') : /\b(TABLET|CAPSULE)/i;
  return {
    ok: true,
    value: listed.value.filter(
      (label) => form.test(label.title) && (target.count > 1 || !/\bAND\b/.test(label.title.replace(/\[.*$/, '')))
    ),
  };
}

/** What the target's label says it is approved to treat. Never throws. */
export async function findApprovedUses(target: UsesTarget): Promise<ApprovedUsesLookup> {
  const labels = await candidates(target);
  if (!labels.ok) return { status: 'unavailable' };

  let failed = false;
  for (const label of labels.value.slice(0, LABELS_TRIED)) {
    const xml = await get(`${DAILYMED_BASE}/spls/${encodeURIComponent(label.setId)}.xml`, (response) =>
      response.text()
    );
    if (!xml.ok) {
      failed = true;
      continue;
    }

    const read = readIndications(xml.value);
    const approved = read.approvals.length > 0 && read.approvals.every((category) => APPROVED.test(category));
    const sameMedicine = target.kind === 'product' || read.activeIngredients.length === target.count;
    const text = read.summary ?? read.section;
    if (!approved || !sameMedicine || !text) continue;

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

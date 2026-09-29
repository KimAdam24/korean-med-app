/**
 * FDA label content from DailyMed (NLM), keyed by NDC.
 *
 * §3.2 calls for warnings from an authoritative source rather than generated
 * text, and this is that source: the Structured Product Labeling document the
 * manufacturer filed with the FDA. Free, no key.
 *
 * ## What the API actually does, as opposed to what it documents
 *
 * Established by calling it rather than reading about it, because the two
 * differ in ways that matter:
 *
 *   - `?ndc=` works, but only against *current* labels and only in the
 *     hyphenated form DailyMed stores. Several real NDCs return zero results
 *     because their labels are no longer current — including, predictably, the
 *     discontinued packages this app deliberately still identifies. A drug can
 *     therefore be perfectly recognisable through RxNorm and have no warnings
 *     here at all, which is a normal outcome and not an error.
 *   - Section text is **XML only**. The `.json` endpoints return metadata —
 *     setid, title, published date — and the documented list of endpoints has
 *     no JSON route to the label body.
 *
 * ## Sections are identified by LOINC code, and which ones to show is not
 * settled here
 *
 * This module fetches a section by code and returns its text. It does not
 * decide which sections a user should see. "Warnings and Precautions" on a US
 * label runs to thousands of words written for prescribers, and putting that
 * in front of an elderly reader — in any language — is not an improvement on
 * silence. Choosing and condensing is content work that needs review.
 */

// Relative and extensioned, like the other value imports in tested modules:
// the unit tests run on plain Node, which does not know the `@/` alias.
import { attribute, type AttributedGuidance } from '../guidance/attribution.ts';
import { Strings } from '../../i18n/strings.ts';

export const DAILYMED_BASE = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';

/** Matches the other network calls; a slow lookup should not hang a scan. */
export const REQUEST_TIMEOUT_MS = 8000;

/**
 * LOINC codes for the sections worth considering.
 *
 * Boxed warning first because it is the one the FDA reserves for risks that
 * are life-threatening, and the only one short enough to be read in full by
 * the person taking the drug.
 */
export const LABEL_SECTIONS = {
  boxedWarning: '34066-1',
  warningsAndPrecautions: '43685-7',
  patientCounselling: '34076-0',
  dosageAndAdministration: '34068-7',
} as const;

export type LabelSectionName = keyof typeof LABEL_SECTIONS;

export type LabelDocument = {
  /** DailyMed's stable identifier for a label across its revisions. */
  readonly setId: string;
  readonly title: string;
  /**
   * Which revision this is. Carried because labels are revised: a translation
   * approved against version 3 is not approved against version 4, and without
   * the number there is no way to notice that it moved.
   */
  readonly version: number | null;
};

/**
 * Finds the current label documents for an NDC.
 *
 * Empty means DailyMed has no current label for this package — common for
 * discontinued ones — not that the lookup failed.
 */
export async function findLabelsByNdc(ndcFormatted: string): Promise<readonly LabelDocument[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${DAILYMED_BASE}/spls.json?ndc=${encodeURIComponent(ndcFormatted)}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      data?: { setid?: string; title?: string; spl_version?: number }[];
    };

    return (payload.data ?? [])
      .filter((entry) => typeof entry.setid === 'string')
      .map((entry) => ({
        setId: entry.setid as string,
        title: entry.title ?? '',
        version: typeof entry.spl_version === 'number' ? entry.spl_version : null,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pulls one section's text out of a label document.
 *
 * Returns null when the label has no such section, which is ordinary: most
 * drugs carry no boxed warning at all.
 */
export async function fetchLabelSection(
  document: LabelDocument,
  section: LabelSectionName
): Promise<AttributedGuidance<string> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${DAILYMED_BASE}/spls/${encodeURIComponent(document.setId)}.xml`,
      { signal: controller.signal, headers: { Accept: 'application/xml' } }
    );
    if (!response.ok) return null;

    const text = extractSectionText(await response.text(), LABEL_SECTIONS[section]);
    if (text === null) return null;

    /**
     * Returned already attributed rather than as a bare string. This text is
     * the manufacturer's words, not the app's, and the difference is the whole
     * point — a user who can say where a warning came from has something to
     * take to a pharmacist.
     */
    return attribute(text, {
      source: 'fda-label',
      label: Strings.guidance.perFdaLabel,
      citation: `DailyMed SPL ${document.setId} (${section})`,
      revision: document.version === null ? undefined : `v${document.version}`,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts the readable text of the section carrying `loincCode`.
 *
 * Scans the markup rather than parsing it. React Native ships no XML parser,
 * and adding one to reach a handful of fields would be a poor trade — but the
 * limitation is real, so this is written to fail by returning null rather than
 * by returning the wrong section: it anchors on the code, then walks forward
 * counting `<text>` depth instead of matching greedily.
 *
 * Exported for tests, which is the only way to pin behaviour against real
 * label markup without a network call.
 */
export function extractSectionText(xml: string, loincCode: string): string | null {
  const codeAt = xml.indexOf(`code="${loincCode}"`);
  if (codeAt === -1) return null;

  const textAt = xml.indexOf('<text>', codeAt);
  if (textAt === -1) return null;

  // Nested <text> elements are legal, so the first closing tag is not
  // necessarily the right one.
  let depth = 0;
  let cursor = textAt;
  let end = -1;

  while (cursor < xml.length) {
    const nextOpen = xml.indexOf('<text>', cursor);
    const nextClose = xml.indexOf('</text>', cursor);
    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + '<text>'.length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      end = nextClose;
      break;
    }
    cursor = nextClose + '</text>'.length;
  }

  if (end === -1) return null;

  const body = xml.slice(textAt + '<text>'.length, end);
  return labelMarkupToText(body);
}

/**
 * Reduces SPL markup to readable text.
 *
 * List items become lines rather than being run together: a warning that reads
 * as one long sentence when it was written as four separate risks has been
 * changed in meaning, not just in formatting. A subsection's title is a line
 * of its own too.
 *
 * XML defines five named entities; everything else arrives as a number. `&amp;`
 * is decoded last, so a label that spells out "&amp;lt;" still shows "&lt;".
 */
export function labelMarkupToText(markup: string): string | null {
  const text = markup
    // Line breaks in the markup are its indentation, not the label's: only
    // paragraphs, items, titles and breaks start a line.
    .replace(/\s+/g, ' ')
    // An item may carry its own marker as a caption ("•", "a."): that is its
    // marker, not text to add after one.
    .replace(/<item[^>]*>\s*<caption[^>]*>([\s\S]*?)<\/caption>/gi, (_, caption: string) => {
      const marker = caption.replace(/<[^>]+>/g, '').trim();
      // A lone symbol is a bullet, whichever one the label used.
      return `\n${marker.length === 0 || /^[^A-Za-z0-9]$/.test(marker) ? '•' : marker} `;
    })
    .replace(/<paragraph[^>]*>/gi, '\n')
    .replace(/<\/?title[^>]*>/gi, '\n')
    .replace(/<item[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim();

  return text.length > 0 ? text : null;
}

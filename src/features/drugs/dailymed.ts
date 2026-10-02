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

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
};
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
};

/** A character given by number ("&#174;"), as the character. */
const decodeNumbered = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));

/**
 * A superscript or subscript as plain text can show it: in raised or lowered
 * characters where every character has one ("10⁹", "B₁₂"), and otherwise
 * marked ("^b", "_(max)"). Never run into the text beside it, where "10⁹/L"
 * would read as "109/L". Except what reads the same on the line, where a mark
 * would only puzzle: ® and ™ ("DSM-IV®", not "DSM-IV^®"), and an ordinal's
 * ending ("2nd", not "2^(nd)").
 */
function script(content: string, table: Record<string, string>, mark: string): string {
  const text = decodeNumbered(content.replace(/<[^>]+>/g, '')).trim();
  if (text.length === 0) return '';
  if (mark === '^' && (/^[®™©℠]+$/.test(text) || /^(?:st|nd|rd|th)$/i.test(text))) return text;
  if ([...text].every((char) => char in table)) return [...text].map((char) => table[char]).join('');
  return text.length === 1 ? `${mark}${text}` : `${mark}(${text})`;
}

/** An ordered list's item number, in the list's own style ("Arabic", "LittleRoman", "BigAlpha"...). */
function itemNumber(count: number, style: string): string {
  const roman = () => {
    let left = count;
    let out = '';
    for (const [value, numeral] of [
      [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
    ] as const) {
      while (left >= value) {
        out += numeral;
        left -= value;
      }
    }
    return out;
  };
  const alpha = () => (count <= 26 ? String.fromCharCode(96 + count) : String(count));
  switch (style.toLowerCase()) {
    case 'littleroman':
      return count < 40 ? roman() : String(count);
    case 'bigroman':
      return count < 40 ? roman().toUpperCase() : String(count);
    case 'littlealpha':
      return alpha();
    case 'bigalpha':
      return alpha().toUpperCase();
    default:
      return String(count);
  }
}

/** Marks the end of a list item's marker, until it is known whether text follows on its line. */
const MARKER_END = '\u0001';
/** One step of a nested list's indent. Not a plain space, which the tidying below removes. */
const INDENT = ' ';

/**
 * Reduces SPL markup to readable text.
 *
 * List items become lines rather than being run together: a warning that reads
 * as one long sentence when it was written as four separate risks has been
 * changed in meaning, not just in formatting. For the same reason a nested
 * list stays nested, indented under its item, so a sub-item never reads as
 * the item's peer. A subsection's title is a line of its own too, and a
 * superscript stays raised (`script`).
 *
 * XML defines five named entities; everything else arrives as a number. `&amp;`
 * is decoded last, so a label that spells out "&amp;lt;" still shows "&lt;".
 */
export function labelMarkupToText(markup: string): string | null {
  // The lists the walk is inside, innermost last: whether each is numbered,
  // in what style, and how many of its items have gone by.
  const lists: { readonly ordered: boolean; readonly style: string; count: number }[] = [];
  const text = markup
    // Line breaks in the markup are its indentation, not the label's: only
    // paragraphs, items, titles and breaks start a line.
    .replace(/\s+/g, ' ')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, content: string) => script(content, SUPERSCRIPT, '^'))
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_, content: string) => script(content, SUBSCRIPT, '_'))
    // Lists, walked in order so each item knows how deeply it is nested. An
    // item may carry its own marker as a caption ("•", "a."): that is its
    // marker, not text to add after one; a lone symbol is a bullet, whichever.
    // An item of a numbered list without one is numbered, as the label
    // numbers it: text that says "(1 to 6)" refers to those numbers.
    .replace(
      /<list\b[^>]*>|<\/list>|<item\b[^>]*>(?:\s*<caption[^>]*>([\s\S]*?)<\/caption>)?/gi,
      (tag: string, caption?: string) => {
        if (/^<list/i.test(tag)) {
          lists.push({
            ordered: /\blistType="ordered"/i.test(tag),
            style: /\bstyleCode="([^"]*)"/i.exec(tag)?.[1] ?? '',
            count: 0,
          });
          return '';
        }
        if (/^<\/list/i.test(tag)) {
          lists.pop();
          return '';
        }
        const list = lists[lists.length - 1];
        if (list) list.count += 1;
        const depth = Math.max(1, lists.length);
        const own = (caption ?? '').replace(/<[^>]+>/g, '').trim();
        const marker =
          own.length > 0 && !/^[^A-Za-z0-9]$/.test(own)
            ? own
            : list?.ordered && own.length === 0
              ? `${itemNumber(list.count, list.style)}.`
              : depth > 1
                ? '◦'
                : '•';
        return `\n${INDENT.repeat(depth - 1)}${marker}${MARKER_END}`;
      }
    )
    .replace(/<paragraph[^>]*>/gi, '\n')
    .replace(/<\/?title[^>]*>/gi, '\n')
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
    // An item whose text starts with a paragraph keeps its text on its own
    // line; one whose next line is a nested item keeps that below it.
    // (A next line that is an item of its own, by its marker, is not text.)
    .replace(new RegExp(`${MARKER_END} *\n(?!${INDENT}|[•◦]|[^\n${MARKER_END}]{1,8}${MARKER_END})`, 'g'), ' ')
    .replace(new RegExp(`${MARKER_END} *`, 'g'), ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n')
    .replace(/ +$/gm, '')
    .trim();

  return text.length > 0 ? text : null;
}

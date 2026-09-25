import { countsInterval, endsCutOff, isPluralInterval, isSigWord, startsCutOff, wordDamage } from './field-integrity.ts';
import { fieldsOf } from './truncation.ts';
import type { FieldKind } from './field-integrity.ts';
import type { MedicationLabelFields, RecognizedTextLine } from './types.ts';

/**
 * Targeted manual fill-in: when a specific part of a line is missing or
 * misread, the user — holding the bottle with the answer printed on it — types
 * only that part, instead of retaking the photograph. Two taps beats another
 * capture, and for someone with a tremor it beats it by a lot.
 *
 * A gap is one of:
 * - `word`: a word to check and correct, shown filled in with what was read —
 *   the cut end of a line (`(50,0`, to finish as `(50,000`), the cut start of
 *   one, or a misread word (`(b`, to retype as `(50,000`). Prefilled rather
 *   than blank so the user can add to it or replace it, whichever the bottle
 *   calls for.
 * - `insert`: something missing between two words — the number in
 *   "every days" — shown as an empty box.
 *
 * Nothing here decides what the answer is: the result is the lines with the
 * user's words in them, which then go through the whole pipeline again —
 * damage detection and the edge check included — and are shown back for the
 * user to confirm. A field that still does not read whole is still withheld.
 */
export type Gap =
  | { readonly kind: 'word'; readonly line: number; readonly token: number; readonly read: string; readonly cut: boolean }
  | { readonly kind: 'insert'; readonly line: number; readonly after: number };

export const gapKey = (gap: Gap) =>
  gap.kind === 'word' ? `w:${gap.line}:${gap.token}` : `i:${gap.line}:${gap.after}`;

const tokensOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** The gaps in the lines that make up `kind`, in reading order. */
export function findGaps(
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields,
  kind: FieldKind
): Gap[] {
  const gaps: Gap[] = [];
  lines.forEach((line, index) => {
    if (!fieldsOf([index], lines, fields).includes(kind)) return;
    const tokens = tokensOf(line.text);
    if (tokens.length === 0) return;

    const cutEnd = endsCutOff(line.text, lines[index + 1]?.text);
    const cutStart = startsCutOff(line.text);

    tokens.forEach((token, position) => {
      const atCutEnd = cutEnd && position === tokens.length - 1;
      const atCutStart = cutStart && position === 0;
      const next = tokens[position + 1];
      const countMissing = next !== undefined && isPluralInterval(next) && !countsInterval(tokens, position + 1);
      const everyOrFor = /^(every|for)$/i.test(token.replace(/[^a-z]/gi, ''));
      // "mouth ee days": the word where the count should be is the misread,
      // shown as read, to be corrected ("every 7").
      const misreadCount = countMissing && !everyOrFor;
      if (atCutEnd || atCutStart || misreadCount || wordDamage(token, 'instructions') !== null) {
        gaps.push({ kind: 'word', line: index, token: position, read: token, cut: atCutEnd || atCutStart });
      }
      // "every days": the number between them is what is missing.
      if (countMissing && everyOrFor) {
        gaps.push({ kind: 'insert', line: index, after: position });
      }
    });
  });
  return gaps;
}

/**
 * The lines with the user's words put in. A gap left as it was read, or left
 * empty, changes nothing. Geometry is untouched: the words are where they were
 * on the label.
 */
export function applyFillIns(
  lines: readonly RecognizedTextLine[],
  gaps: readonly Gap[],
  typed: ReadonlyMap<string, string>
): RecognizedTextLine[] {
  return lines.map((line, index) => {
    const own = gaps.filter((gap) => gap.line === index);
    if (own.length === 0) return line;

    const tokens = tokensOf(line.text);
    const rebuilt: string[] = [];
    tokens.forEach((token, position) => {
      const word = own.find((gap) => gap.kind === 'word' && gap.token === position);
      const value = word ? (typed.get(gapKey(word)) ?? '').trim() : '';
      rebuilt.push(value.length > 0 ? value : token);

      const insert = own.find((gap) => gap.kind === 'insert' && gap.after === position);
      const inserted = insert ? (typed.get(gapKey(insert)) ?? '').trim() : '';
      if (inserted.length > 0) rebuilt.push(inserted);
    });

    const text = rebuilt.join(' ');
    return text === line.text ? line : { ...line, text };
  });
}

/** Whether a gap's box should expect a number: a missing count, or a number cut short. */
export function expectsNumber(gap: Gap): boolean {
  if (gap.kind === 'insert') return true;
  return /\d/.test(gap.read) && !isSigWord(gap.read);
}

import type { MedicationRecord } from '../medications/types.ts';
import { assessField, type FieldKind } from './field-integrity.ts';
import { isCutAtEdge, type EdgeTruncation } from './truncation.ts';
import type { MedicationLabelFields, RecognizedTextLine } from './types.ts';

/**
 * Turns a label reading into the record that is saved.
 *
 * ## Why damaged fields are dropped rather than saved and flagged
 *
 * Keeping damaged text out of the result screen is not enough if it is then
 * written to the profile: it would reappear on the medicine's own page, under
 * "how to take it", indefinitely. So a damaged dose or set of directions is
 * left out of the record entirely. The field then shows as unread, which is
 * true, and the edit screen is where the user types in what the bottle says.
 *
 * ## Why a damaged name is kept
 *
 * The asymmetry is deliberate. Directions and doses are *acted on* — a reader
 * follows them. A name is *matched* — a reader compares it with the box, and a
 * clipped `-Thyroxine` announces itself as wrong on that comparison. Refusing
 * to save would also strand the user: there is no record without a name, and
 * a label that photographs badly may never produce a clean one.
 */
export type ReadingToSave = {
  readonly record: Omit<MedicationRecord, 'id' | 'addedAt'>;
  /** Fields left out because their text was damaged, so the UI can say so first. */
  readonly dropped: readonly FieldKind[];
  /**
   * Fields saved despite damage — only ever the name, for the reasons above.
   * Reported so the screen can say so before the tap: a damaged name is hidden
   * behind a toggle on the result screen, and saving something the user has
   * not seen, without a word, would be a surprise on the medicine's own page.
   */
  readonly flagged: readonly FieldKind[];
};

export function medicationFromReading(
  fields: MedicationLabelFields,
  /**
   * Lines lost round the curve of the label. A field with any is incomplete
   * however whole its text looks — "every day" is what is left of "every
   * other day" with `other` past the edge — so it is treated as damaged.
   */
  truncation?: EdgeTruncation | null,
  /**
   * The name is the user's, typed from the bottle: not a reading, so not
   * judged as one, and never saved as incomplete.
   */
  nameTyped = false
): ReadingToSave | null {
  const name = fields.name?.text.trim();
  if (!name) return null;

  const dropped: FieldKind[] = [];
  const flagged: FieldKind[] =
    !nameTyped && (assessField('name', name).level === 'damaged' || isCutAtEdge(truncation, 'name')) ? ['name'] : [];

  function keep(kind: 'dosage' | 'instructions', text: string | undefined): string | undefined {
    const trimmed = text?.trim();
    if (!trimmed) return undefined;
    if (assessField(kind, trimmed).level === 'damaged' || isCutAtEdge(truncation, kind)) {
      dropped.push(kind);
      return undefined;
    }
    return trimmed;
  }

  const dosage = keep('dosage', fields.dosage?.text);
  const instructions = keep('instructions', fields.instructions?.text);

  return {
    record: {
      name,
      ...(dosage ? { dosage } : {}),
      ...(instructions ? { instructions } : {}),
      source: 'label-scan',
      /**
       * Always, whatever the verdict. A clean reading is still a machine's
       * reading of a photograph, and the user has the box in their hand.
       */
      needsReview: true,
      // Remembered, so the medicine's page does not identify a name its
      // reading withheld (see `readableName`) until the user takes it over.
      ...(flagged.includes('name') ? { nameIncomplete: true as const } : {}),
    },
    dropped,
    flagged,
  };
}

/**
 * The name to identify the medicine by: the name as read, but only when it
 * reads whole. A name withheld as damaged, or as cut off at the label's edge
 * ("VITAMIN D" of "VITAMIN D2"), would be matched as some other medicine, so
 * none is given for it.
 */
export function readableName(fields: MedicationLabelFields, truncation?: EdgeTruncation | null): string | null {
  const name = fields.name?.text.trim();
  if (!name) return null;
  return assessField('name', name).level === 'damaged' || isCutAtEdge(truncation, 'name') ? null : name;
}

/**
 * The lines with the name as typed in place of the name as read, in the line
 * it was read from; the lines as they were where it cannot be found. For
 * fill-in, which reads the lines again: so a name the user typed whole is
 * whole there too.
 */
export function withName(
  lines: readonly RecognizedTextLine[],
  read: string | undefined,
  typed: string
): RecognizedTextLine[] {
  const wanted = read?.trim();
  if (!wanted) return [...lines];
  const at = lines.findIndex((line) => line.text.includes(wanted));
  if (at === -1) return [...lines];
  return lines.map((line, index) => (index === at ? { ...line, text: line.text.replace(wanted, typed) } : line));
}

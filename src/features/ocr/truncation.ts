import { endsCutOff, isSigWord, startsCutOff, type FieldKind } from './field-integrity.ts';
import { classifyLine, splitProduct } from './sig-parser.ts';
import type { LinePoint, MedicationLabelFields, RecognizedTextLine } from './types.ts';

/**
 * Detects a label cut off by its own curve.
 *
 * On a narrow vial with lines running the full width of the label, the ends
 * of the longest lines are round the curve, out of the camera's sight. It is
 * not blur or light, and a brighter retake fails identically: turning the
 * bottle to show the right edge hides the left. What it looks like in the
 * engine's output is two things at once, and this requires both:
 *
 * 1. **Geometry**: several lines end together at the very edge of the text —
 *    within half a line's height of each other, measured along the text's own
 *    direction so a tilted photo does not smear the edge — and no line goes
 *    past them. They are the widest lines, not lines inset from the widest:
 *    a cut line runs out exactly where the label turns away. Shorter lines end
 *    before the edge, naturally.
 * 2. **Text**: at least two of those lines end with something missing — see
 *    `endsCutOff`. A flat label's lines also end together at its margin, but
 *    they end on whole words; a curved label's end mid-number and mid-word.
 *
 * Either alone is common and innocent. Both together, on two or more lines,
 * is the curve. It is tuned to under-trigger: a single damaged line at the
 * edge, or damaged lines that end at different places, is not called a curve.
 * A false call would only send the user to turn the bottle instead of to find
 * more light, but it would teach them that the diagnosis is noise.
 *
 * Evidence so far is thin and says so: two real captures of one bottle, both
 * cut on the right, plus hand-built flat and curved layouts. See
 * docs/curved-labels.md.
 */

export type EdgeSide = 'right' | 'left';

export type EdgeTruncation = {
  readonly side: EdgeSide;
  /**
   * Whether the curve is called — two or more lines cut at the edge. The
   * message saying the label curves needs this, and is tuned to under-trigger:
   * telling someone their flat label is curved is the worse mistake.
   * Withholding does not: a single line ending cut off at the edge of the text
   * withholds its field all the same, because what is missing may be the part
   * that matters, and withholding is the safe direction.
   */
  readonly diagnosed: boolean;
  /**
   * Lines, by index in reading order, that end at the edge with text showing
   * what they lost.
   */
  readonly cutLines: readonly number[];
  /**
   * Lines that end at the same edge with nothing in their text to show a loss.
   * They may be whole — or have lost exactly a word. Reported, not counted.
   */
  readonly edgeLines: readonly number[];
  /** The fields any line at the edge belongs to: what the reader must be told is incomplete. */
  readonly fields: readonly FieldKind[];
};

/** Lines within this fraction of a line's height of the edge are at the edge. */
const EDGE_BAND = 0.5;
/** How many lines must show a cut before the curve is called. Withholding needs one. */
const MIN_CUT_LINES = 2;
/** Too few lines with geometry say nothing about an edge. */
const MIN_LINES = 3;

type Placed = { index: number; start: number; end: number; height: number };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function cornersOf(line: RecognizedTextLine): readonly LinePoint[] | null {
  if (line.corners && line.corners.length === 4) return line.corners;
  const frame = line.frame;
  if (!frame) return null;
  const { left, top, width, height } = frame;
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

/**
 * Where each line starts and ends along the text's own direction — the page
 * turned so its lines run level — and how tall it is.
 */
function place(lines: readonly RecognizedTextLine[]): Placed[] | null {
  const shaped = lines.map((line, index) => ({ index, corners: cornersOf(line) }));
  if (shaped.some((entry) => entry.corners === null)) return null;

  const slopes = shaped.map(({ corners }) => {
    const [topLeft, topRight] = corners!;
    const run = topRight.x - topLeft.x;
    return run > 0 ? (topRight.y - topLeft.y) / run : 0;
  });
  const angle = Math.atan(median(slopes));
  const along = (point: LinePoint) => point.x * Math.cos(angle) + point.y * Math.sin(angle);

  return shaped.map(({ index, corners }) => {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners!;
    return {
      index,
      start: Math.min(along(topLeft), along(bottomLeft)),
      end: Math.max(along(topRight), along(bottomRight)),
      height: Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
    };
  });
}

const comparable = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Which field one line of the label belongs to.
 *
 * The field whose parsed text contains it, first. Failing that — a cut can
 * cost a line its field, as on the retaken vial, where the label's own edge
 * read as a leading `|` and "|Take …" was no longer recognised as directions —
 * the line's role by the parser's own classifier, judged without leading
 * punctuation (for attribution only; the text itself is not changed); then a
 * line with a word of dosing directions in it (`capsule`, `mouth`, `every`)
 * belongs to the directions; and failing all of that, a line continues the
 * directions if the line above is part of them. Nothing else is inherited: a
 * cut line of unknown role under a strength is not the strength's.
 */
/** A line's words, a number and its unit apart however printed ("20MG", "20 MG"). */
const wordsIn = (text: string) =>
  text
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/[^a-z0-9.]+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);

/** Whether `line` holds the words of `field` together, in order. */
function holds(line: string, field: string): boolean {
  const have = wordsIn(line);
  const want = wordsIn(field);
  if (want.length === 0) return false;
  for (let at = 0; at + want.length <= have.length; at += 1) {
    if (want.every((word, offset) => have[at + offset] === word)) return true;
  }
  return false;
}

/**
 * Which fields one line of the label belongs to: one, as a rule, but both
 * the name and the strength of a line that prints both ("1.25MG VITAMIN D"),
 * so that such a line cut at the edge withholds its name too. It used to
 * count only as the strength: the name "VITAMIN D" of "VITAMIN D2" was shown
 * as whole, and looked up as another medicine.
 */
function fieldOf(
  index: number,
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields,
  known: Map<number, readonly FieldKind[]>
): readonly FieldKind[] {
  const cached = known.get(index);
  if (cached) return cached;
  const text = lines[index].text;
  const part = comparable(text);

  // The fields whose parsed text contains the line; and the name, if the line
  // holds it whole (but not the strength or directions that way: "(10 MG)" in
  // a line of directions is not the strength's line).
  let kinds: FieldKind[] = (['name', 'dosage', 'instructions'] as const).filter((candidate) => {
    const field = fields[candidate]?.text;
    return (
      Boolean(field) &&
      ((part.length > 0 && comparable(field!).includes(part)) || (candidate === 'name' && holds(text, field!)))
    );
  });
  // The name's line, holding the strength too ("LISINOPRIL 20MG"): both.
  const strength = fields.dosage?.text;
  if (kinds.includes('name') && !kinds.includes('dosage') && strength && holds(text, strength)) {
    kinds = ['name', 'dosage', ...kinds.filter((kind) => kind === 'instructions')];
  }

  if (kinds.length === 0) {
    const bare = text.replace(/^[^A-Za-z0-9]+/, '');
    const role = classifyLine(bare);
    if (role === 'directions') kinds = ['instructions'];
    else if (role === 'product') {
      const product = splitProduct(bare);
      kinds = product.strength ? (product.name ? ['name', 'dosage'] : ['dosage']) : ['name'];
    } else if (role === 'unknown' && bare.split(/\s+/).some((token) => isSigWord(token) && !/^\d/.test(token))) {
      kinds = ['instructions'];
    }
  }
  if (kinds.length === 0 && index > 0 && fieldOf(index - 1, lines, fields, known).includes('instructions')) {
    kinds = ['instructions'];
  }

  known.set(index, kinds);
  return kinds;
}

/** The fields these lines belong to, in field order. Also used by the sweep's merge. */
export function fieldsOf(
  indexes: readonly number[],
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields
): FieldKind[] {
  const known = new Map<number, readonly FieldKind[]>();
  const found = new Set(indexes.flatMap((index) => fieldOf(index, lines, fields, known)));
  return (['name', 'dosage', 'instructions'] as const).filter((kind) => found.has(kind));
}

/**
 * The curve, if there is one. `lines` in reading order, as `interpretLines`
 * orders them; `fields` as parsed from those lines. `null` means no edge was
 * found — including when there is no geometry to judge from.
 */
export function detectEdgeTruncation(
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields
): EdgeTruncation | null {
  if (lines.length < MIN_LINES) return null;
  const placed = place(lines);
  if (!placed) return null;
  const tolerance = EDGE_BAND * median(placed.map((line) => line.height));

  const judge = (side: EdgeSide): EdgeTruncation | null => {
    const edge =
      side === 'right'
        ? Math.max(...placed.map((line) => line.end))
        : Math.min(...placed.map((line) => line.start));
    const atEdge = placed
      .filter((line) => Math.abs((side === 'right' ? line.end : line.start) - edge) <= tolerance)
      .map((line) => line.index);
    const cut = atEdge.filter((index) =>
      side === 'right' ? endsCutOff(lines[index].text, lines[index + 1]?.text) : startsCutOff(lines[index].text)
    );
    if (cut.length === 0) return null;

    return {
      side,
      diagnosed: cut.length >= MIN_CUT_LINES && atEdge.length >= MIN_CUT_LINES,
      cutLines: cut,
      edgeLines: atEdge.filter((index) => !cut.includes(index)),
      fields: fieldsOf(atEdge, lines, fields),
    };
  };

  // A diagnosis on either side beats a lone cut line on the other.
  const right = judge('right');
  const left = judge('left');
  if (right?.diagnosed || !left) return right;
  if (left.diagnosed || !right) return left;
  return right;
}

/** Whether a field has lines at a cut edge: incomplete, whatever its own text looks like. */
export function isCutAtEdge(truncation: EdgeTruncation | null | undefined, kind: FieldKind): boolean {
  return truncation?.fields.includes(kind) ?? false;
}

/**
 * The edge to judge a reading by once the user has filled some of its fields
 * in: the new reading's own, and every field the old one withheld at the edge
 * that the user did not fill.
 *
 * Without it, filling in what was cut made a field nobody looked at read as
 * whole. With the directions' cut lines completed, no line at the edge looks
 * cut any more, so no edge is found at all, and a name that ran to the same
 * edge, with nothing in its own text to show a loss ("LISINOPRIL" of
 * "LISINOPRIL AND HYDROCHLOROTHIAZIDE"), then read as whole, and was looked up
 * as another medicine.
 */
export function keepWithheld(
  before: EdgeTruncation | null | undefined,
  after: EdgeTruncation | null | undefined,
  filled: readonly FieldKind[]
): EdgeTruncation | null {
  const kept = (before?.fields ?? []).filter((kind) => !filled.includes(kind) && !(after?.fields ?? []).includes(kind));
  if (kept.length === 0) return after ?? null;
  // The new reading's edge if it found one, else the old one's (its side, and
  // whether it was the curve), but with only these fields withheld.
  const base = (after ?? before)!;
  const own = after?.fields ?? [];
  return {
    ...base,
    fields: (['name', 'dosage', 'instructions'] as const).filter((kind) => own.includes(kind) || kept.includes(kind)),
  };
}

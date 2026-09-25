import { endsCutOff, startsCutOff, type FieldKind } from './field-integrity.ts';
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
/** How many lines must show a cut before the curve is called. */
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
 * punctuation (for attribution only; the text itself is not changed); and
 * failing that, the field of the line directly above, which a continuation
 * like "units) by mouth every" belongs to.
 */
function fieldOf(
  index: number,
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields,
  known: Map<number, FieldKind | null>
): FieldKind | null {
  if (known.has(index)) return known.get(index)!;
  const text = lines[index].text;
  const part = comparable(text);

  let kind: FieldKind | null =
    (['name', 'dosage', 'instructions'] as const).find((candidate) => {
      const field = fields[candidate]?.text;
      return Boolean(field) && part.length > 0 && comparable(field!).includes(part);
    }) ?? null;

  if (!kind) {
    const bare = text.replace(/^[^A-Za-z0-9]+/, '');
    const role = classifyLine(bare);
    if (role === 'directions') kind = 'instructions';
    else if (role === 'product') kind = splitProduct(bare).strength ? 'dosage' : 'name';
  }
  if (!kind && index > 0) kind = fieldOf(index - 1, lines, fields, known);

  known.set(index, kind);
  return kind;
}

/** The fields these lines belong to, in field order. */
function fieldsOf(
  indexes: readonly number[],
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields
): FieldKind[] {
  const known = new Map<number, FieldKind | null>();
  const found = new Set(indexes.map((index) => fieldOf(index, lines, fields, known)));
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
    if (atEdge.length < MIN_CUT_LINES) return null;

    const cut = atEdge.filter((index) =>
      side === 'right' ? endsCutOff(lines[index].text, lines[index + 1]?.text) : startsCutOff(lines[index].text)
    );
    if (cut.length < MIN_CUT_LINES) return null;

    return {
      side,
      cutLines: cut,
      edgeLines: atEdge.filter((index) => !cut.includes(index)),
      fields: fieldsOf(atEdge, lines, fields),
    };
  };

  return judge('right') ?? judge('left');
}

/** Whether a field has lines at a cut edge: incomplete, whatever its own text looks like. */
export function isCutAtEdge(truncation: EdgeTruncation | null | undefined, kind: FieldKind): boolean {
  return truncation?.fields.includes(kind) ?? false;
}

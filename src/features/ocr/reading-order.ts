// Relative with extensions: run under plain Node by the tests and the harness.
import type { LinePoint, RecognizedTextLine } from './types.ts';

/**
 * Puts recognised lines into the order a person reads a label: rows top to
 * bottom, and left to right within a row.
 *
 * ## Why this is not in native code
 *
 * It used to be, once per platform. Ordering is a heuristic, and it has to be
 * tuned against real labels; in Swift and Kotlin it could only be tuned by
 * rebuilding and photographing again. Here it runs under Node, against the
 * geometry recorded in the evaluation corpus, so a change can be checked
 * against every label at once — and both platforms share one implementation.
 *
 * ## Rows on a curved label
 *
 * The native versions banded lines by the height of their top edge: within
 * half a line of the row's first line meant the same row. That assumes rows
 * are horizontal, and on a vial they are not. The bottle curves away from the
 * lens, a printed line bends with it, and the engine often breaks one printed
 * line into pieces whose tops sit at different heights. On the vial that
 * prompted this, `1.25MG(50,` and `000 UNIT)` came back in separate rows, the
 * second half first.
 *
 * So each line's own slope, from its corner points, is used. A line joins a
 * row when the edge it presents to the nearest piece of that row sits where
 * that piece's facing edge, continued along the two pieces' slope, says it
 * should be — within half a line height. Edges rather than centres: a short
 * tilted piece beside a long level line has its centre well away from the
 * long line's, though the two meet exactly where the print runs on.
 * A curve is followed piece by piece, because each piece is compared with its
 * neighbour rather than with the start of the row, and a tilted photograph
 * tilts every row alike and is handled the same way.
 *
 * ## What it does not do
 *
 * It orders rows, not columns. On a label whose columns share rows, lines are
 * interleaved across them, as they always were; the parser classifies lines by
 * content for exactly that reason.
 *
 * A line with no geometry cannot be placed, so it stays where the engine put
 * it: straight after the line that preceded it there. Moving it to the end
 * would cut it out of the middle of whatever it belonged to — `at bedtime`
 * parted from the direction it finishes. Readings recorded before geometry
 * existed, already sorted natively, therefore pass through unchanged.
 */
export function orderLines(lines: readonly RecognizedTextLine[]): RecognizedTextLine[] {
  const placed: Placed[] = [];

  lines.forEach((line, order) => {
    const position = place(line, order);
    if (position) placed.push(position);
  });

  if (placed.length === 0) return [...lines];

  const rows: Placed[][] = [];
  const topDown = [...placed].sort((a, b) => a.cy - b.cy || a.order - b.order);

  for (const candidate of topDown) {
    let best: { row: Placed[]; offset: number } | null = null;
    for (const row of rows) {
      const offset = misfit(row, candidate);
      if (offset !== null && (best === null || offset < best.offset)) best = { row, offset };
    }
    if (best) best.row.push(candidate);
    else rows.push([candidate]);
  }

  // Rows are compared at one shared x, so that on a tilted photograph a short
  // row at the high end of the tilt does not jump ahead of a long one. The
  // projection uses the photograph's median slope, not the nearest piece's
  // own: one short, steep piece projected across the whole label can land
  // anywhere.
  const referenceX = placed.reduce((sum, line) => sum + line.cx, 0) / placed.length;
  const tilt = median(placed.map((line) => line.slope));
  const rowHeightAt = (row: Placed[]) => {
    const nearest = row.reduce((a, b) =>
      Math.abs(b.cx - referenceX) < Math.abs(a.cx - referenceX) ? b : a
    );
    return nearest.cy + tilt * (referenceX - nearest.cx);
  };

  const orderedPlaced = rows
    .map((row) => ({ row, height: rowHeightAt(row), first: Math.min(...row.map((l) => l.order)) }))
    .sort((a, b) => a.height - b.height || a.first - b.first)
    .flatMap(({ row }) => [...row].sort((a, b) => a.left - b.left || a.order - b.order));

  // Each unplaced line follows the placed line that preceded it in engine
  // order; any before the first placed line lead.
  const following = new Map<number, RecognizedTextLine[]>();
  let anchor = -1;
  lines.forEach((line, order) => {
    if (placed.some((entry) => entry.order === order)) {
      anchor = order;
    } else {
      following.set(anchor, [...(following.get(anchor) ?? []), line]);
    }
  });

  return [
    ...(following.get(-1) ?? []),
    ...orderedPlaced.flatMap((entry) => [entry.line, ...(following.get(entry.order) ?? [])]),
  ];
}

/**
 * How far a line sits from where the row predicts it would be, or null if it
 * does not belong to the row at all.
 */
function misfit(row: readonly Placed[], candidate: Placed): number | null {
  // Pieces of one row sit side by side. A line overlapping a member
  // horizontally is above or below it, whatever the heights say.
  if (row.some((member) => overlapsHorizontally(member, candidate))) return null;

  const nearest = row.reduce((a, b) => (gap(b, candidate) < gap(a, candidate) ? b : a));

  // Compare the two edges that face each other, each found along its own
  // piece's slope, and carry the left one across the gap along the average
  // of the two slopes — the tangent halfway between them on a curve.
  const [left, right] = nearest.cx <= candidate.cx ? [nearest, candidate] : [candidate, nearest];
  const leftEdge = left.cy + left.slope * (left.right - left.cx);
  const rightEdge = right.cy + right.slope * (right.left - right.cx);
  const expected = leftEdge + ((left.slope + right.slope) / 2) * (right.left - left.right);
  const offset = Math.abs(rightEdge - expected);

  return offset <= ROW_TOLERANCE * Math.min(candidate.height, nearest.height) ? offset : null;
}

/** Of the smaller line's height: how far off its predicted row a line may sit. */
const ROW_TOLERANCE = 0.5;

/**
 * Of the narrower line's width: overlap tolerated between neighbours on one
 * row. Engines pad their boxes, so touching pieces overlap slightly.
 */
const HORIZONTAL_OVERLAP_ALLOWED = 0.3;

/**
 * Steeper than this, a slope is not trusted: past 45° the text is sideways
 * rather than tilted, and extrapolating along it would place lines anywhere.
 */
const MAX_SLOPE = 1;

type Placed = {
  readonly line: RecognizedTextLine;
  /** Position in the engine's output, so equal positions order stably. */
  readonly order: number;
  readonly left: number;
  readonly right: number;
  readonly cx: number;
  readonly cy: number;
  readonly height: number;
  /** Rise over run of the top edge; image y grows downwards. */
  readonly slope: number;
};

function place(line: RecognizedTextLine, order: number): Placed | null {
  const corners = line.corners;
  if (corners && corners.length === 4 && corners.every(isFinitePoint)) {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const xs = corners.map((point) => point.x);
    const run = topRight.x - topLeft.x;
    const slope = run > 0 ? (topRight.y - topLeft.y) / run : 0;
    const height = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
    if (height > 0) {
      return {
        line,
        order,
        left: Math.min(...xs),
        right: Math.max(...xs),
        cx: mean(xs),
        cy: mean(corners.map((point) => point.y)),
        height,
        slope: Math.abs(slope) <= MAX_SLOPE ? slope : 0,
      };
    }
  }

  const frame = line.frame;
  if (
    frame &&
    [frame.left, frame.top, frame.width, frame.height].every(Number.isFinite) &&
    frame.height > 0
  ) {
    return {
      line,
      order,
      left: frame.left,
      right: frame.left + frame.width,
      cx: frame.left + frame.width / 2,
      cy: frame.top + frame.height / 2,
      height: frame.height,
      // An axis-aligned frame carries no slope. Lines placed from frames alone
      // are banded as if the row were level.
      slope: 0,
    };
  }

  return null;
}

function overlapsHorizontally(a: Placed, b: Placed): boolean {
  const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  return overlap > HORIZONTAL_OVERLAP_ALLOWED * Math.min(a.right - a.left, b.right - b.left);
}

function gap(a: Placed, b: Placed): number {
  return Math.max(0, a.left - b.right, b.left - a.right);
}

function isFinitePoint(point: LinePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(a: LinePoint, b: LinePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

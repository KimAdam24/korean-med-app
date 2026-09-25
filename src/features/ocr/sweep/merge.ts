import { assessField, endsCutOff, startsCutOff, type FieldKind } from '../field-integrity.ts';
import { interpretLines } from '../interpret-lines.ts';
import { orderLines } from '../reading-order.ts';
import { fieldsOf, type EdgeTruncation } from '../truncation.ts';
import type { LabelRecognitionResult, MedicationLabelFields, RecognizedTextLine } from '../types.ts';

/**
 * The sweep's merge: many readings of one label, taken while the bottle
 * turns, made into one — without ever making up a line.
 *
 * A stitched sentence looks authoritative, which is why this is the part of
 * the sweep that can do the most harm. So it is built to three rules:
 *
 * 1. **Never blend.** Every line of the result is one frame's reading of that
 *    line, verbatim. Two partial readings of one line are never combined,
 *    however obviously they fit: `Take 1 capsule (50,0` from one frame and
 *    `ke 1 capsule (50,000` from another stay two partial readings.
 * 2. **Replace only with a strictly better reading of the same line.** A line
 *    is replaced only if it ends cut off, and only by a reading that contains
 *    it entirely and goes further — the same line with more of it visible.
 *    "The same line" is decided conservatively (see `sameLine`); anything in
 *    doubt keeps the reading it had.
 * 3. **Judge the result, not the frames.** The merged reading goes through the
 *    whole pipeline again — damage detection, the edge check — and a line
 *    still cut off at the end withholds its field, whatever its text says.
 *
 * The skeleton is one frame — the cleanest single reading so far — whose
 * layout and geometry are kept. Lines are only ever improved within it; a line
 * no base frame has is not added. So when some frame read the whole label,
 * the result is simply that frame, and the merge adds nothing; when none did,
 * it can complete the cut lines of the best one from others. Either way the
 * result is never worse than the best single frame.
 *
 * Pure: frames in, reading out. Knows nothing of cameras, and cannot — see
 * `sweep-boundary.test.ts`.
 */

/** What one frame of the sweep contributes: the recogniser's lines, and nothing else. */
export type SweepFrame = readonly RecognizedTextLine[];

type Analysed = {
  /** In reading order. */
  readonly lines: readonly RecognizedTextLine[];
  readonly keys: readonly string[];
  /** Whether each line ends (or starts) cut off. */
  readonly cut: readonly boolean[];
  readonly score: number;
};

export type SweepState = { readonly frames: readonly Analysed[]; readonly seen: number };

export const EMPTY_SWEEP: SweepState = { frames: [], seen: 0 };

/** Frames kept for merging. At about three a second, twenty seconds of turning. */
const MAX_FRAMES = 60;
/** A frame with fewer lines than this is a glimpse, not a reading of the label. */
const MIN_FRAME_LINES = 3;
/** Shorter than this, containment says nothing: `days` is inside too much. */
const MIN_KEY = 6;

const keyOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

function analyse(frame: SweepFrame): Analysed {
  const lines = orderLines(frame);
  const cut = lines.map(
    (line, index) => endsCutOff(line.text, lines[index + 1]?.text) || startsCutOff(line.text)
  );
  const confidence =
    lines.reduce((sum, line) => sum + (line.confidence ?? 0), 0) / Math.max(1, lines.length);
  return {
    lines,
    keys: lines.map((line) => keyOf(line.text)),
    cut,
    // More lines, fewer of them cut; confidence breaks ties, and only ties.
    score: lines.length * 2 - cut.filter(Boolean).length + confidence / 10,
  };
}

/** Adds one frame. Frames too sparse to be a reading of the label are counted and dropped. */
export function addFrame(state: SweepState, frame: SweepFrame): SweepState {
  const seen = state.seen + 1;
  if (frame.length < MIN_FRAME_LINES) return { frames: state.frames, seen };

  let frames = [...state.frames, analyse(frame)];
  if (frames.length > MAX_FRAMES) {
    // The oldest goes, unless it is the best — the base must never be lost.
    const best = bestIndex(frames);
    frames = frames.filter((_, index) => index !== (best === 0 ? 1 : 0));
  }
  return { frames, seen };
}

function bestIndex(frames: readonly Analysed[]): number {
  let best = 0;
  frames.forEach((frame, index) => {
    if (frame.score > frames[best].score) best = index;
  });
  return best;
}

/**
 * Whether two keys could be readings of the same line: one inside the other.
 * Short keys only count when identical.
 */
function related(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a.length < 3 || b.length < 3) return a === b;
  return a.includes(b) || b.includes(a);
}

/**
 * Whether `candidate` (line `j` of `frame`) is a strictly better reading of
 * the base's line `i`: it contains it, goes further — but not so much further
 * that it must be two lines run together — contains no other line of the base,
 * and a neighbour on one side agrees.
 */
function sameLine(base: Analysed, i: number, frame: Analysed, j: number): boolean {
  const own = base.keys[i];
  const theirs = frame.keys[j];
  if (own.length < MIN_KEY || theirs.length <= own.length || !theirs.includes(own)) return false;

  // A cut hides a few characters at the curve, not a second line's worth.
  if (theirs.length > own.length + Math.max(8, own.length * 0.6)) return false;

  // Two base lines inside one reading: the engine joined them. Not this line.
  const containsAnother = base.keys.some(
    (other, index) => index !== i && other.length >= MIN_KEY && theirs.includes(other) && !own.includes(other)
  );
  if (containsAnother) return false;

  return related(base.keys[i - 1], frame.keys[j - 1]) || related(base.keys[i + 1], frame.keys[j + 1]);
}

export type MergedReading = {
  /** The recognised result, as a single capture's would be, of the merged lines. */
  readonly result: Extract<LabelRecognitionResult, { status: 'recognized' }>;
  /** Frames read, and frames kept as readings of the label. */
  readonly seen: number;
  readonly used: number;
  /** Lines, by index in `result.lines`, whose text came from another frame than the base. */
  readonly replaced: readonly number[];
  /** Lines that still end cut off. Their fields are withheld. */
  readonly stillCut: readonly number[];
  /** Every field read, readable, and nothing cut: the sweep can stop. */
  readonly complete: boolean;
};

export function mergeSweep(state: SweepState): MergedReading | null {
  if (state.frames.length === 0) return null;
  const base = state.frames[bestIndex(state.frames)];

  const lines = [...base.lines];
  const replaced: number[] = [];

  base.lines.forEach((line, i) => {
    if (!base.cut[i]) return;

    let best: { line: RecognizedTextLine; key: string; cut: boolean } | null = null;
    for (const frame of state.frames) {
      if (frame === base) continue;
      frame.lines.forEach((candidate, j) => {
        if (!sameLine(base, i, frame, j)) return;
        const key = frame.keys[j];
        const cut = frame.cut[j];
        // A complete reading beats a cut one; then the longer; then the surer.
        const better =
          best === null ||
          (best.cut && !cut) ||
          (best.cut === cut &&
            (key.length > best.key.length ||
              (key.length === best.key.length && (candidate.confidence ?? 0) > (best.line.confidence ?? 0))));
        if (better) best = { line: candidate, key, cut };
      });
    }

    const chosen = best as { line: RecognizedTextLine } | null;
    if (chosen) {
      // The base's geometry — where this line sits on the label — with the
      // better reading's text and confidence, verbatim.
      lines[i] = { ...line, text: chosen.line.text, confidence: chosen.line.confidence };
      replaced.push(i);
    }
  });

  const recognised = interpretLines(lines);
  if (recognised.status !== 'recognized') return null;
  const ordered = recognised.lines ?? lines;
  const inResult = (i: number) => ordered.indexOf(lines[i]);

  // Judged again on the merged text, in the base's order: a line that was cut
  // is still cut unless its reading now ends — and starts — whole.
  const stillCut = lines
    .map((line, i) => ({ line, i }))
    .filter(
      ({ line, i }) =>
        base.cut[i] && (endsCutOff(line.text, lines[i + 1]?.text) || startsCutOff(line.text))
    )
    .map(({ i }) => inResult(i))
    .filter((index) => index >= 0);

  const truncation = withStillCut(recognised.truncation ?? null, stillCut, ordered, recognised.fields, base);
  const result = { ...recognised, truncation };

  return {
    result,
    seen: state.seen,
    used: state.frames.length,
    replaced: replaced.map(inResult).filter((index) => index >= 0),
    stillCut,
    complete: stillCut.length === 0 && allReadable(result.fields, truncation),
  };
}

/**
 * The merged reading's edge verdict, with every still-cut line's field added.
 * The geometric check alone would miss a lone cut line in a merge whose other
 * lines were completed; its field is withheld all the same.
 */
function withStillCut(
  found: EdgeTruncation | null,
  stillCut: readonly number[],
  lines: readonly RecognizedTextLine[],
  fields: MedicationLabelFields,
  base: Analysed
): EdgeTruncation | null {
  if (stillCut.length === 0) return found;
  const cutFields = fieldsOf(stillCut, lines, fields);
  const all = new Set<FieldKind>([...(found?.fields ?? []), ...cutFields]);
  return {
    side: found?.side ?? 'right',
    diagnosed: found?.diagnosed ?? base.cut.filter(Boolean).length >= 2,
    cutLines: [...new Set([...(found?.cutLines ?? []), ...stillCut])],
    edgeLines: found?.edgeLines ?? [],
    fields: (['name', 'dosage', 'instructions'] as const).filter((kind) => all.has(kind)),
  };
}

function allReadable(fields: MedicationLabelFields, truncation: EdgeTruncation | null): boolean {
  return (['name', 'dosage', 'instructions'] as const).every((kind) => {
    const text = fields[kind]?.text;
    return Boolean(text) && !truncation?.fields.includes(kind) && assessField(kind, text!).level === 'readable';
  });
}

// Relative with extensions: run under plain Node by the tests and the report.
import { assessField, type FieldKind } from '../field-integrity.ts';
import { interpretLines } from '../interpret-lines.ts';
import { isCutAtEdge, type EdgeSide, type EdgeTruncation } from '../truncation.ts';
import type { RecognizedTextLine } from '../types.ts';

/**
 * What happened to one field of one label, judged the way the reader meets it.
 *
 * Ordered by how much it matters, worst first. The pipeline is allowed to miss
 * — a withheld field sends the reader to the bottle, which is safe. It is not
 * allowed to be wrong.
 */
export type Outcome =
  /** Shown as the value, and not what the label says. Must never happen. */
  | 'wrong'
  /** Not shown as a value: absent, or shown only as damaged. A safe miss. */
  | 'withheld'
  /** Shown as the value, and it is what the label says. */
  | 'correct';

const RANK: Record<Outcome, number> = { wrong: 0, withheld: 1, correct: 2 };

export function isWorse(outcome: Outcome, than: Outcome): boolean {
  return RANK[outcome] < RANK[than];
}

/**
 * What a person reads off the label. An array lists every rendering accepted
 * as right — `1.25 MG` and `50,000 UNIT` are both the strength of the same
 * capsule. `null` means the label does not print this field at all.
 */
export type Truth = string | readonly string[] | null;

export type EvalCase = {
  readonly id: string;
  /** What was photographed and how. Conditions are what make a case hard. */
  readonly description: string;
  /**
   * `synthetic` lines were written by hand to a label's shape, not produced
   * by an engine; see `corpus-synthetic`.
   */
  readonly source: 'real-label' | 'template' | 'synthetic';
  /** `null` until the lines are captured and the engine is known. */
  readonly engine: 'android-mlkit' | 'ios-vision' | null;
  readonly truth: { readonly [K in FieldKind]: Truth };
  /**
   * The engine's lines, verbatim apart from redaction. `null` until captured —
   * the case is then reported as pending rather than silently skipped.
   */
  readonly lines: readonly RecognizedTextLine[] | null;
  /**
   * Set by the person who redacted a real label's identifying lines. Required
   * before a real label's lines may be committed; see the corpus header.
   */
  readonly redacted?: true;
  /**
   * The outcome each field currently achieves. A ratchet: a change that makes
   * a field worse fails the suite. One that makes it better is reported, and
   * should raise this.
   */
  readonly expected?: { readonly [K in FieldKind]?: Outcome };
  readonly expectedVerdict?: 'ok' | 'degraded' | 'unreadable';
  /**
   * The curved edge this reading should be diagnosed with, and the fields cut
   * by it. Absent means none: a diagnosis where none is expected fails the
   * suite, so the detector cannot quietly start crying wolf.
   */
  readonly expectedEdge?: {
    readonly side: EdgeSide;
    readonly fields: readonly FieldKind[];
    /** Whether the curve is called, or a lone cut line only withholds its field. */
    readonly diagnosed: boolean;
  };
};

export type CaseScore =
  | { readonly id: string; readonly status: 'pending' }
  | {
      readonly id: string;
      readonly status: 'scored';
      readonly verdict: 'ok' | 'degraded' | 'unreadable';
      readonly fields: { readonly [K in FieldKind]: { outcome: Outcome; shown?: string } };
      readonly edge: EdgeTruncation | null;
    };

export const FIELD_KINDS: readonly FieldKind[] = ['name', 'dosage', 'instructions'];

/**
 * Case, spacing and a final full stop do not change what a direction says.
 * Everything else does — including spaces *inside* the text, since `MOUTHUP
 * TO` and `MOUTH UP TO` differ by exactly the space that carries the meaning.
 */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\.$/, '');
}

function matches(shown: string, truth: Truth): boolean {
  if (truth === null) return false;
  const accepted = typeof truth === 'string' ? [truth] : truth;
  return accepted.some((candidate) => normalise(candidate) === normalise(shown));
}

/**
 * Scores one field.
 *
 * "Shown as the value" means readable under `assessField` — the same test the
 * result screen applies. It deliberately ignores the read's overall verdict:
 * a degraded read still shows its readable fields behind "show what was
 * read", so a wrong one there is still wrong.
 */
export function scoreField(
  kind: FieldKind,
  text: string | undefined,
  truth: Truth,
  /** Lost round the curve of the label: withheld, as the result screen withholds it. */
  cutAtEdge = false
): Outcome {
  const shown =
    !cutAtEdge && text !== undefined && text.trim().length > 0 && assessField(kind, text).level === 'readable';
  if (!shown) return truth === null && !text ? 'correct' : 'withheld';
  return matches(text, truth) ? 'correct' : 'wrong';
}

export function scoreCase(entry: EvalCase): CaseScore {
  if (entry.lines === null) return { id: entry.id, status: 'pending' };

  const result = interpretLines(entry.lines);
  const fieldsRead = result.status === 'recognized' ? result.fields : {};
  const edge = result.status === 'recognized' ? (result.truncation ?? null) : null;

  const fields = Object.fromEntries(
    FIELD_KINDS.map((kind) => {
      const text = fieldsRead[kind]?.text;
      const outcome = scoreField(kind, text, entry.truth[kind], isCutAtEdge(edge, kind));
      return [kind, { outcome, shown: text }];
    })
  ) as { [K in FieldKind]: { outcome: Outcome; shown?: string } };

  return {
    id: entry.id,
    status: 'scored',
    // Absent quality reads as not degraded, as it does on the result screen.
    verdict:
      result.status !== 'recognized'
        ? 'unreadable'
        : result.quality?.level === 'degraded'
          ? 'degraded'
          : 'ok',
    fields,
    edge,
  };
}

/**
 * One line of text as the platform's recogniser grouped it.
 *
 * "Line" means whatever the engine calls a line, and the two engines disagree:
 * Vision returns observations, ML Kit returns blocks containing lines. Both
 * native implementations flatten and re-sort into top-to-bottom, left-to-right
 * reading order before returning, so consumers get one shape — but nothing
 * guarantees the two platforms split the *same* label into the same lines.
 * Parsing above this layer must not depend on a particular grouping.
 */
export type RecognizedLine = {
  /** Trimmed. Never empty — empty lines are dropped natively. */
  readonly text: string;
  /**
   * `0`–`1`: Vision's top-candidate confidence on iOS, `Text.Line.getConfidence()`
   * on Android.
   *
   * The two scales come from different models and are not comparable — a 0.8
   * from one engine does not mean what a 0.8 from the other does — so any
   * threshold applied to this must be calibrated per platform.
   *
   * Nullable because an engine may not report one. Treat `null` as *unknown*,
   * never as good.
   */
  readonly confidence: number | null;
};

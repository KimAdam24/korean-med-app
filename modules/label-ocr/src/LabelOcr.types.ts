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
   * `0`–`1` on iOS, from Vision's top candidate.
   *
   * **`null` on Android**, because ML Kit's documented `Text.Line` surface has
   * no per-line confidence. Treat `null` as *unknown*, never as good: a record
   * built from unknown-confidence text still needs the user to confirm it.
   */
  readonly confidence: number | null;
};

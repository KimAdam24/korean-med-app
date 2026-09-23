/** A point in image pixels, origin top left. */
export type RecognizedPoint = { readonly x: number; readonly y: number };

/**
 * One line of text as the platform's recogniser grouped it.
 *
 * "Line" means whatever the engine calls a line, and the two engines disagree:
 * Vision returns observations, ML Kit returns blocks containing lines. Both
 * native implementations flatten to one list, **in the engine's own order**:
 * reading order is decided in TypeScript, from the geometry below, where it can
 * be tested against real labels. Nothing guarantees the two platforms split the
 * *same* label into the same lines, so parsing must not depend on a grouping.
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
  /**
   * Axis-aligned box in pixels of the image as the engine processed it, origin
   * top left. On iOS, pixels of the EXIF-oriented image — or Vision's
   * normalised units if the file did not state its size. Null when the engine
   * gave no geometry for this line.
   */
  readonly frame: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  } | null;
  /**
   * The line's four corners, clockwise from top left, in the same space as
   * `frame`. Not necessarily a rectangle — on a curved label these carry the
   * slope that `frame` loses. Null when the engine gave none.
   */
  readonly corners: readonly RecognizedPoint[] | null;
};

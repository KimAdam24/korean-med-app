/**
 * What this version of the app offers, and what it keeps hidden.
 *
 * On 2026-09-28 the app was cut down to: a photo (camera or gallery) or a
 * barcode in; the medicine identified; what its FDA label says it is approved
 * to treat; the strength and directions as read; saved to the list; reminders.
 *
 * Everything below is hidden, not removed: the code, and its tests, are all
 * still here, and setting a flag back to `true` restores the feature as it
 * was. The whole app as it stood before the cut is on the branch
 * `archive/full-app-2026-09-28`. See `docs/scope.md` for why each is hidden.
 */
export const Scope: Readonly<{
  /** Reading a curved label while the bottle turns (Android). */
  sweep: boolean;
  /**
   * Typing in, from the bottle, the words the camera saw only part of. The
   * only thing that recovered a curved-label reading without a retake.
   */
  fillIn: boolean;
  /**
   * Telling the user a label curves round the bottle, and to turn it. The
   * detection behind it stays on: a name, strength or directions cut off at
   * the label's edge is still withheld, and said to be.
   */
  curveMessage: boolean;
  /** 식약처's Korean ingredient names, and the ingredient lookup that feeds them. */
  koreanDrugNames: boolean;
}> = {
  sweep: false,
  fillIn: false,
  curveMessage: false,
  koreanDrugNames: false,
};

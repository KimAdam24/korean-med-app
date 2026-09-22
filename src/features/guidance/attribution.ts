import type { Bilingual } from '@/i18n/strings';

/**
 * Where a medical claim came from, carried all the way to the screen.
 *
 * ## Why this is a type and not a convention
 *
 * Every statement this app makes about a medicine is someone else's: the FDA's,
 * RxNorm's, a published interaction list's. Saying so is worth doing for three
 * separate reasons, and the third is the one that shapes the code.
 *
 * It is honest. It gives the user something concrete to take to a pharmacist —
 * "the app said this comes from the FDA label" is a conversation opener in a way
 * "an app told me" is not. And pointing at an authority is a materially
 * different act from being one, which matters for how the app is read by a
 * regulator as much as by a patient.
 *
 * Because that third reason is structural rather than cosmetic, attribution is
 * made impossible to omit: guidance is only ever handled as
 * {@link AttributedGuidance}, so there is no shape a warning can take that does
 * not carry its source. A convention would be followed until the one screen
 * where it was not.
 */

/** The sources this app is permitted to quote. */
export type SourceId =
  /** The manufacturer's FDA-approved label, via DailyMed. */
  | 'fda-label'
  /** RxNorm, for the identity of a product and its ingredients. */
  | 'rxnorm'
  /** ONC high-priority drug–drug interaction list. */
  | 'onc-high-priority'
  /**
   * CredibleMeds QTdrugs list.
   *
   * Listed because the engine is built to accept it, **not** because it may be
   * used. AZCERT's terms license the list for non-commercial use by government,
   * academic, not-for-profit and self-employed healthcare users, and reproducing
   * it elsewhere requires a licence. Shipping it in a distributed app is not
   * covered by the terms as written.
   */
  | 'crediblemeds';

export type Attribution = {
  readonly source: SourceId;
  /**
   * What the user sees, e.g. "미국 FDA 허가사항 기준".
   *
   * Short by design. The purpose is to say whose claim this is, not to explain
   * the source — a sentence of provenance attached to every warning becomes
   * wallpaper and stops being read.
   */
  readonly label: Bilingual;
  /**
   * Precise enough for a reviewer to find the original again — a list version
   * and row, or an SPL set id. Never displayed: it is for the person checking
   * the app, not the person using it.
   */
  readonly citation: string;
  /**
   * Which revision of the source this was taken from, where the source has
   * them. A translation approved against one revision of a label is not
   * approved against the next, and without this there is no way to notice.
   */
  readonly revision?: string;
};

/**
 * Anything shown to the user that asserts something about their medicine.
 *
 * Generic over its content so the same guarantee covers an interaction finding,
 * a label section, and whatever §3.2 eventually renders — without any of them
 * being able to reach a screen unattributed.
 */
export type AttributedGuidance<T> = {
  readonly content: T;
  readonly attribution: Attribution;
};

export function attribute<T>(content: T, attribution: Attribution): AttributedGuidance<T> {
  return { content, attribution };
}

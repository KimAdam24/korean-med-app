import type { Attribution } from '@/features/guidance/attribution';

/**
 * Drug–drug interaction checking (spec §3.4).
 *
 * ## Why the rule table is small on purpose
 *
 * NLM discontinued its free interaction API on 2 January 2024, so the
 * alternatives are a commercial licence or a published, curated list. The
 * decision taken was the ONC high-priority list plus CredibleMeds' QT set —
 * and the narrowness is a feature rather than a compromise.
 *
 * An exhaustive interaction database returns something for almost any pair of
 * medicines. Shown to an elderly reader managing six prescriptions, that is
 * indistinguishable from noise, and the practical result is that every warning
 * gets dismissed, including the one that mattered. A list of combinations that
 * genuinely should not happen is short enough to be read.
 *
 * ## Why every rule must cite a source
 *
 * `source` is required by the type, not optional, so a rule cannot exist
 * without one. This app does not generate medical claims, and an interaction
 * warning with no provenance is exactly that — indistinguishable, once stored,
 * from one a pharmacist put there.
 */

/**
 * What the user should do, not how the literature grades the mechanism.
 *
 * Deliberately two values. Severity scales exist with five or seven levels and
 * they are written for prescribers deciding between options; the person holding
 * two bottles needs to know whether to stop and ask, and a scale invites the
 * reading that the lower rungs are safe to ignore.
 */
export type InteractionSeverity =
  /** These should not be taken together. Stop and ask before the next dose. */
  | 'avoid'
  /** Taking both needs a conversation, not necessarily a change. */
  | 'caution';

/**
 * One side of an interaction, named by RxNorm ingredient.
 *
 * Names rather than ingredient rxcuis because that is what a reviewer can
 * check. An rxcui is correct and unreadable, and a rule table nobody can
 * proofread is a rule table nobody should trust. Matching normalises both
 * sides, so spelling variants are handled in code rather than in the data.
 */
export type IngredientRef = {
  readonly ingredient: string;
  /** Other RxNorm spellings that denote the same ingredient. */
  readonly aliases?: readonly string[];
};

export type InteractionRule = {
  /** Stable across edits, so a dismissal or a translation can refer to it. */
  readonly id: string;
  readonly a: IngredientRef;
  readonly b: IngredientRef;
  readonly severity: InteractionSeverity;
  /**
   * Where this rule comes from. Required by the type, so a rule cannot exist
   * without provenance — and carried through to the screen rather than kept
   * internally, because a warning the user can attribute is one they can take
   * to a pharmacist.
   */
  readonly attribution: Attribution;
  /**
   * What happens, in plain clinical English, for a reviewer to check against
   * the source. **Not** user-facing text: §3.2 owns what the user reads, and
   * translating this sentence is content work that has not happened.
   */
  readonly effect: string;
};

/** A rule that matched two medicines in the profile. */
export type InteractionFinding = {
  readonly rule: InteractionRule;
  /** Record ids of the two medicines involved, in profile order. */
  readonly medicationIds: readonly [string, string];
  /** The ingredient that matched on each side, as stored on the record. */
  readonly matched: readonly [string, string];
};

export type InteractionCheck = {
  readonly findings: readonly InteractionFinding[];
  /**
   * Records that could not be checked, because no ingredient list is stored —
   * typed in by hand, or saved before ingredients were recorded.
   *
   * Surfaced rather than ignored. "No interactions found" means something quite
   * different when half the profile was never examined, and a user is entitled
   * to know which half.
   */
  readonly uncheckable: readonly string[];
};

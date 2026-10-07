/**
 * The approved Korean dosing phrases: the only source of Korean directions in
 * the app. EMPTY UNTIL REVIEWED.
 *
 * Rows arrive here one way only: the reviewer signs off a row in the phrase
 * sheet (`npm run copy:pending -- --export-phrases`, drafted from
 * `content-drafts/sig-phrases.draft.md`), and that row, with the reviewer's final
 * wording, is transcribed here, with the review record (who, when, which
 * sheet) in the commit message. Nothing is drafted here, and a draft row
 * that has not been signed off never is here.
 *
 * With this table empty, `koreanDirections` returns null for every direction
 * and the app shows the English alone, which is correct, only not yet useful.
 */

/**
 * What a phrase is, for where it goes in the Korean sentence:
 * - `action`: what to do, ending in the verb (`TAKE 1 TABLET`, `APPLY TO
 *   AFFECTED AREA`);
 * - `route`: how, when it is a separate phrase (`BY MOUTH`); its Korean may
 *   be empty, if the reviewer decides Korean leaves an oral route unsaid;
 * - `frequency`: how often (`TWICE DAILY`, `UP TO 3 TIMES DAILY`);
 * - `condition`: when, or with what (`WITH FOOD`, `AS NEEDED`);
 * - `sentence`: a whole instruction on its own (`DO NOT CRUSH OR CHEW`).
 */
export type PhraseCategory = 'action' | 'route' | 'frequency' | 'condition' | 'sentence';

/** When a row was signed off, and in which sheet. Who is in the commit message. */
export type Review = {
  /** ISO date of the sign-off. */
  readonly on: string;
  /** The exported sheet it was signed off in, e.g. `sig-phrases-2026-09-25.csv`. */
  readonly sheet: string;
};

export type ApprovedPhrase = {
  /** The sheet's ID (`F13`), so a row can be traced to what was reviewed. */
  readonly id: string;
  /** The English exactly as it matches: words in order, any case, commas ignored. */
  readonly en: string;
  /** The reviewer's final wording, verbatim. */
  readonly ko: string;
  readonly category: PhraseCategory;
  readonly reviewed: Review;
};

/**
 * How phrases join, which is content too: the order, the comma, the verb on
 * its own. Frequency first, then conditions, then the route, then the action
 * (the draft's rule: `하루 세 번, 식사와 함께 한 알을 드세요.`). Null until the
 * reviewer has signed off the composition rows of the sheet; while it is
 * null, nothing is composed, whatever phrases are approved.
 */
export type Composition = {
  /** After the frequency, before the rest: a comma, in the draft. */
  readonly afterFrequency: string;
  /** The verb for a sentence that says only `TAKE` and a condition (`TAKE WITH FOOD.`). */
  readonly bareTake: string;
  /** How a sentence ends: a full stop, in the draft. */
  readonly end: string;
  readonly reviewed: Review;
};

export const APPROVED_PHRASES: readonly ApprovedPhrase[] = [];

export const APPROVED_COMPOSITION: Composition | null = null;

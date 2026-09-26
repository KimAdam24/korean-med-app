/**
 * The shape of the Korean ingredient names imported from 식약처 (MFDS), the
 * only source the app accepts for them (see `ingredients.ts`). The table
 * itself is generated, in `mfds-names.ts`.
 */

/** One ingredient: RxNorm's concept and name for it, and 식약처's names for it. */
export type MfdsName = {
  /** RxNorm concept of the ingredient (term type IN). */
  readonly rxcui: string;
  /** RxNorm's name for it, lower case: what a record's `identity.ingredients` holds. */
  readonly en: string;
  /** 식약처's Korean name, as it publishes it. */
  readonly ko: string;
  /** 식약처's English name, as it publishes it: what matched RxNorm. */
  readonly mfdsEn: string;
  /** How many approved products carry this pairing: provenance, not a score. */
  readonly products: number;
};

/** Where and when the table came from. Present whenever the table is not empty. */
export type MfdsSource = {
  /** The data.go.kr dataset and operation, as fetched. */
  readonly dataset: string;
  /** ISO date of the import. */
  readonly retrieved: string;
  /** Product rows read. */
  readonly rows: number;
};

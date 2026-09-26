import { MFDS_NAMES } from './mfds-names.ts';
import type { MfdsName } from './mfds-types.ts';

/**
 * A medicine's ingredients in Korean, as 식약처 names them, or null.
 *
 * Keyed by RxNorm ingredient: a record identified from a barcode stores its
 * ingredients as RxNorm's names for them (`identity.ingredients`), one name
 * per ingredient concept, which is what the imported table is matched on.
 * A medicine read off a label has no RxNorm identity, and gets no Korean
 * name: matching Korean to whatever the camera read would be a guess.
 *
 * All or nothing: a combination product with one ingredient unmapped gets no
 * Korean at all, because a single Korean name under it would read as the
 * whole medicine.
 */
export function koreanIngredientNames(
  ingredients: readonly string[] | undefined,
  table: readonly MfdsName[] = MFDS_NAMES
): readonly string[] | null {
  if (!ingredients || ingredients.length === 0 || table.length === 0) return null;
  const byName = new Map(table.map((entry) => [entry.en, entry.ko]));
  const names = ingredients.map((ingredient) => byName.get(ingredient.trim().toLowerCase()));
  return names.every((name): name is string => name !== undefined) ? names : null;
}

/** The Korean name for one RxNorm ingredient concept, or null. */
export function koreanNameForRxcui(rxcui: string, table: readonly MfdsName[] = MFDS_NAMES): string | null {
  return table.find((entry) => entry.rxcui === rxcui)?.ko ?? null;
}

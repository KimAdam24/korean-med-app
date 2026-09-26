import type { MfdsName } from '../src/features/drugs/mfds-types.ts';

/**
 * The pure half of the 식약처 import: from product rows to RxNorm-keyed Korean
 * ingredient names. `import-mfds-names.ts` fetches the rows and asks RxNav.
 *
 * Conservative at every step, because a wrong pairing puts an authoritative-
 * looking wrong name in front of the one reader who cannot check it:
 *
 * - A Korean and an English name are paired only from single-ingredient
 *   products. A combination lists several of each, and nothing says the two
 *   lists are in the same order.
 * - An English name 식약처 spells two ways in Korean (beyond spacing) is not
 *   chosen between; it is reported.
 * - It must match an RxNorm ingredient (term type IN) exactly, name for name.
 *   A salt (`amlodipine besylate`) is not the ingredient (`amlodipine`), and
 *   its Korean name is not the ingredient's, so it is counted and left out.
 */

export type ProductRow = Readonly<Record<string, unknown>>;

/** Where in a row the two names are: the fields of 식약처's approval data. */
export type Fields = { readonly ko: string; readonly en: string };

/** Assumed until the data.go.kr key arrives and a real response confirms them. */
export const DEFAULT_FIELDS: Fields = { ko: 'MAIN_ITEM_INGR', en: 'MAIN_INGR_ENG' };

export type Pair = { readonly ko: string; readonly en: string };

/** One RxNorm concept, as RxNav describes it. */
export type RxConcept = { readonly rxcui: string; readonly name: string; readonly tty: string };

export type ImportReport = {
  readonly rows: number;
  readonly combinations: number;
  readonly unreadable: number;
  readonly conflicts: readonly { en: string; ko: readonly string[] }[];
  readonly notIngredient: readonly { en: string; tty: string }[];
  readonly unmatched: readonly string[];
};

const HANGUL = /[가-힣]/;
/** `[M040702]포도당`: 식약처's ingredient code, not part of the name. */
const CODE = /\[[^\]]*\]/g;
/** Between the ingredients of a combination. */
const SEPARATORS = /[|/;+]|,(?!\d)/;

export const normaliseEn = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Single-ingredient rows' name pairs; counts of what was passed over. */
export function extractPairs(
  rows: readonly ProductRow[],
  fields: Fields = DEFAULT_FIELDS
): { pairs: Pair[]; combinations: number; unreadable: number } {
  const pairs: Pair[] = [];
  let combinations = 0;
  let unreadable = 0;
  for (const row of rows) {
    const ko = typeof row[fields.ko] === 'string' ? (row[fields.ko] as string) : '';
    const en = typeof row[fields.en] === 'string' ? (row[fields.en] as string) : '';
    const koParts = ko.replace(CODE, '').split(SEPARATORS).map((part) => part.trim()).filter(Boolean);
    const enParts = en.split(SEPARATORS).map((part) => part.trim()).filter(Boolean);
    if (koParts.length > 1 || enParts.length > 1) {
      combinations += 1;
      continue;
    }
    if (koParts.length !== 1 || enParts.length !== 1 || !HANGUL.test(koParts[0]) || !/[a-z]/i.test(enParts[0])) {
      unreadable += 1;
      continue;
    }
    pairs.push({ ko: koParts[0], en: enParts[0] });
  }
  return { pairs, combinations, unreadable };
}

/**
 * One Korean name per English name, where 식약처 is consistent. Spellings that
 * differ only in spacing are one name, published most often as the first.
 */
export function agreeNames(pairs: readonly Pair[]): {
  names: Map<string, { ko: string; mfdsEn: string; products: number }>;
  conflicts: { en: string; ko: string[] }[];
} {
  const byEn = new Map<string, { mfdsEn: string; spellings: Map<string, number> }>();
  for (const { ko, en } of pairs) {
    const key = normaliseEn(en);
    const entry = byEn.get(key) ?? { mfdsEn: en, spellings: new Map<string, number>() };
    entry.spellings.set(ko, (entry.spellings.get(ko) ?? 0) + 1);
    byEn.set(key, entry);
  }
  const names = new Map<string, { ko: string; mfdsEn: string; products: number }>();
  const conflicts: { en: string; ko: string[] }[] = [];
  for (const [en, { mfdsEn, spellings }] of byEn) {
    const distinct = new Set([...spellings.keys()].map((ko) => ko.replace(/\s+/g, '')));
    if (distinct.size > 1) {
      conflicts.push({ en, ko: [...spellings.keys()].sort() });
      continue;
    }
    const [ko] = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const products = [...spellings.values()].reduce((sum, count) => sum + count, 0);
    names.set(en, { ko, mfdsEn, products });
  }
  return { names, conflicts };
}

/**
 * The table: each agreed name that is exactly an RxNorm ingredient.
 * `resolve` answers what RxNorm calls that exact name, or null.
 */
export async function matchRxNorm(
  names: Map<string, { ko: string; mfdsEn: string; products: number }>,
  resolve: (en: string) => Promise<RxConcept | null>
): Promise<{ table: MfdsName[]; notIngredient: { en: string; tty: string }[]; unmatched: string[] }> {
  const table: MfdsName[] = [];
  const notIngredient: { en: string; tty: string }[] = [];
  const unmatched: string[] = [];
  for (const [en, { ko, mfdsEn, products }] of names) {
    const concept = await resolve(en);
    if (!concept || normaliseEn(concept.name) !== en) {
      unmatched.push(en);
    } else if (concept.tty !== 'IN') {
      notIngredient.push({ en, tty: concept.tty });
    } else {
      table.push({ rxcui: concept.rxcui, en, ko, mfdsEn, products });
    }
  }
  table.sort((a, b) => a.en.localeCompare(b.en));
  return { table, notIngredient, unmatched };
}

/** The generated module, as written to `src/features/drugs/mfds-names.ts`. */
export function tableModule(table: readonly MfdsName[], source: { dataset: string; retrieved: string; rows: number }): string {
  return [
    '// GENERATED by scripts/import-mfds-names.ts. Do not edit by hand: every name',
    "// here must come from 식약처's own data, and this file is how that is shown.",
    '',
    "import type { MfdsName, MfdsSource } from './mfds-types.ts';",
    '',
    `export const MFDS_SOURCE: MfdsSource | null = ${JSON.stringify(source)};`,
    '',
    'export const MFDS_NAMES: readonly MfdsName[] = [',
    ...table.map((entry) => `  ${JSON.stringify(entry)},`),
    '];',
    '',
  ].join('\n');
}

/**
 * Run with: npm run test:unit
 *
 * The lookup tables here are made up (성분가...); the real one is imported.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { INGREDIENTS, koreanNameFor } from './ingredients.ts';
import { koreanIngredientNames, koreanNameForRxcui } from './korean-names.ts';
import { MFDS_NAMES, MFDS_SOURCE } from './mfds-names.ts';
import type { MfdsName } from './mfds-types.ts';

const TABLE: MfdsName[] = [
  { rxcui: '111', en: 'alphazine', ko: '성분가', mfdsEn: 'Alphazine', products: 3 },
  { rxcui: '222', en: 'betazine', ko: '성분나', mfdsEn: 'Betazine', products: 1 },
];

test('no Korean name without 식약처 as its source', () => {
  // The only Korean ingredient names are the imported ones, each carrying the
  // English name 식약처 published beside it, and the table says when and from
  // where it was imported. Empty until the first import; true after it.
  if (MFDS_NAMES.length > 0) assert.ok(MFDS_SOURCE && MFDS_SOURCE.dataset && MFDS_SOURCE.retrieved);
  for (const entry of MFDS_NAMES) {
    assert.match(entry.rxcui, /^\d+$/, entry.en);
    assert.equal(entry.en, entry.en.toLowerCase(), entry.en);
    assert.match(entry.ko, /[가-힣]/, entry.en);
    assert.ok(entry.mfdsEn.trim() && entry.products >= 1, entry.en);
  }
  // And none written into the lexicon by hand (ingredients.test.ts too).
  assert.ok(INGREDIENTS.every((entry) => entry.ko === undefined));
});

test('today, with nothing imported, no medicine gets a Korean name', () => {
  assert.equal(koreanIngredientNames(['atorvastatin']), null);
  assert.equal(koreanNameFor('atorvastatin'), null);
});

test('by RxNorm ingredient name, as a record stores them, whatever the case', () => {
  assert.deepEqual(koreanIngredientNames(['Alphazine'], TABLE), ['성분가']);
  assert.equal(koreanNameForRxcui('222', TABLE), '성분나');
  assert.equal(koreanNameForRxcui('333', TABLE), null);
});

test('a combination gets Korean names for all its ingredients, or none', () => {
  assert.deepEqual(koreanIngredientNames(['alphazine', 'betazine'], TABLE), ['성분가', '성분나']);
  assert.equal(koreanIngredientNames(['alphazine', 'gammazine'], TABLE), null);
});

test('a medicine without ingredients (read off a label, not a barcode) gets none', () => {
  assert.equal(koreanIngredientNames(undefined, TABLE), null);
  assert.equal(koreanIngredientNames([], TABLE), null);
});

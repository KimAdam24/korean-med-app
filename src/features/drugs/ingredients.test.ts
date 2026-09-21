/**
 * Run with: npm run test:unit
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INGREDIENTS,
  editDistance,
  findIngredient,
  koreanNameFor,
  nearestIngredient,
} from './ingredients.ts';

test('matches an ingredient by its RxNorm name', () => {
  assert.equal(findIngredient('levothyroxine')?.en, 'levothyroxine');
  assert.equal(findIngredient('LEVOTHYROXINE')?.en, 'levothyroxine');
});

test('matches the spellings printed on packaging', () => {
  // All three appear on real labels for the same ingredient.
  assert.equal(findIngredient('Thyroxine')?.en, 'levothyroxine');
  assert.equal(findIngredient('L-Thyroxine')?.en, 'levothyroxine');
  assert.equal(findIngredient('paracetamol')?.en, 'acetaminophen');
});

test('ignores dose-form words around the ingredient', () => {
  // The name field carries them: "-Thyroxine Tabs", "Levothyroxine Sodium".
  assert.equal(findIngredient('Thyroxine Tabs')?.en, 'levothyroxine');
  assert.equal(findIngredient('Levothyroxine Sodium Tablet')?.en, 'levothyroxine');
  assert.equal(findIngredient('amoxicillin capsules')?.en, 'amoxicillin');
});

test('matches a name the engine clipped', () => {
  // Leading punctuation is the engine losing a character, not a different drug.
  assert.equal(findIngredient('-Thyroxine Tabs')?.en, 'levothyroxine');
});

test('catches a one-character misread as a near miss', () => {
  // The case this exists for: shaped exactly like a drug name, so no amount of
  // pattern-matching over the text alone could flag it.
  const miss = nearestIngredient('Thyeoxine');
  assert.equal(miss?.entry.en, 'levothyroxine');
  assert.equal(miss?.distance, 1);

  assert.equal(nearestIngredient('amoxicilin')?.entry.en, 'amoxicillin');
  assert.equal(nearestIngredient('metfornin')?.entry.en, 'metformin');
});

test('an exact match is a hit, not a miss', () => {
  assert.equal(nearestIngredient('levothyroxine'), null);
  assert.equal(nearestIngredient('Thyroxine'), null);
});

test('an unknown drug is not reported as a misread', () => {
  // The lexicon is partial, so most real drugs are missing from it. Flagging
  // every unrecognised name would make the signal useless.
  assert.equal(nearestIngredient('PILLNAMELOL'), null);
  assert.equal(nearestIngredient('Goodearth'), null);
  assert.equal(nearestIngredient('vortioxetine'), null);
});

test('ordinary label words are not mistaken for misread drugs', () => {
  // A false positive here would flag a perfectly good read as degraded.
  for (const word of [
    'DROWSINESS',
    'MACHINERY',
    'ALCOHOL',
    'REFILLS',
    'PHARMACY',
    'TABLETS',
    'REMAINING',
    'EDITABLE',
    'TEMPLATE',
  ]) {
    assert.equal(nearestIngredient(word), null, `${word} matched an ingredient`);
  }
});

test('short tokens are never matched', () => {
  // Too easy to land near something by accident.
  assert.equal(nearestIngredient('aspir'), null);
  assert.equal(nearestIngredient('mg'), null);
});

test('edit distance stops counting past the limit', () => {
  assert.equal(editDistance('thyeoxine', 'thyroxine', 2), 1);
  assert.equal(editDistance('abc', 'abc', 2), 0);
  // Only that it exceeded the limit matters, not by how much.
  assert.ok(editDistance('aspirin', 'levothyroxine', 1) > 1);
});

test('no ingredient carries a Korean name yet', () => {
  // 식약처 publishes these and is the only acceptable source. A plausible
  // invention would look authoritative to a reader who cannot check it, so an
  // entry appearing here without that sourcing is a bug.
  for (const entry of INGREDIENTS) {
    assert.equal(entry.ko, undefined, `${entry.en} has an unsourced Korean name`);
  }
  assert.equal(koreanNameFor('levothyroxine'), null);
});

test('every entry is lower case and free of dose-form words', () => {
  // Entries are matched after normalisation; one that does not survive it
  // would silently never match.
  for (const entry of INGREDIENTS) {
    assert.equal(entry.en, entry.en.toLowerCase(), `${entry.en} is not lower case`);
    assert.equal(findIngredient(entry.en)?.en, entry.en, `${entry.en} cannot find itself`);
  }
});

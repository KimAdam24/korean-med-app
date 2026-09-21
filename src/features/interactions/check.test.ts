/**
 * Run with: npm run test:unit
 *
 * Rules are supplied per-test rather than taken from the shipped table, which
 * is empty on purpose. These are fixtures for the matching logic, not medical
 * claims, and are named so nobody mistakes them for the real list.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { MedicationRecord } from '../medications/types.ts';
import { checkInteractions } from './check.ts';
import { INTERACTION_RULES } from './rules.ts';
import type { InteractionRule } from './types.ts';

function medication(
  id: string,
  name: string,
  ingredients?: readonly string[]
): MedicationRecord {
  return {
    id,
    name,
    addedAt: '2026-09-21T00:00:00.000Z',
    source: 'label-scan',
    needsReview: false,
    ...(ingredients
      ? { identity: { rxcui: `rx-${id}`, ndc11: '00000000000', ingredients } }
      : {}),
  };
}

const FIXTURE_RULE: InteractionRule = {
  id: 'fixture-1',
  a: { ingredient: 'warfarin' },
  b: { ingredient: 'aspirin', aliases: ['acetylsalicylic acid'] },
  severity: 'avoid',
  source: 'test fixture, not a medical claim',
  effect: 'Fixture effect text.',
};

test('the shipped rule table is empty until reviewed', () => {
  // Rows here are medical claims a user will act on and cannot check. A
  // populated table that has not been reviewed is the failure this guards.
  assert.equal(INTERACTION_RULES.length, 0);
});

test('finds an interacting pair', () => {
  const profile = [
    medication('a', 'Warfarin 5mg', ['warfarin']),
    medication('b', 'Aspirin 81mg', ['aspirin']),
  ];

  const { findings } = checkInteractions(profile, [FIXTURE_RULE]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].medicationIds, ['a', 'b']);
  assert.deepEqual(findings[0].matched, ['warfarin', 'aspirin']);
});

test('matches regardless of which medicine was added first', () => {
  // A rule is symmetric; requiring the table to list both directions would
  // double it and invite one to be edited without the other.
  const profile = [
    medication('a', 'Aspirin 81mg', ['aspirin']),
    medication('b', 'Warfarin 5mg', ['warfarin']),
  ];

  const { findings } = checkInteractions(profile, [FIXTURE_RULE]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].matched, ['aspirin', 'warfarin']);
});

test('matches an ingredient by its alias', () => {
  const profile = [
    medication('a', 'Warfarin', ['warfarin']),
    medication('b', 'ASA', ['Acetylsalicylic Acid']),
  ];
  assert.equal(checkInteractions(profile, [FIXTURE_RULE]).findings.length, 1);
});

test('matches combination products through their ingredient list', () => {
  // The interaction is between ingredients, not products, which is the whole
  // reason ingredients are stored rather than product names.
  const profile = [
    medication('a', 'Warfarin', ['warfarin']),
    medication('b', 'Some Combination Tablet', ['caffeine', 'aspirin', 'butalbital']),
  ];
  const { findings } = checkInteractions(profile, [FIXTURE_RULE]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].matched, ['warfarin', 'aspirin']);
});

test('does not report a medicine against itself', () => {
  // A refill saved twice shares every ingredient and would otherwise match any
  // rule naming it.
  const selfRule: InteractionRule = {
    ...FIXTURE_RULE,
    id: 'fixture-self',
    a: { ingredient: 'warfarin' },
    b: { ingredient: 'warfarin' },
  };
  const profile = [
    medication('a', 'Warfarin 5mg', ['warfarin']),
    medication('b', 'Warfarin 5mg', ['warfarin']),
  ];
  assert.equal(checkInteractions(profile, [selfRule]).findings.length, 0);
});

test('reports records it could not check rather than passing them', () => {
  // "Nothing found" means something different when half the profile was never
  // examined, and the user is entitled to know which half.
  const profile = [
    medication('a', 'Warfarin', ['warfarin']),
    medication('b', 'Typed in by hand'),
  ];

  const check = checkInteractions(profile, [FIXTURE_RULE]);
  assert.deepEqual(check.uncheckable, ['b']);
  assert.equal(check.findings.length, 0);
});

test('an empty ingredient list counts as uncheckable, not as no ingredients', () => {
  const profile = [
    medication('a', 'Warfarin', ['warfarin']),
    { ...medication('b', 'Odd record'), identity: { rxcui: 'r', ndc11: 'n', ingredients: [] } },
  ];
  assert.deepEqual(checkInteractions(profile, [FIXTURE_RULE]).uncheckable, ['b']);
});

test('finds every interacting pair in a larger profile', () => {
  const second: InteractionRule = {
    ...FIXTURE_RULE,
    id: 'fixture-2',
    a: { ingredient: 'warfarin' },
    b: { ingredient: 'amiodarone' },
  };

  const profile = [
    medication('a', 'Warfarin', ['warfarin']),
    medication('b', 'Aspirin', ['aspirin']),
    medication('c', 'Amiodarone', ['amiodarone']),
    medication('d', 'Unrelated', ['levothyroxine']),
  ];

  const { findings } = checkInteractions(profile, [FIXTURE_RULE, second]);
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((finding) => finding.rule.id).sort(),
    ['fixture-1', 'fixture-2']
  );
});

test('finds nothing in a profile with no interacting pair', () => {
  const profile = [
    medication('a', 'Levothyroxine', ['levothyroxine']),
    medication('b', 'Metformin', ['metformin']),
  ];
  const check = checkInteractions(profile, [FIXTURE_RULE]);
  assert.equal(check.findings.length, 0);
  assert.equal(check.uncheckable.length, 0);
});

test('a single medicine cannot interact with anything', () => {
  const check = checkInteractions([medication('a', 'Warfarin', ['warfarin'])], [FIXTURE_RULE]);
  assert.equal(check.findings.length, 0);
});

test('every rule carries a source and an effect', () => {
  // Enforced on the fixtures too, so the shape cannot drift before the real
  // table is transcribed into it.
  for (const rule of [FIXTURE_RULE, ...INTERACTION_RULES]) {
    assert.ok(rule.source.length > 0, `${rule.id} has no source`);
    assert.ok(rule.effect.length > 0, `${rule.id} has no effect`);
  }
});

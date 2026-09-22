/**
 * Run with: npm run test:unit
 *
 * The two damaged readings are verbatim from real captures. The clean sigs are
 * a false-positive guard: a checker that flags ordinary directions teaches the
 * user that its warnings mean nothing, which is worse than no checker.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { assessField } from './field-integrity.ts';

function damagedWords(kind: Parameters<typeof assessField>[0], text: string): string[] {
  return assessField(kind, text)
    .spans.filter((span) => span.damaged)
    .map((span) => span.text);
}

// --- Real captures ---------------------------------------------------------

test('flags the PILLNAMELOL directions as damaged, and says where', () => {
  const text = 'TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOoD.';
  const result = assessField('instructions', text);

  assert.equal(result.level, 'damaged');
  // MOUTHUP matters most: it has swallowed the UP of "UP TO", the ceiling.
  assert.deepEqual(damagedWords('instructions', text), ['MOUTHUP', 'FOoD.']);
  assert.ok(result.reasons.includes('merged-words'));
  assert.ok(result.reasons.includes('impossible-case'));
});

test('flags the L-Thyroxine directions as damaged', () => {
  const text = 'Take tablets with foodto teat egular motabosn.';
  const result = assessField('instructions', text);

  assert.equal(result.level, 'damaged');
  const damaged = damagedWords('instructions', text);
  assert.ok(damaged.includes('foodto'), 'food+to run together');
  assert.ok(damaged.includes('teat'), 'one letter from "treat"');
  assert.ok(damaged.includes('egular'), 'one letter from "regular"');
});

test('flags a clipped drug name', () => {
  const result = assessField('name', '-Thyroxine Tabs');
  assert.equal(result.level, 'damaged');
  assert.ok(result.reasons.includes('clipped'));
  assert.deepEqual(damagedWords('name', '-Thyroxine Tabs'), ['-Thyroxine']);
});

test('flags a drug name one letter from a real ingredient', () => {
  const result = assessField('name', 'L-Thyeoxine');
  assert.equal(result.level, 'damaged');
  assert.ok(result.reasons.includes('near-miss'));
});

// --- Spans reproduce the original ----------------------------------------------

test('spans rejoin to exactly the original text', () => {
  // The raw reading is shown as evidence, so it must be shown verbatim — the
  // spans exist to mark damage, never to rebuild a different string.
  for (const text of [
    'TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOoD.',
    'Take  tablets\twith foodto teat',
    '-Thyroxine Tabs',
    '',
  ]) {
    const joined = assessField('instructions', text).spans.map((span) => span.text).join('');
    assert.equal(joined, text);
  }
});

// --- False-positive guard --------------------------------------------------------

test('does not flag ordinary directions', () => {
  const clean = [
    'TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOOD.',
    'TAKE 1 TABLET BY MOUTH EVERY 12 HOURS',
    'TAKE 2 CAPSULES BY MOUTH TWICE DAILY FOR 10 DAYS',
    'APPLY TO AFFECTED AREA TWICE DAILY',
    'INSTILL 1 DROP IN EACH EYE AT BEDTIME',
    'Take 500mg three times (3x) a day for five (5) days',
    'Take one tablet daily to treat high blood pressure',
    'Take tablets with food to treat irregular metabolism.',
    'TAKE 1 TAB PO BID PRN PAIN',
    'Take 1 tablet by mouth q8h as needed for nausea',
    'DISSOLVE 1 TABLET UNDER THE TONGUE AS NEEDED',
    'INHALE 2 PUFFS EVERY 4 TO 6 HOURS AS NEEDED',
    'TAKE ON AN EMPTY STOMACH 30 MINUTES BEFORE BREAKFAST',
    'APPLY A THIN LAYER TO THE FEET ONCE DAILY',
    'DO NOT CRUSH OR CHEW. SWALLOW WHOLE WITH A FULL GLASS OF WATER.',
    'TAKE 1 TABLET BY MOUTH DAILY UNTIL FINISHED',
  ];

  for (const text of clean) {
    const result = assessField('instructions', text);
    assert.equal(
      result.level,
      'readable',
      `flagged ordinary directions: "${text}" (${damagedWords('instructions', text).join(', ')})`
    );
  }
});

test('an unfamiliar but well-formed word is not damage', () => {
  // Indications fall outside the vocabulary legitimately.
  assert.equal(assessField('instructions', 'Take one tablet daily for hypertension').level, 'readable');
});

test('does not flag an unknown but intact drug name', () => {
  // Most real drugs are missing from the lexicon; being unknown is not damage.
  assert.equal(assessField('name', 'PILLNAMELOL').level, 'readable');
  assert.equal(assessField('name', 'Levothyroxine Sodium').level, 'readable');
  assert.equal(assessField('name', 'Amoxicillin (Generic)').level, 'readable');
});

test('does not flag a correctly printed hyphenated name', () => {
  // The regression that motivated judging casing per hyphenated part:
  // `L-Thyroxine` read as one word has a capital in its middle.
  assert.equal(assessField('name', 'L-Thyroxine').level, 'readable');
  assert.equal(assessField('name', 'L-Thyroxine Tabs 80mcg').level, 'readable');
  assert.equal(assessField('name', 'Co-Amoxiclav').level, 'readable');
});

// --- Other shapes of damage ---------------------------------------------------

test('flags letters that are not shaped like words', () => {
  const result = assessField('instructions', 'Take one tablet xqzt plmr.');
  assert.equal(result.level, 'damaged');
  assert.ok(result.reasons.includes('not-a-word'));
});

test('flags a number fused to a word', () => {
  assert.equal(assessField('instructions', 'TAKE 1TABLET DAILY').level, 'damaged');
});

test('accepts a well-formed strength and rejects anything else', () => {
  assert.equal(assessField('dosage', '300 MG').level, 'readable');
  assert.equal(assessField('dosage', '80 MCG').level, 'readable');
  assert.equal(assessField('dosage', '2.5 ML').level, 'readable');
  assert.equal(assessField('dosage', '3OO MG').level, 'damaged');
  assert.equal(assessField('dosage', '300 MG DAILY').level, 'damaged');
});

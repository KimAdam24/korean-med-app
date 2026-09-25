/**
 * Run with: npm run test:unit
 *
 * The damaged readings are verbatim from real captures. The clean sigs are
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

test('flags the Vitamin D2 directions, whose every word is well-formed', () => {
  // A real dispensed vial. The label says "Take 1 capsule (50,000 units) by
  // mouth every 7 days"; both numbers are gone and the rest still reads as a
  // sentence. This passed as clean before directions were checked for
  // structure, not just vocabulary.
  const text = 'Take 1 capsule (b units) by mouth eve days';
  const result = assessField('instructions', text);

  assert.equal(result.level, 'damaged');
  assert.deepEqual(damagedWords('instructions', text), ['(b', 'units)', 'eve']);
  assert.ok(result.reasons.includes('not-a-word'), 'a stray letter where 50,000 was');
  assert.ok(result.reasons.includes('missing-number'), 'units with no quantity');
  assert.ok(result.reasons.includes('truncated'), '"eve" is "every" cut short');
});

// --- Structure ---------------------------------------------------------------

test('flags a unit with no number before it', () => {
  assert.deepEqual(damagedWords('instructions', 'Inject units under the skin at bedtime'), ['units']);
});

test('flags "every" straight before a plural, where the interval was lost', () => {
  const text = 'Take 1 capsule by mouth every days';
  assert.deepEqual(damagedWords('instructions', text), ['every', 'days']);
  assert.ok(assessField('instructions', text).reasons.includes('missing-number'));
});

test('flags a number that has lost its front', () => {
  // What survives of 50,000 when "50," is lost: well-formed digits, wrong
  // dose. The unit is marked too — a broken number is not a quantity.
  assert.deepEqual(damagedWords('instructions', 'Take 1 capsule (000 units) weekly'), ['(000', 'units)']);
});

test('flags a word cut short at either end', () => {
  assert.deepEqual(damagedWords('instructions', 'Take 1 tablet by mouth ery 8 hours'), ['ery']);
  assert.deepEqual(damagedWords('instructions', 'Take 1 tablet by mouth in the mor'), ['mor']);
});

test('flags directions that stop mid-phrase', () => {
  // "up to" without its number is a ceiling with the ceiling missing.
  for (const text of ['TAKE 1 TABLET BY MOUTH UP TO', 'TAKE 1 TABLET BY MOUTH EVERY', 'Take 1 tablet daily with.']) {
    const result = assessField('instructions', text);
    assert.equal(result.level, 'damaged', text);
    assert.ok(result.reasons.includes('clipped'), text);
  }
  assert.deepEqual(damagedWords('instructions', 'TAKE 1 TABLET BY MOUTH EVERY'), ['EVERY']);
});

test('structure is only judged in directions', () => {
  // A name or strength has no grammar to break; "D" alone in a name is fine.
  assert.equal(assessField('name', 'Vitamin D').level, 'readable');
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
    'TAKE 1 TAB PO BID PRN PAIN',
    'Take 1 tablet by mouth q8h as needed for nausea',
    'DISSOLVE 1 TABLET UNDER THE TONGUE AS NEEDED',
    'INHALE 2 PUFFS EVERY 4 TO 6 HOURS AS NEEDED',
    'TAKE ON AN EMPTY STOMACH 30 MINUTES BEFORE BREAKFAST',
    'APPLY A THIN LAYER TO THE FEET ONCE DAILY',
    'DO NOT CRUSH OR CHEW. SWALLOW WHOLE WITH A FULL GLASS OF WATER.',
    'TAKE 1 TABLET BY MOUTH DAILY UNTIL FINISHED',
    // Guards for the structural checks: quantities, intervals, lone letters,
    // and ordinary words that are the start or end of longer ones.
    'Take 1 capsule (50,000 units) by mouth every 7 days',
    'TAKE 1 CAPSULE BY MOUTH EVERY 14 DAYS',
    'Take 1 capsule weekly for vitamin D deficiency',
    'Inject 10 units under the skin at bedtime',
    'Inject 20 units under the skin every morning with breakfast',
    'Inject 1,000 units under the skin daily',
    'Take 5 mL by mouth twice daily',
    'Take 0.5 mL by mouth daily',
    'Take 1 g by mouth four times daily before meals and at bedtime',
    'Take ½ tablet by mouth daily',
    'Break tablet in half and take 1/2 tablet daily',
    'Take 2 tablets at 8 AM and 1 tablet at 2 PM',
    'Take 1 tablet by mouth every other day',
    'TAKE 1 TABLET BY MOUTH EVERY MORNING',
    'Take 1 capsule by mouth every 4-6 hours as needed',
    'Take 1 tablet by mouth three times a day for 7 days',
    'Take 1 tablet by mouth 1 hour before or 2 hours after meals',
    'Take 1 tablet within 30 minutes of a meal',
    'Take 1 tablet by mouth weekly on the same day each week',
    'Take 1 tablet by mouth at nighttime',
    'Continue taking even if you feel well',
    'Inhale 1 vial via nebulizer every 6 hours as needed',
    'Use 1 spray in each nostril daily',
    'Shake well before use',
    'Take 1 tablet by mouth daily. Do not take with milk.',
    'If you miss a dose take it as soon as you remember. Skip it if it is almost time for the next dose.',
    'Take 1 tablet by mouth as needed for mild pain',
    // Optional plurals, times written short, and wording that sits one letter
    // from a vocabulary word.
    'TAKE 1-2 TABLET(S) BY MOUTH EVERY 6 HOURS AS NEEDED',
    'APPLY TO AFFECTED AREA(S) TWICE DAILY',
    'INSTILL 2 DROP(S) IN EACH EYE TWICE DAILY',
    'TAKE 1 TABLET BY MOUTH WEEKLY. REMAIN UPRIGHT FOR 30 MINUTES',
    'TAKE 1 TABLET BY MOUTH DAILY FOR MOOD',
    'INJECT UNDER THE SKIN PER SLIDING SCALE BEFORE MEALS',
    'TAKE 1 TABLET BY MOUTH EVERY 8HRS',
    'TAKE 1 TABLET AT 8AM AND 2PM',
    'Take 1 tablet by mouth three times a day',
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

test('does not read a list without spaces as garbled casing', () => {
  // From the vial's "Generic for" line.
  assert.equal(assessField('name', 'Calciferol,Drisdol').level, 'readable');
});

test('does not read a mixed-case unit as garbled casing', () => {
  assert.equal(assessField('instructions', 'Take 5 mL by mouth twice daily').level, 'readable');
  assert.equal(assessField('instructions', 'Take 10 mEq by mouth daily').level, 'readable');
  assert.equal(assessField('name', 'Amoxicillin 250 mg/5mL').level, 'readable');
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

test('reads thousands in a strength, and rejects a number missing its front', () => {
  assert.equal(assessField('dosage', '50,000 UNIT').level, 'readable');
  assert.equal(assessField('dosage', '1,000 MG').level, 'readable');
  assert.equal(assessField('dosage', '0.5 MG').level, 'readable');
  // The tail of "50,000 UNIT" split at its comma.
  const tail = assessField('dosage', '000 UNIT');
  assert.equal(tail.level, 'damaged');
  assert.ok(tail.reasons.includes('missing-number'));
  assert.equal(assessField('dosage', '50,00 UNIT').level, 'damaged');
});

test('accepts a strength restated in brackets, judging both halves', () => {
  assert.equal(assessField('dosage', '1.25 MG (50,000 UNIT)').level, 'readable');
  assert.equal(assessField('dosage', '10 MEQ').level, 'readable');
  assert.equal(assessField('dosage', '50,000 IU').level, 'readable');
  assert.equal(assessField('dosage', '1.25 MG (000 UNIT)').level, 'damaged');
  assert.equal(assessField('dosage', '1.25 MG (50,000 UNIT').level, 'damaged');
});

// --- Numbers lost around counts and durations ---------------------------------------

test('flags a count of times with its number gone', () => {
  // The ceiling of an as-needed dose, lost: "up to 3 times" became "up to times".
  assert.deepEqual(
    damagedWords('instructions', 'TAKE 1 TABLET BY MOUTH UP TO TIMES DAILY AS NEEDED.'),
    ['TIMES']
  );
  assert.equal(assessField('instructions', 'TAKE 1 TABLET BY MOUTH TIMES DAILY.').level, 'damaged');
});

test('flags a duration with its number gone', () => {
  assert.deepEqual(damagedWords('instructions', 'TAKE 1 TABLET BY MOUTH 3 TIMES DAILY FOR DAYS'), [
    'FOR',
    'DAYS',
  ]);
});

test('flags a digit misread as a letter', () => {
  assert.deepEqual(damagedWords('instructions', 'TAKE 1 TABLET BY MOUTH EVERY A HOURS AS NEEDED'), [
    'A',
    'HOURS',
  ]);
  assert.deepEqual(damagedWords('instructions', 'TAKE 1 TABLET BY MOUTH EVERY 1O HOURS'), ['1O']);
});

test('flags a zero where a dose should be', () => {
  assert.equal(
    assessField('instructions', 'Take 1 capsule (0 units) by mouth every 7 days').level,
    'damaged'
  );
  assert.equal(assessField('dosage', '0 MG').level, 'damaged');
  assert.equal(assessField('dosage', '1.25 MG (0 UNIT)').level, 'damaged');
});

test('treats a direction that never says when as cut off', () => {
  // What is left of "TAKE 1 TABLET BY MOUTH / DAILY" when the second line is
  // lost. Opening verbs only: advice lines ("Shake well before use") carry
  // no timing and are not directions.
  for (const text of [
    'TAKE 1 TABLET BY MOUTH',
    'TAKE 6 TABLETS BY MOUTH',
    'Take tablets with food to treat irregular metabolism.',
    'Place 1 tablet under the tongue and let dissolve',
  ]) {
    const result = assessField('instructions', text);
    assert.equal(result.level, 'damaged', text);
    assert.ok(result.reasons.includes('incomplete'), text);
  }
  assert.equal(assessField('instructions', 'Shake well before use').level, 'readable');
});

test('accepts a concentration as a strength', () => {
  assert.equal(assessField('dosage', '100 UNITS/ML').level, 'readable');
  assert.equal(assessField('dosage', '400 MG/5 ML').level, 'readable');
  assert.equal(assessField('dosage', '25 MCG/HR').level, 'readable');
});

test('flags a digit inside a name word', () => {
  // An O misread as a zero. Digits at a word's edge are real: D2, B12.
  assert.equal(assessField('name', 'CALCIFER0L CAP').level, 'damaged');
  assert.equal(assessField('name', 'VITAMIN B12').level, 'readable');
});

test('does not read a salt name or a combination strength as damage', () => {
  assert.equal(assessField('name', 'Metformin HCl tablet').level, 'readable');
  assert.equal(assessField('dosage', '5/325 MG').level, 'readable');
  assert.equal(
    assessField('instructions', 'APPLY TWICE DAILY AS NEEDED. FOR EXTERNAL USE ONLY.').level,
    'readable'
  );
});

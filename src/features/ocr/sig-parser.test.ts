/**
 * Run with: npm run test:unit
 *
 * The fixture is a real capture from the Android engine, kept verbatim —
 * including the misreads (`MOUTHUP`, `FOoD`, `aTY`), the interleaved columns,
 * and the stock-artwork watermarks. Cleaning it up would delete exactly the
 * conditions the parser exists to survive.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { TEMPLATE_PILLNAMELOL_LINES, VITAMIN_D2_VIAL_LINES } from './eval/corpus.ts';
import {
  assessReadQuality,
  classifyLine,
  parseLabelFields,
  splitProduct,
} from './sig-parser.ts';
import type { RecognizedTextLine } from './types.ts';

/**
 * The template label from the evaluation corpus — one verbatim copy, shared,
 * so the capture cannot drift between the two. Its confidence is null
 * throughout; the corpus says why.
 */
const LABEL = TEMPLATE_PILLNAMELOL_LINES;

test('finds the drug name and strength', () => {
  const fields = parseLabelFields(LABEL);
  assert.equal(fields.name?.text, 'PILLNAMELOL');
  assert.equal(fields.dosage?.text, '300 MG');
});

test('assembles the directions without the warning interleaved into them', () => {
  const fields = parseLabelFields(LABEL);
  assert.equal(
    fields.instructions?.text,
    'TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOoD.'
  );
});

test('keeps the auxiliary warning out of every field', () => {
  const fields = parseLabelFields(LABEL);
  const combined = [fields.name?.text, fields.dosage?.text, fields.instructions?.text]
    .filter(Boolean)
    .join(' ');

  // The drowsiness sticker sits between the direction lines on this label.
  // Leaking any of it into the directions would tell the user to do something
  // nobody prescribed.
  for (const leak of ['DROWSINESS', 'ALCOHOL', 'MACHINERY', 'CAUTION', 'VEHICLE']) {
    assert.ok(!combined.includes(leak), `${leak} leaked into a field`);
  }
});

test('keeps dispensing and provenance fields out of every field', () => {
  const fields = parseLabelFields(LABEL);
  const combined = [fields.name?.text, fields.dosage?.text, fields.instructions?.text]
    .filter(Boolean)
    .join(' ');

  // An Rx number is digits beside text and is the likeliest thing to be
  // mistaken for a dose.
  for (const leak of ['123456', 'REFILLS', 'NICOLE', 'ROSWELL', 'MAIN ST', 'EDITABLE', 'THMMD']) {
    assert.ok(!combined.includes(leak), `${leak} leaked into a field`);
  }
});

test('never reports a field as verified when the engine gave no confidence', () => {
  const fields = parseLabelFields(LABEL);
  for (const [name, value] of Object.entries(fields)) {
    // 0.8 is LOW_CONFIDENCE_THRESHOLD; below it the UI demands confirmation.
    assert.ok(value.confidence < 0.8, `${name} was presented as verified`);
  }
});

test('does not repair OCR typos', () => {
  // `MOUTHUP` and `FOoD` survive verbatim. A drug or dose "corrected" wrongly
  // is indistinguishable from one that was right, so the user checks the text
  // the engine actually produced.
  const fields = parseLabelFields(LABEL);
  assert.ok(fields.instructions?.text.includes('MOUTHUP'));
  assert.ok(fields.instructions?.text.includes('FOoD'));
});

test('classifies each line of the real label', () => {
  assert.equal(classifyLine('300 MG PILLNAMELOL'), 'product');
  assert.equal(classifyLine('TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY'), 'directions');
  assert.equal(classifyLine('AS NEEDED. TAKE WITH FOoD.'), 'directions');

  // Contains "TAKE WITH" but is a warning sticker, not a direction.
  assert.equal(classifyLine('MAY CAUSE DROWSINESS: TAKE WITH'), 'auxiliary');
  assert.equal(classifyLine('FOOD. ALCOHOL MAY INTENSIFY THIS'), 'auxiliary');
  assert.equal(classifyLine('EFFECT. USE CAUTION WHEN OPERATING'), 'auxiliary');
  assert.equal(classifyLine('A MOVING VEHICLE OR DANGEROUS'), 'auxiliary');
  assert.equal(classifyLine('MACHINERY.'), 'auxiliary');

  assert.equal(classifyLine('aTY: 20'), 'dispensing');
  assert.equal(classifyLine('REFILLS REMAINING: 1'), 'dispensing');
  assert.equal(classifyLine('RX #:123456'), 'dispensing');
  assert.equal(classifyLine('ISSUED BY:'), 'dispensing');
  assert.equal(classifyLine('SMITH. NAME M.D.'), 'dispensing');
  assert.equal(classifyLine('123 S. MAIN ST.'), 'dispensing');
  assert.equal(classifyLine('ROSWELL, NM 12345'), 'dispensing');
  assert.equal(classifyLine('Pharmacy ams'), 'dispensing');

  assert.equal(classifyLine('EDITABLE'), 'noise');
  assert.equal(classifyLine('THMMD'), 'noise');
  assert.equal(classifyLine('TEMPLATE,'), 'noise');
});

test('splits a product line written either way round', () => {
  assert.deepEqual(splitProduct('300 MG PILLNAMELOL'), {
    name: 'PILLNAMELOL',
    strength: '300 MG',
  });
  assert.deepEqual(splitProduct('PILLNAMELOL 300 MG'), {
    name: 'PILLNAMELOL',
    strength: '300 MG',
  });
  assert.deepEqual(splitProduct('Amoxicillin 500mg Capsule'), {
    name: 'Amoxicillin Capsule',
    strength: '500 MG',
  });
  assert.deepEqual(splitProduct('no strength here'), {});
});

test('leaves the product absent when two lines could be it', () => {
  // Two strengths means either two medicines or a misclassification, and the
  // text cannot say which. Picking one would be a coin flip about which drug
  // the user is holding.
  const ambiguous: RecognizedTextLine[] = [
    { text: '300 MG PILLNAMELOL', confidence: null },
    { text: '500 MG OTHERDRUG', confidence: null },
    { text: 'TAKE 1 TABLET BY MOUTH DAILY', confidence: null },
  ];
  const fields = parseLabelFields(ambiguous);
  assert.equal(fields.name, undefined);
  assert.equal(fields.dosage, undefined);
  // The directions are still unambiguous and still worth showing.
  assert.ok(fields.instructions?.text.includes('TAKE 1 TABLET'));
});

test('returns nothing rather than guessing from an unreadable label', () => {
  const junk: RecognizedTextLine[] = [
    { text: 'EDITABLE', confidence: null },
    { text: 'THMMD', confidence: null },
    { text: '...', confidence: null },
  ];
  assert.deepEqual(parseLabelFields(junk), {});
});

test('uses the weakest line when the engine does report confidence', () => {
  // iOS supplies real values. A direction assembled from a crisp line and a
  // blurred one is only as good as the blurred one.
  const mixed: RecognizedTextLine[] = [
    { text: 'TAKE 1 TABLET BY MOUTH DAILY', confidence: 0.95 },
    { text: 'AS NEEDED', confidence: 0.4 },
  ];
  assert.equal(parseLabelFields(mixed).instructions?.confidence, 0.4);
});

test('caps confidence below certainty even when the engine is sure', () => {
  const crisp: RecognizedTextLine[] = [
    { text: 'TAKE 1 TABLET BY MOUTH DAILY', confidence: 1 },
  ];
  // A perfectly recognised line can still be the wrong line.
  assert.ok(parseLabelFields(crisp).instructions!.confidence <= 0.75);
});

// --- Label 2: L-Thyroxine, a much poorer scan -----------------------------

/**
 * Fragments captured from a second, badly-read label. Not the whole page, only
 * the lines whose behaviour is being pinned down — but each is verbatim,
 * including `-Thyroxine` where the engine lost the leading `L`, and the
 * directions broken across a line in the middle of a word.
 */
const THYROXINE: RecognizedTextLine[] = [
  'Milg: Jacoo',
  'Generlic for: L-Thyeoxine',
  '-Thyroxine Tabs 80mcg',
  'PRRA Goodearth',
  'Take tablets with foodto teat',
  'egular motabosn.',
].map((text) => ({ text, confidence: null }));

test('joins directions that wrapped onto the next line', () => {
  // Stopping at "teat" would read as a complete thought missing its point.
  const fields = parseLabelFields(THYROXINE);
  assert.equal(fields.instructions?.text, 'Take tablets with foodto teat egular motabosn.');
});

test('flags a name the engine clipped', () => {
  const fields = parseLabelFields(THYROXINE);
  assert.equal(fields.name?.text, '-Thyroxine Tabs');

  // The whole point: "-Thyroxine" still reads as a drug name, so asking the
  // user to check it is not enough — they would check it and agree.
  const quality = assessReadQuality(THYROXINE, fields);
  assert.equal(quality.level, 'degraded');
  assert.ok(quality.reasons.includes('clipped-name'));
});

test('does not call the good label degraded', () => {
  const quality = assessReadQuality(LABEL, parseLabelFields(LABEL));
  assert.equal(quality.level, 'ok', `unexpected reasons: ${quality.reasons.join(', ')}`);
});

test('does not absorb a neighbouring column as a continuation', () => {
  // The regression that matters. On the interleaved label the line following
  // the directions belongs to the warning sticker, and joining it would invent
  // an instruction nobody prescribed.
  const fields = parseLabelFields(LABEL);
  assert.ok(!fields.instructions?.text.includes('EFFECT'));
  assert.ok(!fields.instructions?.text.includes('CAUTION'));
});

test('only absorbs a lowercase, unclassifiable continuation', () => {
  const newField: RecognizedTextLine[] = [
    { text: 'Take one tablet daily', confidence: null },
    // Capitalised, so a new field rather than a wrap.
    { text: 'Patient: Jane Doe', confidence: null },
  ];
  assert.equal(parseLabelFields(newField).instructions?.text, 'Take one tablet daily');
});

test('reports nothing-understood when text came back but parsed to nothing', () => {
  const unreadable: RecognizedTextLine[] = [
    'xzq wvt',
    'mmm nnn',
    'qqq rrr',
    'zzz yyy',
    'ppp ooo',
  ].map((text) => ({ text, confidence: null }));

  const quality = assessReadQuality(unreadable, parseLabelFields(unreadable));
  assert.equal(quality.level, 'degraded');
  assert.ok(quality.reasons.includes('nothing-understood'));
});

test('flags a page full of impossible capitalisation', () => {
  const garbled: RecognizedTextLine[] = ['FOoD aTY', 'tHE wORd', 'mOrE jUNk'].map((text) => ({
    text,
    confidence: null,
  }));
  const quality = assessReadQuality(garbled, parseLabelFields(garbled));
  assert.ok(quality.reasons.includes('garbled-tokens'));
});

// --- Strength: thousands, and numbers split at their comma ---------------------

test('reads a strength with a thousands separator as one number', () => {
  assert.deepEqual(splitProduct('VITAMIN D2 50,000 UNIT CAPSULE'), {
    name: 'VITAMIN D2 CAPSULE',
    strength: '50,000 UNIT',
  });
  // Leftmost strength wins, as before.
  assert.equal(splitProduct('VITAMIN D2 1.25MG(50,000 UNIT)').strength, '1.25 MG');
});

test('never finds a strength in the tail of a split number', () => {
  // A vitamin D label prints 1.25MG(50,000 UNIT). If the line wraps at the
  // comma, the second half must not pass for a strength of its own.
  assert.notEqual(classifyLine('000 UNIT)'), 'product');
  assert.deepEqual(splitProduct('000 UNIT CAPSULE'), {});
  assert.deepEqual(splitProduct('(50,00 UNIT)'), {});
  // Nor in the digit of a name like D2.
  assert.deepEqual(splitProduct('VITAMIN D2'), {});
});

// --- Verdict: judged by what the reader would be shown -------------------------

test('calls a read degraded when two of three fields failed', () => {
  // The Vitamin D2 vial as it came back: no product line survived, and the
  // directions were damaged. Nothing on the page tripped the older signals.
  const vial: RecognizedTextLine[] = [
    { text: 'Take 1 capsule (b units) by mouth eve days', confidence: 0.9 },
  ];
  const quality = assessReadQuality(vial, parseLabelFields(vial));
  assert.equal(quality.level, 'degraded');
  assert.ok(quality.reasons.includes('fields-unreadable'));
});

test('does not call a read degraded for one missing field', () => {
  // A photo of the front of the bottle: name and strength, no directions.
  const front: RecognizedTextLine[] = [{ text: 'PILLNAMELOL 300 MG', confidence: 0.9 }];
  const quality = assessReadQuality(front, parseLabelFields(front));
  assert.equal(quality.level, 'ok', `unexpected reasons: ${quality.reasons.join(', ')}`);
});

// --- A name on a line of its own ------------------------------------------------

test('finds a name printed apart from its strength', () => {
  // The real vial: name alone, strength split in two with its tail first,
  // then a "Generic for" line. The name was read cleanly and still rejected
  // while the parser required name and strength on one line.
  const fields = parseLabelFields(VITAMIN_D2_VIAL_LINES);
  assert.equal(fields.name?.text, 'VITAMIN D2');
  assert.equal(fields.dosage?.text, '1.25 MG');
  assert.equal(fields.instructions?.text, 'Take 1 capsule (b units) by mouth eve days');
});

test('takes a neighbouring name the lexicon knows, without a landmark', () => {
  const lines: RecognizedTextLine[] = [
    { text: 'LEVOTHYROXINE SODIUM', confidence: 0.9 },
    { text: '50MCG TAB', confidence: 0.9 },
    { text: 'Take 1 tablet by mouth daily', confidence: 0.9 },
  ];
  assert.equal(parseLabelFields(lines).name?.text, 'LEVOTHYROXINE SODIUM');
});

test('does not take an uncorroborated neighbour as the name', () => {
  // Shaped like a name, beside the strength — and exactly what a patient's
  // name looks like. With no landmark and no lexicon match, it stays absent.
  const lines: RecognizedTextLine[] = [
    { text: 'JANE DOE', confidence: 0.9 },
    { text: '1.25MG(50,000 UNIT)', confidence: 0.9 },
    { text: 'QTY: 4', confidence: 0.9 },
  ];
  const fields = parseLabelFields(lines);
  assert.equal(fields.name, undefined);
  assert.equal(fields.dosage?.text, '1.25 MG');
});

test('does not take a neighbour shaped like a label field or a surname-first name', () => {
  for (const neighbour of ['Patient: Jane Doe', 'DOE, JANE', 'units) by mouth']) {
    const lines: RecognizedTextLine[] = [
      { text: neighbour, confidence: 0.9 },
      { text: '1.25MG(50,000 UNIT)', confidence: 0.9 },
      { text: 'Generic for: DRISDOL', confidence: 0.9 },
    ];
    assert.equal(parseLabelFields(lines).name, undefined, neighbour);
  }
});

test('leaves the name absent when both neighbours qualify', () => {
  const lines: RecognizedTextLine[] = [
    { text: 'LEVOTHYROXINE', confidence: 0.9 },
    { text: '50 MCG', confidence: 0.9 },
    { text: 'METFORMIN', confidence: 0.9 },
  ];
  assert.equal(parseLabelFields(lines).name, undefined);
});

test('keeps a restated strength out of the name', () => {
  assert.deepEqual(splitProduct('VITAMIN D2 1.25MG(50,000 UNIT) CAP'), {
    name: 'VITAMIN D2 CAP',
    strength: '1.25 MG',
  });
  // The cut-off start of one, and a dose form alone, are not names either.
  assert.deepEqual(splitProduct('1.25MG(50,'), { name: undefined, strength: '1.25 MG' });
  assert.deepEqual(splitProduct('50MCG TAB'), { name: undefined, strength: '50 MCG' });
});

test('reads a Generic-for line as provenance, never the product', () => {
  assert.equal(classifyLine('Generic for: Calciferol,Drisdol'), 'dispensing');
  assert.equal(classifyLine('GENERIC FOR: SYNTHROID 50 MCG'), 'dispensing');
});

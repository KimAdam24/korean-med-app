/**
 * Run with: npm run test:unit
 *
 * Fixtures are the real readings from the two tested labels.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { medicationFromReading } from './reading-to-record.ts';
import type { MedicationLabelFields } from './types.ts';

function reading(name?: string, dosage?: string, instructions?: string): MedicationLabelFields {
  const field = (text: string) => ({ text, confidence: 0.5 });
  return {
    ...(name ? { name: field(name) } : {}),
    ...(dosage ? { dosage: field(dosage) } : {}),
    ...(instructions ? { instructions: field(instructions) } : {}),
  };
}

test('does not save the damaged PILLNAMELOL directions', () => {
  // Saving them would put MOUTHUP — which lost the UP of "UP TO" — onto the
  // medicine's own page under "how to take it".
  const result = medicationFromReading(
    reading(
      'PILLNAMELOL',
      '300 MG',
      'TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOoD.'
    )
  );

  assert.ok(result);
  assert.equal(result.record.name, 'PILLNAMELOL');
  assert.equal(result.record.dosage, '300 MG');
  assert.equal(result.record.instructions, undefined);
  assert.deepEqual(result.dropped, ['instructions']);
});

test('keeps a clipped name but drops damaged directions', () => {
  const result = medicationFromReading(
    reading('-Thyroxine Tabs', '80 MCG', 'Take tablets with foodto teat egular motabosn.')
  );

  assert.ok(result);
  // Kept: a name is matched against the box, where a clipped one looks wrong.
  assert.equal(result.record.name, '-Thyroxine Tabs');
  assert.equal(result.record.instructions, undefined);
  assert.deepEqual(result.dropped, ['instructions']);
  // Reported, so the screen can warn before saving a name the user has not seen.
  assert.deepEqual(result.flagged, ['name']);
  // And remembered, so the medicine's page does not identify it either.
  assert.equal(result.record.nameIncomplete, true);
});

test('saves a clean reading whole', () => {
  const result = medicationFromReading(
    reading('PILLNAMELOL', '300 MG', 'TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED.')
  );

  assert.ok(result);
  assert.equal(result.record.instructions, 'TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED.');
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.flagged, []);
  assert.equal(result.record.nameIncomplete, undefined);
});

test('drops a malformed dose', () => {
  const result = medicationFromReading(reading('PILLNAMELOL', '3OO MG'));
  assert.ok(result);
  assert.equal(result.record.dosage, undefined);
  assert.deepEqual(result.dropped, ['dosage']);
});

test('always marks a reading for review, even a clean one', () => {
  const result = medicationFromReading(reading('PILLNAMELOL', '300 MG'));
  assert.equal(result?.record.needsReview, true);
});

test('saves nothing without a name', () => {
  assert.equal(medicationFromReading(reading(undefined, '300 MG', 'TAKE 1 DAILY')), null);
  assert.equal(medicationFromReading(reading('   ')), null);
});

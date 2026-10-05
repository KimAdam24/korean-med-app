/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VITAMIN_D2_VIAL_LINES } from './eval/corpus.ts';
import { labelKindOf } from './label-kind.ts';

const read = (...texts: string[]) => texts.map((text) => ({ text, confidence: 0.9 }));

test("a pharmacy's prescription label, by its own marks", () => {
  // The vial: "Generic for: Calciferol,Drisdol".
  assert.equal(labelKindOf(VITAMIN_D2_VIAL_LINES), 'prescription');
  for (const mark of ['RX# 6012345', 'Rx: 6012345', 'REFILLS: 2', 'QTY: 30', 'DR. KIM', 'Prescriber: Dr. Lee', 'Date Filled 09/28/26', 'DISCARD AFTER 09/28/27', 'Rx only']) {
    assert.equal(labelKindOf(read('ESOMEPRAZOLE MAG DR 40MG', mark)), 'prescription', mark);
  }
});

test("a pharmacy's label that prints the prescriber's purpose is still a pharmacy's", () => {
  assert.equal(labelKindOf(read('FAMOTIDINE 20MG TAB', 'RX# 6012345', 'QTY: 60', 'PURPOSE: ACID REFLUX')), 'prescription');
});

test("an over-the-counter package, by its Drug Facts, whatever sticker is on it", () => {
  assert.equal(labelKindOf(read('Esomeprazole Magnesium Delayed-Release Capsules 20 mg', 'Drug Facts')), 'otc');
  assert.equal(labelKindOf(read('Active ingredient (in each capsule)', 'Purpose')), 'otc');
  assert.equal(labelKindOf(read('Drug Facts', 'RX# 6012345', 'QTY: 42')), 'otc');
});

test('neither, where nothing says: not guessed', () => {
  assert.equal(labelKindOf(read('ESOMEPRAZOLE MAG DR 40MG', 'TAKE 1 CAPSULE BY MOUTH DAILY')), null);
  // A store brand's "compare to" is on the box, not a pharmacy's label.
  assert.equal(labelKindOf(read('Compare to Nexium 24HR active ingredient')), null);
  // Nor a drug name that starts like a mark, nor a generic maker's.
  assert.equal(labelKindOf(read('DRISDOL 50000 UNIT')), null);
  assert.equal(labelKindOf(read("Dr. Reddy's Laboratories Limited")), null);
  assert.equal(labelKindOf(undefined), null);
});

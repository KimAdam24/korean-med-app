/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VITAMIN_D2_VIAL_LINES } from './eval/corpus.ts';
import { assessField } from './field-integrity.ts';
import { applyFillIns, expectsNumber, findGaps, gapKey } from './fill-in.ts';
import { interpretLines } from './interpret-lines.ts';

const reading = (lines = VITAMIN_D2_VIAL_LINES) => {
  const result = interpretLines(lines);
  assert.equal(result.status, 'recognized');
  if (result.status !== 'recognized') throw new Error('unreachable');
  return result;
};

test('the vial: the gaps are the misread number and the cut-off word, nothing else', () => {
  const result = reading();
  const gaps = findGaps(result.lines!, result.fields, 'instructions');
  const read = gaps.map((gap) => (gap.kind === 'word' ? gap.read : `+after ${gap.after}`));
  // "(b" is the misread 50,000 at the cut end of its line; "eve" is "every"
  // cut. The words between are fine, and are not asked for.
  assert.deepEqual(read, ['(b', 'eve']);
  assert.ok(gaps.every((gap) => gap.kind === 'word' && gap.cut));
  // "(b" shows no digit, so its box takes any text; a cut number would get
  // the number pad.
  assert.ok(!expectsNumber(gaps[0]));
  assert.ok(expectsNumber({ kind: 'word', line: 0, token: 0, read: '(50,0', cut: true }));
});

test('filled in from the bottle, the directions read whole, and are judged again', () => {
  const result = reading();
  const gaps = findGaps(result.lines!, result.fields, 'instructions');
  const typed = new Map([
    [gapKey(gaps[0]), '(50,000'],
    [gapKey(gaps[1]), 'every 7'],
  ]);
  const filled = reading(applyFillIns(result.lines!, gaps, typed));
  assert.equal(filled.fields.instructions?.text, 'Take 1 capsule (50,000 units) by mouth every 7 days');
  assert.equal(assessField('instructions', filled.fields.instructions!.text).level, 'readable');
  assert.equal(filled.truncation ?? null, null);
});

test('a half-hearted answer is not accepted as whole', () => {
  // The user fixes the number but not the interval: "every days" remains.
  const result = reading();
  const gaps = findGaps(result.lines!, result.fields, 'instructions');
  const filled = reading(applyFillIns(result.lines!, gaps, new Map([[gapKey(gaps[0]), '(50,000']])));
  const text = filled.fields.instructions?.text ?? '';
  assert.notEqual(assessField('instructions', text).level === 'readable' && !filled.truncation, true);
});

test('a missing number between two words is an empty box between them', () => {
  const lines = [
    { text: 'LISINOPRIL 10 MG TABLET', confidence: 0.9 },
    { text: 'Take 1 tablet by mouth every days', confidence: 0.9 },
  ];
  const result = reading(lines);
  const gaps = findGaps(result.lines!, result.fields, 'instructions');
  const insert = gaps.find((gap) => gap.kind === 'insert');
  assert.ok(insert);
  const filled = reading(applyFillIns(result.lines!, gaps, new Map([[gapKey(insert!), '3']])));
  assert.equal(filled.fields.instructions?.text, 'Take 1 tablet by mouth every 3 days');
});

test('a misread count is a box holding the misread, to be corrected', () => {
  // "every 7" read as "ee" at the curve of a bottle (a sweep replay).
  const lines = [
    { text: 'VITAMIN D2 1.25 MG CAPSULE', confidence: 0.9 },
    { text: 'Take 1 capsule by mouth ee days', confidence: 0.9 },
  ];
  const result = reading(lines);
  const gaps = findGaps(result.lines!, result.fields, 'instructions');
  assert.deepEqual(
    gaps.map((gap) => (gap.kind === 'word' ? gap.read : 'insert')),
    ['ee']
  );
  const filled = reading(applyFillIns(result.lines!, gaps, new Map([[gapKey(gaps[0]), 'every 7']])));
  assert.equal(filled.fields.instructions?.text, 'Take 1 capsule by mouth every 7 days');
  assert.equal(assessField('instructions', filled.fields.instructions!.text).level, 'readable');
});

test('nothing typed changes nothing', () => {
  const result = reading();
  const gaps = findGaps(result.lines!, result.fields, 'instructions');
  const same = applyFillIns(result.lines!, gaps, new Map());
  assert.deepEqual(same, result.lines);
});

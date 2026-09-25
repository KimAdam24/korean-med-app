/**
 * Run with: npm run test:unit
 *
 * The sweep's merge, against frames built to the shape of the vitamin D2 vial
 * turning in a hand. No real sweep has been recorded yet — the frames here are
 * hand-built, each a plausible single reading — so these pin the rules, not the
 * real-world recovery rate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assessField } from '../field-integrity.ts';
import type { RecognizedTextLine } from '../types.ts';
import { EMPTY_SWEEP, addFrame, mergeSweep, type SweepState } from './merge.ts';

/** A made-up vial, as printed. */
const PRINTED = [
  'JANE DOE',
  '12 OAK ST, SPRINGFIELD, MA 01101',
  'VITAMIN D2',
  '1.25MG(50,',
  '000 UNIT)',
  'Generic for: Calciferol, Drisdol',
  'Take 1 capsule (50,000',
  'units) by mouth every 7',
  'days',
];
const TRUTH = 'Take 1 capsule (50,000 units) by mouth every 7 days';

/** One frame: the printed lines with some read differently, laid out level. */
function frame(overrides: Record<number, string | null> = {}, width = 700): RecognizedTextLine[] {
  return PRINTED.flatMap((printed, index) => {
    const text = index in overrides ? overrides[index] : printed;
    if (text === null) return [];
    const right = Math.min(width, 100 + text.length * 26);
    return [
      {
        text,
        confidence: 0.8,
        frame: { left: 100, top: index * 60, width: right - 100, height: 40 },
        corners: [
          { x: 100, y: index * 60 },
          { x: right, y: index * 60 },
          { x: right, y: index * 60 + 40 },
          { x: 100, y: index * 60 + 40 },
        ],
      },
    ];
  });
}

/** Facing the camera: the ends of the two long direction lines are round the curve. */
const FACING = frame({ 6: 'Take 1 capsule (50,0', 7: 'units) by mouth every' });

const sweep = (...frames: RecognizedTextLine[][]): SweepState =>
  frames.reduce((state, next) => addFrame(state, next), EMPTY_SWEEP);

const directions = (state: SweepState) => mergeSweep(state)?.result.fields.instructions?.text;

test('one frame is the single capture: the cut directions are withheld', () => {
  const merged = mergeSweep(sweep(FACING))!;
  assert.equal(merged.complete, false);
  assert.deepEqual(merged.result.truncation?.fields, ['instructions']);
  assert.equal(merged.result.truncation?.diagnosed, true);
});

test('a frame that read everything is used as it is', () => {
  const merged = mergeSweep(sweep(FACING, frame()))!;
  assert.equal(merged.complete, true);
  assert.equal(directions(sweep(FACING, frame())), TRUTH);
  assert.deepEqual(merged.replaced, []);
});

test('beats one photograph: each cut line completed by a different frame, each verbatim', () => {
  // Turned a little: the first direction line fits, the second is still cut.
  const turned = frame({ 7: 'units) by mouth every' });
  // Turned further: the second fits, the first has lost its start.
  const further = frame({ 0: 'NE DOE', 6: 'ke 1 capsule (50,000' });
  const merged = mergeSweep(sweep(FACING, turned, further))!;

  assert.equal(merged.result.fields.instructions?.text, TRUTH);
  assert.equal(merged.complete, true);
  const lines = merged.result.lines!.map((line) => line.text);
  assert.ok(lines.includes('Take 1 capsule (50,000'));
  assert.ok(lines.includes('units) by mouth every 7'));
});

test('never blends: two partial readings of one line are not stitched together', () => {
  // The left of line 6 from one frame, its right from another, and no frame
  // with both. "Take 1 capsule (50,000" is obviously what they add up to, and
  // it is exactly what must not be made.
  const leftCut = frame({ 6: 'ke 1 capsule (50,000', 7: 'units) by mouth every 7' });
  const merged = mergeSweep(sweep(FACING, leftCut))!;

  assert.equal(merged.complete, false);
  assert.ok(merged.result.truncation?.fields.includes('instructions'));
  assert.ok(!merged.result.lines!.some((line) => line.text === 'Take 1 capsule (50,000'));
});

test('a disagreement in what both frames show is never settled by picking one', () => {
  const misread = frame({ 6: 'Take 1 capsu1e (50,0', 7: 'units) by mouth every' });
  const full = frame({ 0: 'NE DOE', 1: 'OAK ST, SPRINGFIELD, MA 01101', 5: 'eneric for: Calciferol, Drisdol' });
  const merged = mergeSweep(sweep(misread, full))!;
  // The complete frame wins as base only if it is the cleaner reading; here it
  // is, so the misread never reaches the result either way.
  assert.ok(!merged.result.lines!.some((line) => line.text.includes('capsu1e')));
});

test('a line the engine ran into its neighbour is not taken as a better reading of either', () => {
  const joined = frame({ 6: 'Take 1 capsule (50,000 units) by mouth every 7', 7: null });
  const merged = mergeSweep(sweep(FACING, joined))!;
  assert.equal(merged.complete, false);
  assert.deepEqual(merged.replaced, []);
});

test('a reading that happens to contain the line, elsewhere on the label, is not the line', () => {
  const elsewhere: RecognizedTextLine[] = [
    ...frame({ 6: 'Take 1 capsule (50,0', 7: 'units) by mouth every' }).slice(0, 3),
    {
      text: 'Take 1 capsule (50,0000',
      confidence: 0.9,
      frame: { left: 900, top: 900, width: 500, height: 40 },
      corners: [
        { x: 900, y: 900 },
        { x: 1400, y: 900 },
        { x: 1400, y: 940 },
        { x: 900, y: 940 },
      ],
    },
  ];
  const merged = mergeSweep(sweep(FACING, elsewhere))!;
  assert.deepEqual(merged.replaced, []);
});

test('a better reading that is still cut is used, and still withholds its field', () => {
  const closer = frame({ 6: 'Take 1 capsule (50,00', 7: 'units) by mouth every 7' });
  const merged = mergeSweep(sweep(FACING, closer))!;
  assert.ok(merged.result.lines!.some((line) => line.text === 'Take 1 capsule (50,00'));
  assert.equal(merged.complete, false);
  assert.ok(merged.result.truncation?.fields.includes('instructions'));
});

test('damage detection runs on the merged result, not only on the frames', () => {
  // The extension read `O` for `0`: longer, containing, and damaged.
  const damaged = frame({ 6: 'Take 1 capsule (50,00O', 7: 'units) by mouth every 7' });
  const merged = mergeSweep(sweep(FACING, damaged))!;
  const text = merged.result.fields.instructions?.text ?? '';
  assert.equal(assessField('instructions', text).level, 'damaged');
  assert.equal(merged.complete, false);
});

test('glimpses are counted and ignored; the base survives a long sweep', () => {
  let state = sweep(FACING, [{ text: 'VITAMIN', confidence: 0.9 }]);
  assert.equal(state.seen, 2);
  assert.equal(state.frames.length, 1);

  state = addFrame(state, frame());
  for (let index = 0; index < 80; index += 1) state = addFrame(state, FACING);
  assert.equal(state.frames.length, 60);
  assert.equal(mergeSweep(state)?.complete, true);
});

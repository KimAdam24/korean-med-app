/**
 * Run with: npm run test:unit
 *
 * The merge on real recogniser output: sweeps replayed on an emulator, frame
 * by frame, as the device received them (see `replay-fixtures.ts`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assessField } from '../field-integrity.ts';
import type { RecognizedTextLine } from '../types.ts';
import { EMPTY_SWEEP, addFrame, mergeSweep, type MergedReading } from './merge.ts';
import { SYNTHETIC_IMAGES, SYNTHETIC_STAGGERED } from './replay-fixtures.ts';
import { expand, type CompactLine } from './replay-log.ts';

const TRUTH = 'Take 1 capsule (50,000 units) by mouth every 7 days';

/** The merge after each frame, as the sweep screen saw it. */
function sweepThrough(frames: readonly (readonly CompactLine[])[]): MergedReading[] {
  let state = EMPTY_SWEEP;
  return frames.map((frame) => {
    state = addFrame(state, frame.map(expand) as RecognizedTextLine[]);
    return mergeSweep(state)!;
  });
}

test('left-aligned: complete, and correct, at the fourth frame, where the device stopped by itself', () => {
  const merges = sweepThrough(SYNTHETIC_IMAGES);
  assert.deepEqual(
    merges.map((merged) => merged.complete),
    [false, false, false, true]
  );
  const done = merges[3].result.fields;
  assert.equal(done.name?.text, 'VITAMIN D2');
  assert.equal(done.dosage?.text, '1.25 MG (50,000 UNIT)');
  assert.equal(done.instructions?.text, TRUTH);
});

test('the recogniser misreads squashed text as words, and none of them is ever shown as the directions', () => {
  const lines = SYNTHETIC_STAGGERED.flatMap((frame) => frame.map((line) => line.t));
  // What it made of "units) by mouth every 7" at the curve.
  for (const misread of ['units) by mouthe', 'units) by mouth er', 'units) by mouth ee', 'units) by mouth even']) {
    assert.ok(lines.includes(misread), misread);
  }
  // At no point in the sweep do the directions read whole unless they are right.
  for (const merged of sweepThrough(SYNTHETIC_STAGGERED)) {
    const text = merged.result.fields.instructions?.text;
    const shown = text && assessField('instructions', text).level === 'readable' &&
      !merged.result.truncation?.fields.includes('instructions');
    if (shown) assert.equal(text, TRUTH);
  }
});

test('staggered: the cut direction line is replaced, verbatim, by a frame that read it whole', () => {
  const last = sweepThrough(SYNTHETIC_STAGGERED).at(-1)!;
  const replaced = last.replaced.map((index) => last.result.lines![index].text);
  assert.deepEqual(replaced, ['units) by mouth every 7']);
  // Still not complete: the parser joins a direction's lines only when they
  // start level, and these are indented; so the directions are withheld.
  assert.equal(last.complete, false);
});

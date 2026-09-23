/**
 * Run with: npm run test:unit
 *
 * Synthetic geometry, built to reproduce the shapes that matter. Real geometry
 * belongs in the evaluation corpus, and is what these rules are ultimately
 * judged against.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { orderLines } from './reading-order.ts';
import type { RecognizedTextLine } from './types.ts';

/**
 * A line whose top edge starts at (left, top) and rises or falls by `slope`
 * per pixel across its width — the shape an engine reports for text on a
 * tilted or curved surface. Image y grows downwards, so a negative slope rises
 * to the right.
 */
function line(text: string, left: number, top: number, width: number, height: number, slope = 0) {
  const rise = slope * width;
  return {
    text,
    confidence: null,
    frame: { left, top: Math.min(top, top + rise), width, height: height + Math.abs(rise) },
    corners: [
      { x: left, y: top },
      { x: left + width, y: top + rise },
      { x: left + width, y: top + rise + height },
      { x: left, y: top + height },
    ],
  } satisfies RecognizedTextLine;
}

const texts = (lines: readonly RecognizedTextLine[]) => lines.map((entry) => entry.text);

test('leaves lines without geometry exactly as they came', () => {
  // Readings recorded before geometry existed were sorted natively.
  const lines = ['c', 'a', 'b'].map((text) => ({ text, confidence: null }));
  assert.deepEqual(texts(orderLines(lines)), ['c', 'a', 'b']);
});

test('orders level rows top to bottom and left to right', () => {
  const lines = [
    line('row 2 right', 200, 60, 100, 20),
    line('row 1', 0, 20, 150, 20),
    line('row 2 left', 0, 62, 150, 20),
  ];
  assert.deepEqual(texts(orderLines(lines)), ['row 1', 'row 2 left', 'row 2 right']);
});

test('keeps both pieces of a curved printed line on one row', () => {
  // The vial's shape: a heading, then a printed line the engine broke in two,
  // bending upwards to the right with the bottle, then the line below it.
  // The right piece's centre is more than half a line above the left piece's,
  // so banding by height alone puts it in a row of its own, first — which is
  // what the native ordering did.
  const heading = line('VITAMIN D2', 0, 50, 180, 30);
  const start = line('1.25MG(50,', 0, 100, 200, 20, -0.04);
  const tail = line('000 UNIT)', 210, 91.5, 120, 20, -0.12);
  const below = line('Generic for: Calciferol,Drisdol', 0, 130, 300, 20);

  const startCentre = (100 + 92 + 112 + 120) / 4;
  const tailCentre = (91.5 + 77.1 + 97.1 + 111.5) / 4;
  assert.ok(startCentre - tailCentre > 10, 'the fixture must defeat level banding');

  assert.deepEqual(texts(orderLines([below, tail, heading, start])), [
    'VITAMIN D2',
    '1.25MG(50,',
    '000 UNIT)',
    'Generic for: Calciferol,Drisdol',
  ]);
});

test('reads a photograph taken at a tilt', () => {
  // Every row rises steeply to the right, so the right half of each row sits
  // higher than the left half of the row above it.
  const slope = -0.3;
  const rows = [0, 1, 2].flatMap((row) => {
    const top = 100 + 40 * row;
    return [
      line(`row ${row} left`, 0, top, 150, 20, slope),
      line(`row ${row} right`, 170, top + slope * 170, 150, 20, slope),
    ];
  });
  const shuffled = [rows[3], rows[0], rows[5], rows[2], rows[1], rows[4]];

  assert.deepEqual(texts(orderLines(shuffled)), [
    'row 0 left',
    'row 0 right',
    'row 1 left',
    'row 1 right',
    'row 2 left',
    'row 2 right',
  ]);
});

test('keeps closely stacked lines on separate rows', () => {
  // Line spacing barely more than the text height: overlapping horizontally,
  // they are above and below each other whatever the tolerance.
  const lines = [line('second', 0, 22, 200, 20), line('first', 0, 0, 200, 20)];
  assert.deepEqual(texts(orderLines(lines)), ['first', 'second']);
});

test('interleaves columns that share rows, as before', () => {
  // Documented behaviour, not a goal: column detection is separate work.
  const lines = [
    line('right 2', 200, 40, 150, 20),
    line('left 1', 0, 0, 150, 20),
    line('left 2', 0, 40, 150, 20),
    line('right 1', 200, 0, 150, 20),
  ];
  assert.deepEqual(texts(orderLines(lines)), ['left 1', 'right 1', 'left 2', 'right 2']);
});

test('places lines with a frame but no corners as if level', () => {
  const lines: RecognizedTextLine[] = [
    { text: 'below', confidence: null, frame: { left: 0, top: 50, width: 100, height: 20 } },
    { text: 'above', confidence: null, frame: { left: 0, top: 0, width: 100, height: 20 } },
  ];
  assert.deepEqual(texts(orderLines(lines)), ['above', 'below']);
});

test('puts lines without geometry last, in engine order', () => {
  const lines: RecognizedTextLine[] = [
    { text: 'unplaced 1', confidence: null },
    line('placed 2', 0, 50, 100, 20),
    { text: 'unplaced 2', confidence: null },
    line('placed 1', 0, 0, 100, 20),
  ];
  assert.deepEqual(texts(orderLines(lines)), ['placed 1', 'placed 2', 'unplaced 1', 'unplaced 2']);
});

test('ignores a slope steep enough to mean sideways text', () => {
  // Past 45° the corners describe rotated text, not a tilted row, and
  // extrapolating along them would scatter lines. Placed as level instead.
  const lines = [line('second', 0, 60, 100, 20, 3), line('first', 0, 0, 100, 20)];
  assert.deepEqual(texts(orderLines(lines)), ['first', 'second']);
});

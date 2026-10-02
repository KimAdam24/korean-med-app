/**
 * Run with: npm run test:unit
 *
 * The curved-label diagnosis: that it fires on the two real captures of the
 * vial whose directions run off round the curve, names the lines and the field
 * they cut, and stays silent on flat labels — including the ones built to
 * tempt it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assessField, endsCutOff, startsCutOff } from './field-integrity.ts';
import { interpretLines } from './interpret-lines.ts';
import { medicationFromReading } from './reading-to-record.ts';
import { isCutAtEdge } from './truncation.ts';
import type { RecognizedTextLine } from './types.ts';
import { VITAMIN_D2_VIAL_LINES, VITAMIN_D2_VIAL_NO_GEOMETRY_LINES, VITAMIN_D2_VIAL_RETAKE_LINES } from './eval/corpus.ts';
import { scoreField } from './eval/score.ts';

/** A line laid out on a level page: `end` is where its right edge falls. */
function at(text: string, top: number, end: number, start = 100, height = 40, slope = 0): RecognizedTextLine {
  const width = end - start;
  const rise = slope * width;
  return {
    text,
    confidence: 0.9,
    frame: { left: start, top: Math.min(top, top + rise), width, height: height + Math.abs(rise) },
    corners: [
      { x: start, y: top },
      { x: end, y: top + rise },
      { x: end, y: top + rise + height },
      { x: start, y: top + height },
    ],
  };
}

const diagnose = (lines: readonly RecognizedTextLine[]) => {
  const result = interpretLines(lines);
  assert.equal(result.status, 'recognized');
  return result.status === 'recognized' ? result.truncation : undefined;
};

// --- The real captures --------------------------------------------------------

test('the vial, first capture: the two direction lines are cut on the right; name and strength are whole', () => {
  const edge = diagnose(VITAMIN_D2_VIAL_LINES);
  assert.equal(edge?.side, 'right');
  assert.equal(edge?.diagnosed, true);
  assert.deepEqual(edge?.fields, ['instructions']);
  const result = interpretLines(VITAMIN_D2_VIAL_LINES);
  const cut = edge!.cutLines.map((index) => (result.status === 'recognized' ? result.lines![index].text : ''));
  assert.deepEqual(cut, ['Take 1 capsule (b', 'units) by mouth eve']);
});

test('the vial, retaken as well as one photo can: still cut on the right, at the same place', () => {
  const edge = diagnose(VITAMIN_D2_VIAL_RETAKE_LINES);
  assert.equal(edge?.side, 'right');
  assert.equal(edge?.diagnosed, true);
  // Found even though the parser could not place these lines in a field: the
  // label's left edge read as a leading `|`, and "|Take" is not a direction.
  assert.deepEqual(edge?.fields, ['instructions']);
  const result = interpretLines(VITAMIN_D2_VIAL_RETAKE_LINES);
  const cut = edge!.cutLines.map((index) => (result.status === 'recognized' ? result.lines![index].text : ''));
  assert.deepEqual(cut, ['|Take 1 capsule (50,0', 'units) by mouth every']);
});

test('without geometry nothing is said about an edge', () => {
  assert.equal(diagnose(VITAMIN_D2_VIAL_NO_GEOMETRY_LINES), null);
});

// --- Flat labels, which must not be called curved ----------------------------

test('a flat label with a ragged right edge: lines end where their words do', () => {
  assert.equal(
    diagnose([
      at('LISINOPRIL 10 MG TABLET', 0, 560),
      at('Take 1 tablet by mouth once', 60, 700),
      at('daily for blood pressure', 120, 600),
      at('QTY: 30', 180, 260),
    ]),
    null
  );
});

test('a flat label whose direction lines reach the margin together, on whole words', () => {
  assert.equal(
    diagnose([
      at('LISINOPRIL 10 MG TABLET', 0, 560),
      at('Take 1 tablet by mouth twice', 60, 700),
      at('daily with food and water', 120, 702),
      at('QTY: 60', 180, 260),
    ]),
    null
  );
});

test('one damaged line at the margin is not called a curve, but its field is withheld', () => {
  const edge = diagnose([
    at('LISINOPRIL 10 MG TABLET', 0, 560),
    at('Take 1 tablet by mouth eve', 60, 700),
    at('day with food and plenty of water', 120, 702),
    at('QTY: 30', 180, 260),
  ]);
  assert.equal(edge?.diagnosed, false);
  assert.deepEqual(edge?.fields, ['instructions']);
});

test('damaged line ends that do not line up are not a curve', () => {
  const edge = diagnose([
    at('LISINOPRIL 10 MG TABLET', 0, 560),
    at('Take 1 tablet (50,0', 60, 700),
    at('units) by mouth eve', 120, 520),
    at('days as needed', 180, 400),
  ]);
  // Only the widest line is at the edge, so only its field is withheld.
  assert.equal(edge?.diagnosed, false);
});

// --- Curves the real captures do not show ------------------------------------

test('a curve on a tilted photo is found along the text, not the image', () => {
  const edge = diagnose([
    at('VITAMIN D2', 0, 420, 100, 40, 0.14),
    at('Take 1 capsule (50,0', 60, 700, 100, 40, 0.14),
    at('units) by mouth eve', 120, 698, 100, 40, 0.14),
    at('days', 180, 220, 100, 40, 0.14),
  ]);
  assert.equal(edge?.side, 'right');
});

test('a label cut on the left, as when the bottle is turned the other way', () => {
  const edge = diagnose([
    at('VITAMIN D2', 0, 520, 300),
    at('nits) by mouth every 7 days', 60, 700, 100),
    at('ith food and water', 120, 600, 102),
    at('QTY: 4', 180, 420, 300),
  ]);
  assert.equal(edge?.side, 'left');
});

// --- Why a cut field is withheld even when it reads cleanly -------------------

test('a cut can leave directions that read cleanly and wrongly; they are withheld', () => {
  // "every other day … up to 2 a day", with `other` and `2` round the curve.
  const lines = [
    at('LISINOPRIL 10 MG TABLET', 0, 520),
    at('Take 1 tablet by mouth every', 60, 700),
    at('day with food. May take up to', 120, 701),
    at('a day if needed', 180, 360),
  ];
  const result = interpretLines(lines);
  assert.equal(result.status, 'recognized');
  if (result.status !== 'recognized') return;
  const directions = result.fields.instructions?.text ?? '';

  // Nothing in the text alone gives it away …
  assert.equal(assessField('instructions', directions).level, 'readable');
  // … but the edge does, and the field is withheld and not saved.
  assert.deepEqual(result.truncation?.fields, ['instructions']);
  // Scored as the result screen shows it: cut at the edge, so withheld.
  assert.equal(scoreField('instructions', directions, 'anything', isCutAtEdge(result.truncation, 'instructions')), 'withheld');
  assert.equal(medicationFromReading(result.fields, result.truncation)?.record.instructions, undefined);
});

// --- The text evidence --------------------------------------------------------

test('what counts as a line cut at its end, and what is an ordinary wrap', () => {
  assert.ok(endsCutOff('Take 1 capsule (50,0'));
  assert.ok(endsCutOff('Take 1 capsule (b'));
  assert.ok(endsCutOff('units) by mouth eve', 'days'));
  assert.ok(endsCutOff('units) by mouth every', 'days'));
  assert.ok(endsCutOff('May take up to', 'a day'));

  assert.ok(!endsCutOff('1.25MG(50,', '000 UNIT)'));
  assert.ok(!endsCutOff('Take 1 capsule (50,000', 'units) by mouth'));
  assert.ok(!endsCutOff('by mouth every', '7 days'));
  assert.ok(!endsCutOff('Take', 'one tablet'));
  assert.ok(!endsCutOff('Generic for: Calciferol, Drisdol'));

  assert.ok(startsCutOff('nits) by mouth'));
  assert.ok(!startsCutOff('units) by mouth'));
  assert.ok(!startsCutOff('000 UNIT)'));
});

test('after a fill-in, a field withheld at the edge stays withheld unless it was the one filled', async () => {
  const { keepWithheld } = await import('./truncation.ts');
  const before = { side: 'right' as const, diagnosed: true, cutLines: [7, 8], edgeLines: [3], fields: ['name', 'instructions'] as const };
  // The directions filled: no line looks cut any more, so no edge is found at all.
  const kept = keepWithheld({ ...before, fields: [...before.fields] }, null, ['instructions']);
  assert.deepEqual(kept?.fields, ['name']);
  // Everything that was withheld, filled: the new reading's own judgement stands.
  assert.equal(keepWithheld({ ...before, fields: [...before.fields] }, null, ['name', 'instructions']), null);
  // Nothing withheld before: as the new reading has it.
  assert.equal(keepWithheld(null, null, ['instructions']), null);
});

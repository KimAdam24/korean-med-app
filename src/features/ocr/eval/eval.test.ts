/**
 * Run with: npm run test:unit
 *
 * The evaluation corpus as a test. It fails on the one thing that must never
 * happen — a field shown as the value that is not what the label says — and on
 * any field doing worse than it did when its `expected` was last set. Misses
 * are allowed; they are what the scorecard (`npm run eval`) is for.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CORPUS } from './corpus.ts';
import { FIELD_KINDS, isWorse, scoreCase, scoreField, type Outcome } from './score.ts';

for (const entry of CORPUS) {
  test(`eval: ${entry.id}`, (t) => {
    if (entry.source === 'real-label' && entry.lines !== null) {
      assert.equal(entry.redacted, true, 'a real label must be redacted before its lines are committed');
    }

    const score = scoreCase(entry);
    if (score.status === 'pending') {
      t.skip('lines not captured yet');
      return;
    }

    for (const kind of FIELD_KINDS) {
      const { outcome, shown }: { outcome: Outcome; shown?: string } = score.fields[kind];
      assert.notEqual(outcome, 'wrong', `${kind} shown as "${shown}", which is not what the label says`);

      const expected = entry.expected?.[kind];
      if (expected) {
        assert.ok(!isWorse(outcome, expected), `${kind} was ${expected}, is now ${outcome}`);
      }
    }

    if (entry.expectedVerdict) {
      assert.equal(score.verdict, entry.expectedVerdict);
    }

    // Exact, both ways: a missed curve is a regression, and so is a new one.
    assert.deepEqual(
      score.edge
        ? { side: score.edge.side, fields: score.edge.fields, diagnosed: score.edge.diagnosed }
        : undefined,
      entry.expectedEdge
        ? { side: entry.expectedEdge.side, fields: [...entry.expectedEdge.fields], diagnosed: entry.expectedEdge.diagnosed }
        : undefined,
      'curved-edge diagnosis'
    );
  });
}

test('ids are unique', () => {
  const ids = CORPUS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- The scorer itself --------------------------------------------------------

test('a damaged field is withheld, never correct or wrong', () => {
  assert.equal(scoreField('instructions', 'Take 1 capsule (b units) by mouth eve days', 'anything'), 'withheld');
});

test('a clean field that differs from the label is wrong', () => {
  assert.equal(scoreField('dosage', '30 MG', '300 MG'), 'wrong');
});

test('the space that carries the meaning is not normalised away', () => {
  // If normalisation dropped spaces, a merged "MOUTHUP TO" that slipped past
  // integrity would score as correct against "MOUTH UP TO".
  assert.equal(scoreField('name', 'PILLNAME LOL', 'PILLNAMELOL'), 'wrong');
});

test('case, spacing and a final full stop are not differences', () => {
  assert.equal(scoreField('instructions', 'take 1 tablet  daily.', 'TAKE 1 TABLET DAILY'), 'correct');
});

test('anything shown for a field the label does not print is wrong', () => {
  assert.equal(scoreField('dosage', '300 MG', null), 'wrong');
  assert.equal(scoreField('dosage', undefined, null), 'correct');
});

test('any accepted rendering counts', () => {
  assert.equal(scoreField('dosage', '50,000 UNIT', ['1.25 MG', '50,000 UNIT']), 'correct');
});

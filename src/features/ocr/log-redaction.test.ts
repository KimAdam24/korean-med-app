/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isEvidentlyLabelText, redactForLog } from './log-redaction.ts';

test('who and where is redacted; what the label says is kept', () => {
  // A made-up dispensed label, in the shape of the real vial.
  const kept = [
    'VITAMIN D2',
    '1.25MG(50,',
    '000 UNIT)',
    'Generic for: Calciferol, Drisdol',
    '|Take 1 capsule (50,0',
    'units) by mouth every',
    '|days',
    '7 days',
    'QTY: 4 REFILLS: 0',
    'MAY CAUSE DROWSINESS',
  ];
  const redacted = [
    'Jane',
    'Doe',
    '12 Oak St, Springfield, MA 01101',
    'RX# 1234567',
    'DR. JOHN SMITH MD',
    'Filled: 09/24/2026',
    'CORNER PHARMACY (617) 555-0100',
    'Lisa May',
    '555-0100',
  ];
  for (const text of kept) assert.ok(isEvidentlyLabelText(text), `should keep ${text}`);
  for (const text of redacted) assert.ok(!isEvidentlyLabelText(text), `should redact ${text}`);
});

test('redaction keeps the shape and the geometry, and nothing of the letters', () => {
  const [line] = redactForLog([
    { text: '12 Oak St, MA 01101', confidence: 0.8, frame: { left: 1, top: 2, width: 3, height: 4 } },
  ]);
  assert.equal(line.text, '00 Xxx Xx, XX 00000');
  assert.equal(line.confidence, 0.8);
  assert.deepEqual(line.frame, { left: 1, top: 2, width: 3, height: 4 });
});

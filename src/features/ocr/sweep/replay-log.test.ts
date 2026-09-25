/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecognizedTextLine } from '../types.ts';
import { compact, expand } from './replay-log.ts';

test('a logged line reads back as the line, to the pixel', () => {
  const line: RecognizedTextLine = {
    text: 'Take 1 capsule (50,0',
    confidence: 0.81234,
    frame: { left: 100.4, top: 360.6, width: 520.2, height: 40 },
    corners: [
      { x: 100.4, y: 360.6 },
      { x: 620.6, y: 361 },
      { x: 620.6, y: 401 },
      { x: 100.4, y: 400.6 },
    ],
  };
  assert.deepEqual(expand(JSON.parse(JSON.stringify(compact(line)))), {
    text: 'Take 1 capsule (50,0',
    confidence: 0.812,
    frame: { left: 100, top: 361, width: 520, height: 40 },
    corners: [
      { x: 100, y: 361 },
      { x: 621, y: 361 },
      { x: 621, y: 401 },
      { x: 100, y: 401 },
    ],
  });
});

test('a line without geometry stays without it', () => {
  assert.deepEqual(expand(compact({ text: 'days', confidence: null })), { text: 'days', confidence: null });
});

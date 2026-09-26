/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HEADER, WARNINGS, parseSigDraft, phrasesCsv, sheetOrder } from './sig-phrases-export.ts';

const DRAFT = readFileSync(new URL('../content-drafts/sig-phrases.draft.md', import.meta.url), 'utf8');
const rows = parseSigDraft(DRAFT);

test('every row of the draft is read: its 37 phrases and its 2 worked examples', () => {
  const ids = rows.map((row) => row.id);
  const expected = [
    ...Array.from({ length: 7 }, (_, i) => `Q${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `R${i + 1}`),
    ...Array.from({ length: 13 }, (_, i) => `F${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `C${i + 1}`),
    'K1',
    'K2',
  ];
  assert.deepEqual(ids, expected);
  assert.ok(rows.every((row) => row.en.trim().length > 0));
});

test('reads each row as written, and "by mouth, implied" as the English it matches', () => {
  assert.deepEqual(rows.find((row) => row.id === 'F13'), {
    id: 'F13',
    section: 'Frequency',
    en: 'UP TO 3 TIMES DAILY',
    ko: '하루 세 번까지',
    notes: '?? See the flagged section at the top of this document — do not approve in a routine pass',
  });
  const r2 = rows.find((row) => row.id === 'R2')!;
  assert.equal(r2.en, 'BY MOUTH');
  assert.equal(r2.ko, '');
  assert.equal(rows.find((row) => row.id === 'K2')!.en, 'TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOOD.');
});

test('UP TO 3 TIMES DAILY is the first row, with its warning in plain terms; the other limits follow', () => {
  const ordered = sheetOrder(rows);
  assert.deepEqual(ordered.slice(0, 4).map((row) => row.id), ['F13', 'K2', 'C6', 'C7']);
  assert.match(WARNINGS.F13, /limit, not a schedule/);
  assert.match(WARNINGS.F13, /three times a day/);
  assert.match(WARNINGS.F13, /triple/);
  // Every row is still there, once.
  assert.equal(new Set(ordered.map((row) => row.id)).size, rows.length);
});

test('the sheet has the copy batch’s shape, a formula per row, and opens in Excel', () => {
  const csv = phrasesCsv(rows);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines[0], HEADER.join(','));
  assert.equal(lines.length, rows.length + 1);
  assert.ok(lines[1].startsWith('1,"READ THIS ROW FIRST.'));
  assert.ok(lines[1].includes('=IF(J2=""""'));
  assert.ok(lines[1].endsWith(',F13'));
});

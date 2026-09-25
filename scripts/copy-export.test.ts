/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { pendingCopy } from '../src/i18n/pending.ts';
import { Strings } from '../src/i18n/strings.ts';
import { COPY_CONTEXT, SECTIONS } from './copy-context.ts';
import { HEADER, exportCsv, exportRows, missingContext } from './copy-export.ts';

test('every string awaiting Korean says where it appears and when', () => {
  // The translator does not have the app; a string with no context is a guess.
  assert.deepEqual(missingContext(pendingCopy(Strings)), []);
});

test('context is kept only for strings that exist', () => {
  // Stale entries are harmless to the export, but mean a key was renamed and
  // its context left behind.
  const keys = new Set(pendingCopy(Strings).map(({ key }) => key));
  const known = (key: string) => keys.has(key) || key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], Strings) !== undefined;
  assert.deepEqual(Object.keys(COPY_CONTEXT).filter((key) => !known(key)), []);
});

test('the export is every pending string once, grouped by section in order', () => {
  const pending = pendingCopy(Strings);
  const rows = exportRows(pending);
  assert.equal(rows.length, pending.length);
  assert.equal(new Set(rows.map((row) => row.copy.key)).size, rows.length);
  const sections = rows.map((row) => SECTIONS.indexOf(row.context.section));
  assert.deepEqual(sections, [...sections].sort((a, b) => a - b));
  // What prompted the batch leads it: the curved-label notice on the result screen.
  assert.equal(rows[0].copy.key, 'result.curved.title');
});

test('the CSV survives quotes, commas and Korean, and opens in Excel', () => {
  const csv = exportCsv([
    {
      copy: { key: 'x.y', en: 'Open "Alarms & reminders", then return', note: 'A note' },
      context: { section: SECTIONS[0], where: 'Here', when: 'Now', notes: '다시 찍기 is beside it' },
    },
  ]);
  assert.ok(csv.startsWith('﻿'));
  const [header, row] = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(header, HEADER.join(','));
  assert.equal(
    row,
    `1,${SECTIONS[0]},Here,Now,"Open ""Alarms & reminders"", then return",A note 다시 찍기 is beside it,,x.y`
  );
});

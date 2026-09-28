/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { pendingCopy } from '../src/i18n/pending.ts';
import { Strings } from '../src/i18n/strings.ts';
import { COPY_CONTEXT, SECTIONS } from './copy-context.ts';
import { HEADER, exportCsv, exportRows, heldBack, missingContext, missingDrafts, type CopyDrafts } from './copy-export.ts';

const DRAFTS: CopyDrafts = JSON.parse(
  readFileSync(new URL('../content-drafts/copy-batch.draft.json', import.meta.url), 'utf8')
);
const HANGUL = /[가-힣]/;
const placeholders = (text: string) => [...text.matchAll(/\{[^}]+\}/g)].map(([match]) => match).sort();

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

test('every string awaiting Korean has a draft, or a reason it was left for her', () => {
  assert.deepEqual(missingDrafts(pendingCopy(Strings), DRAFTS), []);
  for (const [key, entry] of Object.entries(DRAFTS.strings)) {
    assert.ok(!(entry.ko && entry.why), `${key} has both a draft and a reason for none`);
  }
});

test('a draft is Korean, and keeps exactly the placeholders of its English', () => {
  // A dropped {n} would show the reader a sentence with the number missing.
  for (const { key, en } of pendingCopy(Strings)) {
    const draft = DRAFTS.strings[key]?.ko;
    if (!draft) continue;
    // A pure pattern, like "{h}:{mm} {period}", has no words to be Korean.
    const words = en.replace(/\{[^}]+\}/g, '').replace(/[^A-Za-z]/g, '');
    if (words.length > 0) assert.ok(HANGUL.test(draft), `${key}: no Korean in its draft`);
    assert.deepEqual(placeholders(draft), placeholders(en), key);
  }
});

test('drafts are kept only for strings still awaiting Korean', () => {
  // Once a string is signed off and in the table, its draft is history.
  const pending = new Set(pendingCopy(Strings).map(({ key }) => key));
  assert.deepEqual(Object.keys(DRAFTS.strings).filter((key) => !pending.has(key)), []);
});

test('the export is every pending string once, grouped by section in order', () => {
  const pending = pendingCopy(Strings);
  const rows = exportRows(pending);
  // All but those of a hidden feature.
  assert.equal(rows.length, pending.length - heldBack(pending).length);
  assert.equal(new Set(rows.map((row) => row.copy.key)).size, rows.length);
  const sections = rows.map((row) => SECTIONS.indexOf(row.context.section));
  assert.deepEqual(sections, [...sections].sort((a, b) => a - b));
  // Led by the first pending string in the context's own order.
  const keys = new Set(pending.map(({ key }) => key));
  assert.equal(rows[0].copy.key, Object.keys(COPY_CONTEXT).find((key) => keys.has(key)));
});

test('the CSV survives quotes, commas and Korean, opens in Excel, and says what she changed', () => {
  // A section name without a comma, so the expected rows need no quoting of it.
  const section = SECTIONS.find((name) => !name.includes(','))!;
  const context = { section: section, where: 'Here', when: 'Now', notes: '다시 찍기 is beside it' };
  const csv = exportCsv(
    [
      { copy: { key: 'x.y', en: 'Open "Alarms & reminders", then return', note: 'A note' }, context },
      { copy: { key: 'x.z', en: 'Reminders cannot sound' }, context },
    ],
    {
      strings: {
        'x.y': { ko: "'알람 및 리마인더' 열기", note: 'Match the phone.' },
        'x.z': { why: 'A safety warning.' },
      },
    }
  );
  assert.ok(csv.startsWith('﻿'));
  const [header, drafted, blank] = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(header, HEADER.join(','));
  assert.equal(
    drafted,
    `1,${section},Here,Now,"Open ""Alarms & reminders"", then return",A note 다시 찍기 is beside it About the draft: Match the phone.,'알람 및 리마인더' 열기,,,` +
      `"=IF(I2="""","""",IF(G2="""",""written by her"",IF(EXACT(I2,G2),""same as draft"",""CHANGED"")))",x.y`
  );
  // Left blank, with the reason; the formula points at its own row.
  assert.ok(blank.startsWith(`2,${section},Here,Now,Reminders cannot sound,다시 찍기 is beside it,,A safety warning.,,"=IF(I3=`));
});

test("a hidden feature's strings are held back from the export, and return with it", () => {
  const pending = pendingCopy(Strings);
  const hidden = { sweep: false, fillIn: false, curveMessage: false, koreanDrugNames: false };
  const held = heldBack(pending, hidden);
  assert.ok(held.includes('fillIn.keepStart'));
  assert.ok(held.includes('guidance.perMfds'));
  assert.ok(!exportRows(pending, hidden).some((row) => held.includes(row.copy.key)));

  const shown = { sweep: true, fillIn: true, curveMessage: true, koreanDrugNames: true };
  assert.deepEqual(heldBack(pending, shown), []);
  assert.equal(exportRows(pending, shown).length, pending.length);
});

test('the safety strings go to her undrafted, each with the reason', () => {
  for (const key of ['uses.title', 'uses.disclaimer']) {
    assert.equal(DRAFTS.strings[key]?.ko, undefined, key);
    assert.match(DRAFTS.strings[key]?.why ?? '', /^Safety string/, key);
  }
});

/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { aiCopy, allCopy, pendingCopy, pendingCopyTable, reviewBatch } from './pending.ts';
import { Strings, aiKorean, fillTemplate, untranslated } from './strings.ts';

const HANGUL = /[가-힣]/;

test('every Korean slot is Korean, unless it is a marked placeholder', () => {
  // English in the Korean slot looks like a finished string on screen. The only
  // sanctioned way to put it there is `untranslated`, which the batch lists.
  // A pure pattern has no words to be Korean: the reminder time's
  // "{period} {h}:{mm}", reviewed like the rest, only reordered.
  const words = (text: string) => text.replace(/\{[^}]+\}/g, '').replace(/[^A-Za-z]/g, '');
  const unmarked = allCopy(Strings)
    .filter(({ text }) => !text.pendingKo && words(text.en).length > 0 && !HANGUL.test(text.ko))
    .map(({ key }) => key);
  assert.deepEqual(unmarked, []);
});

test('a placeholder carries the same English in both slots', () => {
  for (const { key, text } of allCopy(Strings).filter(({ text }) => text.pendingKo)) {
    assert.ok(text.en.trim().length > 0, `${key} is empty`);
    assert.equal(text.ko, text.en, `${key} has diverged: translate it by replacing the untranslated() call`);
  }
});

test('the batch lists placeholders with their notes, and nothing else', () => {
  const table = {
    done: { ko: '확인', en: 'Done' },
    group: {
      waiting: untranslated('Not now', 'Button; keep it short.'),
      plain: untranslated('Next'),
    },
  };
  assert.deepEqual(pendingCopy(table), [
    { key: 'group.waiting', en: 'Not now', note: 'Button; keep it short.' },
    { key: 'group.plain', en: 'Next' },
  ]);
  const markdown = pendingCopyTable(table);
  assert.match(markdown, /^2 string\(s\) awaiting Korean\./);
  assert.match(markdown, /\| `group\.waiting` \| Not now \| Button; keep it short\. \| \|/);
});

test("Korean completed by AI is shown as written, and goes to the reviewer's next batch with it as the draft", () => {
  const table = {
    done: { ko: '확인', en: 'Done' },
    group: {
      waiting: untranslated('Not now'),
      ai: aiKorean('영어로 입력해 주세요', 'Type it in English', 'Under the box.'),
    },
  };
  assert.equal(table.group.ai.ko, '영어로 입력해 주세요');
  assert.equal(table.group.ai.pendingKo, undefined);
  // Not a placeholder: it has its Korean.
  assert.deepEqual(pendingCopy(table), [{ key: 'group.waiting', en: 'Not now' }]);
  assert.doesNotMatch(pendingCopyTable(table), /group\.ai/);
  const ai = { key: 'group.ai', en: 'Type it in English', note: 'Under the box.', ko: '영어로 입력해 주세요' };
  assert.deepEqual(aiCopy(table), [ai]);
  assert.deepEqual(reviewBatch(table), [{ key: 'group.waiting', en: 'Not now' }, ai]);
});

test("the iPhone's camera question in app.json is the privacy string, as it stands", async () => {
  // Set in app.json, which cannot import it: this keeps the two the same, in
  // English while the string is pending, and in Korean once it is signed off.
  const { readFileSync } = await import('node:fs');
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: (string | [string, Record<string, unknown>])[] };
  };
  const camera = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera');
  assert.ok(Array.isArray(camera), 'expo-camera is configured in app.json');
  assert.equal(camera[1].cameraPermission, Strings.privacy.cameraPermission.ko);
});

test('reviewed Korean is in the app as the reviewer wrote it, with the English that was reviewed beside it', async () => {
  // The returned sheets are the record (docs/reviews). A reviewed string that
  // has drifted from the reviewer's, by a slip or a rewording, would show words the reviewer
  // never approved; one changed on purpose goes back to the reviewer as pending
  // (`untranslated`, or `aiKorean`), and is not checked here until the reviewer has
  // seen it again.
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../../docs/reviews/', import.meta.url);
  const parse = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        quoted = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  };
  type Text = { ko: string; en: string; pendingKo?: boolean; koBy?: string };
  const at = (key: string) =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], Strings) as
      | Text
      | undefined;
  let checked = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith('-reviewed.csv'))) {
    const [header, ...rows] = parse(readFileSync(new URL(file, dir), 'utf8').replace(/^﻿/, ''));
    const K = header.findIndex((name) => name.startsWith('Key'));
    const E = header.indexOf('English');
    const F = header.indexOf("Reviewer's final Korean");
    for (const row of rows.filter((r) => r.length > K && r[K])) {
      const text = at(row[K]);
      if (!text || typeof text.ko !== 'string' || text.pendingKo || text.koBy) continue;
      assert.equal(text.ko, row[F], `${file}: ${row[K]} Korean`);
      assert.equal(text.en, row[E], `${file}: ${row[K]} English`);
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} reviewed strings checked`);
});

test('a value written differently in each language fills each its own', () => {
  const filled = fillTemplate(Strings.reminders.statusOn, { time: { ko: '오후 1:00', en: '1:00 PM' } });
  assert.equal(filled.ko, '알림이 켜져 있어요. 다음 알림 시간: 오후 1:00');
  assert.equal(filled.en, 'Reminders are on. The next one is at 1:00 PM.');
  // One value for both, as before.
  assert.equal(fillTemplate(Strings.uses.identifiedAs, { name: 'lisinopril' }).en, 'Identified from its label as: lisinopril');
});

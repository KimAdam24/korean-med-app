/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { allCopy, pendingCopy, pendingCopyTable } from './pending.ts';
import { Strings, untranslated } from './strings.ts';

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

/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { WORD_JOINER, keepWordsWhole } from './korean-wrap.ts';

const shown = (text: string) => keepWordsWhole(text).split(WORD_JOINER).join('·');

test('Korean words are joined within, and break only at their spaces', () => {
  assert.equal(shown('울리게 하기'), '울·리·게 하·기');
  assert.equal(shown('아니에요.'), '아·니·에·요·.');
  // A Korean ending on an English word stays with it.
  assert.equal(shown('FDA가 허가한'), 'FDA·가 허·가·한');
  // English alone is left as it is.
  assert.equal(keepWordsWhole('Take 1 tablet by mouth'), 'Take 1 tablet by mouth');
  // Nothing is lost: without the joiners it is the text as written.
  const text = '알림이 켜져 있어요. 다음 알림 시간: 오후 1:00';
  assert.equal(keepWordsWhole(text).split(WORD_JOINER).join(''), text);
});

test('only what draws text uses the joiners: nothing that is saved, sent or compared', () => {
  // Joiners in a saved name, a lookup or a typed name would make it match
  // nothing, silently. So they are added in one place (`shownKorean`), used
  // only where Korean is drawn; a new use elsewhere fails here until it is
  // looked at. The integration tests check nothing stored, sent or scheduled
  // carries one, through the real screens on Android.
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : []
    );
  const using = (module: RegExp) =>
    files(root)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => module.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).split(sep).join('/'))
      .sort();
  assert.deepEqual(using(/from '[^']*korean-wrap(?:\.ts)?'/), ['components/shown-korean.ts']);
  assert.deepEqual(using(/from '[^']*shown-korean(?:\.ts)?'/), [
    'components/bilingual-text.tsx',
    'components/reading-field.tsx',
    'features/reminders/time-picker.tsx',
  ]);
});

/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
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

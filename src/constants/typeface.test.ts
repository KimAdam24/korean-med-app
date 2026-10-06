/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FACES, IOS_BOLD_TEXT_STEP, typeface, weightOf } from './typeface.ts';

test('each weight the app uses is drawn in its own face', () => {
  assert.deepEqual(typeface('500'), { fontFamily: 'Pretendard-Medium', fontWeight: '500' });
  assert.deepEqual(typeface('600'), { fontFamily: 'Pretendard-SemiBold', fontWeight: '600' });
  assert.deepEqual(typeface('700'), { fontFamily: 'Pretendard-Bold', fontWeight: '700' });
  assert.deepEqual(typeface(700), { fontFamily: 'Pretendard-Bold', fontWeight: '700' });
  assert.equal(typeface('bold').fontFamily, 'Pretendard-Bold');
});

test('nothing is lighter than Medium: an unset, normal or light weight is drawn at 500', () => {
  for (const weight of [undefined, 'normal', '400', '300', 100]) {
    assert.equal(typeface(weight).fontFamily, 'Pretendard-Medium', String(weight));
  }
});

test("Bold text raises every weight as Android raises its own text's: by 300, to the nearest face", () => {
  assert.equal(typeface('500', 300).fontFamily, 'Pretendard-ExtraBold');
  assert.equal(typeface('600', 300).fontFamily, 'Pretendard-Black');
  assert.equal(typeface('700', 300).fontFamily, 'Pretendard-Black');
  // Unset is Medium, raised as Medium is.
  assert.equal(typeface(undefined, 300).fontFamily, 'Pretendard-ExtraBold');
  // Some other amount, rounded to a face; never past Black, never below Medium.
  assert.equal(typeface('500', 150).fontFamily, 'Pretendard-Bold');
  assert.equal(typeface('700', 1000).fontFamily, 'Pretendard-Black');
  assert.equal(typeface('600', -300).fontFamily, 'Pretendard-Medium');
  // Android's "undefined" adjustment is no adjustment; the caller turns it into 0, and garbage is too.
  assert.equal(typeface('600', Number.NaN).fontFamily, 'Pretendard-SemiBold');
  assert.equal(IOS_BOLD_TEXT_STEP, 300);
});

test('weights are read as styles write them', () => {
  assert.equal(weightOf('600'), 600);
  assert.equal(weightOf(800), 800);
  assert.equal(weightOf('bold'), 700);
  assert.equal(weightOf('normal'), 400);
  assert.equal(weightOf(undefined), 500);
});

test('every face is a bundled file, and every bundled file is embedded by the font plugin', () => {
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: (string | [string, { fonts?: string[] }])[] };
  };
  const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-font');
  assert.ok(Array.isArray(plugin), 'expo-font is configured in app.json');
  const embedded = (plugin[1].fonts ?? []).map((path) => path.replace(/^\.\/assets\/fonts\//, '').replace(/\.otf$/, ''));
  assert.deepEqual(embedded.sort(), Object.values(FACES).sort());
  for (const face of Object.values(FACES)) {
    assert.ok(readFileSync(new URL(`../../assets/fonts/${face}.otf`, import.meta.url)).length > 1_000_000, face);
  }
  // Its licence travels with it, as the OFL asks.
  assert.match(readFileSync(new URL('../../assets/fonts/Pretendard-OFL.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

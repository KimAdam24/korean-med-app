/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ANDROID_FAMILY, FACES, IOS_BOLD_TEXT_STEP, typeface, weightOf } from './typeface.ts';

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

test("on Android, every weight is the one family's, named by weight: never a loose file React Native would look for a '_bold' of", () => {
  assert.deepEqual(typeface('500', 0, 'android'), { fontFamily: 'Pretendard', fontWeight: '500' });
  assert.deepEqual(typeface('700', 0, 'android'), { fontFamily: 'Pretendard', fontWeight: '700' });
  assert.deepEqual(typeface('600', 300, 'android'), { fontFamily: 'Pretendard', fontWeight: '900' });
  assert.deepEqual(typeface('700', 0, 'ios'), { fontFamily: 'Pretendard-Bold', fontWeight: '700' });
});

test('weights are read as styles write them', () => {
  assert.equal(weightOf('600'), 600);
  assert.equal(weightOf(800), 800);
  assert.equal(weightOf('bold'), 700);
  assert.equal(weightOf('normal'), 400);
  assert.equal(weightOf(undefined), 500);
});

test('every face is a bundled file, embedded for each platform the way it is named there', () => {
  type FontPlugin = {
    fonts?: string[];
    ios?: { fonts?: string[] };
    android?: { fonts?: { fontFamily: string; fontDefinitions: { path: string; weight: number }[] }[] };
  };
  const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
    expo: { plugins: (string | [string, FontPlugin])[] };
  };
  const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-font');
  assert.ok(Array.isArray(plugin), 'expo-font is configured in app.json');
  const options = plugin[1];
  const face = (path: string) => path.replace(/^\.\/assets\/fonts\//, '').replace(/\.otf$/, '');
  // Not for both platforms at once: Android would also copy them as loose
  // asset files, which draw every weight of 700 or more in the phone's font.
  assert.equal(options.fonts, undefined);
  // iOS: each file, known by its PostScript name.
  assert.deepEqual((options.ios?.fonts ?? []).map(face).sort(), Object.values(FACES).sort());
  // Android: one family, each file at its own weight.
  assert.deepEqual(options.android?.fonts?.map((family) => family.fontFamily), [ANDROID_FAMILY]);
  const definitions = options.android?.fonts?.[0].fontDefinitions ?? [];
  assert.deepEqual(
    Object.fromEntries(definitions.map((definition) => [definition.weight, face(definition.path)])),
    Object.fromEntries(Object.entries(FACES))
  );
  for (const face of Object.values(FACES)) {
    assert.ok(readFileSync(new URL(`../../assets/fonts/${face}.otf`, import.meta.url)).length > 1_000_000, face);
  }
  // Its licence travels with it, as the OFL asks.
  assert.match(readFileSync(new URL('../../assets/fonts/Pretendard-OFL.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});

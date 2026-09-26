/**
 * Run with: npm run test:unit
 *
 * Most phrases here are stand-ins (`[F2]`), so the rules are tested without
 * Korean nobody has approved. The one test that uses Korean copies the
 * draft's two worked examples, to show the composition does what the draft
 * describes; that Korean is still unreviewed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPROVED_COMPOSITION,
  APPROVED_PHRASES,
  type ApprovedPhrase,
  type Composition,
  type PhraseCategory,
} from './approved-phrases.ts';
import { koreanDirections } from './korean-directions.ts';

const reviewed = { on: '2026-09-25', sheet: 'test' };
const phrase = (id: string, en: string, category: PhraseCategory, ko = `[${id}]`): ApprovedPhrase => ({
  id,
  en,
  ko,
  category,
  reviewed,
});
const COMPOSITION: Composition = { afterFrequency: ', ', bareTake: '[take]', end: '.', reviewed };

const PHRASES = [
  phrase('Q1', 'TAKE 1 TABLET', 'action'),
  phrase('Q5', 'TAKE 1 CAPSULE', 'action'),
  phrase('R1', 'BY MOUTH', 'route'),
  phrase('R3', 'APPLY TO AFFECTED AREA', 'action'),
  phrase('F2', 'TWICE DAILY', 'frequency'),
  phrase('F3', 'THREE TIMES DAILY', 'frequency'),
  phrase('F13', 'UP TO 3 TIMES DAILY', 'frequency'),
  phrase('C1', 'WITH FOOD', 'condition'),
  phrase('C6', 'AS NEEDED', 'condition'),
  phrase('C7', 'AS NEEDED FOR PAIN', 'condition'),
  phrase('C9', 'DO NOT CRUSH OR CHEW', 'sentence'),
];
const render = (english: string) => koreanDirections(english, PHRASES, COMPOSITION)?.ko ?? null;

test('in the app today, nothing is translated: no phrase and no composition is approved yet', () => {
  assert.deepEqual(APPROVED_PHRASES, []);
  assert.equal(APPROVED_COMPOSITION, null);
  assert.equal(koreanDirections('Take 1 tablet by mouth twice daily'), null);
  // Approved phrases alone compose nothing: how they join is reviewed too.
  assert.equal(koreanDirections('Take 1 tablet by mouth twice daily', PHRASES, null), null);
});

test('every approved phrase says when and where it was signed off', () => {
  // Holds for the empty table today, and for every row transcribed into it.
  for (const approved of APPROVED_PHRASES) {
    assert.ok(approved.reviewed.on && approved.reviewed.sheet, approved.id);
    assert.ok(approved.en.trim() && (approved.ko.trim() || approved.category === 'route'), approved.id);
  }
  assert.equal(new Set(APPROVED_PHRASES.map((approved) => approved.id)).size, APPROVED_PHRASES.length);
});

test("the draft's worked examples come out as the draft wrote them", () => {
  // Draft Korean, unreviewed, copied from content-drafts/sig-phrases.draft.md.
  const draft = [
    phrase('Q1', 'TAKE 1 TABLET', 'action', '한 알을 드세요'),
    phrase('R2', 'BY MOUTH', 'route', ''),
    phrase('F3', 'THREE TIMES DAILY', 'frequency', '하루 세 번'),
    phrase('F13', 'UP TO 3 TIMES DAILY', 'frequency', '하루 세 번까지'),
    phrase('C1', 'WITH FOOD', 'condition', '식사와 함께'),
    phrase('C6', 'AS NEEDED', 'condition', '필요할 때만'),
  ];
  const composition = { ...COMPOSITION, bareTake: '드세요' };
  assert.equal(
    koreanDirections('TAKE 1 TABLET BY MOUTH THREE TIMES DAILY WITH FOOD', draft, composition)?.ko,
    '하루 세 번, 식사와 함께 한 알을 드세요.'
  );
  // The first real test label.
  assert.equal(
    koreanDirections('TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOOD.', draft, composition)?.ko,
    '하루 세 번까지, 필요할 때만 한 알을 드세요. 식사와 함께 드세요.'
  );
});

test('composes in Korean order: frequency, conditions, route, then the action', () => {
  assert.equal(render('Take 1 tablet by mouth twice daily with food'), '[F2], [C1] [R1] [Q1].');
  assert.equal(render('APPLY TO AFFECTED AREA TWICE DAILY'), '[F2], [R3].');
  // TAKE on its own, with a condition: its own sentence after the main one.
  assert.equal(render('TAKE 1 TABLET TWICE DAILY. TAKE WITH FOOD.'), '[F2], [Q1]. [C1] [take].');
});

test('any word not in an approved phrase, anywhere, and the whole direction stays English', () => {
  // The vial: its strength in brackets and "every 7 days" are in no phrase.
  assert.equal(render('Take 1 capsule (50,000 units) by mouth every 7 days'), null);
  assert.equal(render('TAKE 1 TABLET BY MOUTH TWICE DAILY FOR 10 DAYS'), null);
  // One sentence fine, the next not: nothing, rather than the first alone.
  assert.equal(render('TAKE 1 TABLET TWICE DAILY. TAKE WITH PLENTY OF WATER.'), null);
});

test('the longest phrase wins, so "as needed for pain" is not "as needed" and a stray word', () => {
  assert.equal(render('TAKE 1 TABLET AS NEEDED FOR PAIN'), '[C7] [Q1].');
  assert.deepEqual(koreanDirections('TAKE 1 TABLET AS NEEDED FOR PAIN', PHRASES, COMPOSITION)?.phrases, ['Q1', 'C7']);
});

test('case, commas, spacing and a closing full stop do not matter; decimals are not sentence ends', () => {
  assert.equal(render('  take 1 tablet,  by mouth,\nTWICE daily.  '), '[F2], [R1] [Q1].');
  assert.equal(
    koreanDirections('TAKE 0.5 TABLET TWICE DAILY', [...PHRASES, phrase('Q9', 'TAKE 0.5 TABLET', 'action')], COMPOSITION)?.ko,
    '[F2], [Q9].'
  );
});

test('two frequencies, two actions, or no action at all are refused, not composed', () => {
  assert.equal(render('TAKE 1 TABLET TWICE DAILY THREE TIMES DAILY'), null);
  assert.equal(render('TAKE 1 TABLET TAKE 1 CAPSULE'), null);
  assert.equal(render('TWICE DAILY WITH FOOD'), null);
  assert.equal(render('TAKE WITH FOOD WITH FOOD'), null);
});

test('a whole-instruction phrase stands alone, and is refused when joined to anything', () => {
  assert.equal(render('Do not crush or chew.'), '[C9].');
  assert.equal(render('TAKE 1 TABLET DO NOT CRUSH OR CHEW'), null);
  assert.equal(render('TAKE 1 TABLET TWICE DAILY. DO NOT CRUSH OR CHEW.'), '[F2], [Q1]. [C9].');
});

test('damaged text is never translated, even when every word matches a phrase', () => {
  // "Take with food" alone never says when: incomplete as a direction.
  assert.equal(render('TAKE WITH FOOD'), null);
  // "up to times daily" lost its number: damaged, so refused here too.
  const withBrokenPhrase = [...PHRASES, phrase('X1', 'UP TO TIMES DAILY', 'frequency')];
  assert.equal(koreanDirections('TAKE 1 TABLET UP TO TIMES DAILY', withBrokenPhrase, COMPOSITION), null);
});

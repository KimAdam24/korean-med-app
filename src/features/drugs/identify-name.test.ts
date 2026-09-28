/**
 * Run with: npm run test:unit
 *
 * RxNav's answers below are shaped like its real ones for these names, taken
 * on 2026-09-28.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { identifyByName, medicineWords } from './identify-name.ts';

test('the words that name the medicine: not its salt, form, strength or bare numbers', () => {
  assert.deepEqual(medicineWords('VITAMIN D2'), ['vitamin', 'd2']);
  assert.deepEqual(medicineWords('METFORMIN HCL ER 500MG'), ['metformin']);
  assert.deepEqual(medicineWords('LEVOTHYROXINE SODIUM 0.1 MG TAB'), ['levothyroxine']);
  assert.deepEqual(medicineWords('VITAMIN B12 1000 MCG'), ['vitamin', 'b12']);
  assert.deepEqual(medicineWords('CALCIUM CITRATE'), []);
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Answers = Record<string, unknown>;

/** RxNav, answering by the part of the URL after `/REST/`. */
function rxNav(answers: Answers | 'offline'): string[] {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const path = String(input).replace('https://rxnav.nlm.nih.gov/REST/', '');
    asked.push(decodeURIComponent(path));
    if (answers === 'offline') throw new TypeError('Network request failed');
    const key = Object.keys(answers).find((prefix) => decodeURIComponent(path).startsWith(prefix));
    return { ok: key !== undefined, status: key ? 200 : 404, json: async () => (key ? answers[key] : {}) } as Response;
  }) as typeof fetch;
  return asked;
}

const approximate = (...candidates: [rxcui: string, name: string, rank: string][]) => ({
  approximateGroup: {
    candidate: candidates.flatMap(([rxcui, name, rank]) => [
      { rxcui, name, rank, source: 'RXNORM' },
      // Other sources' rows come with no name; they are not the match.
      { rxcui, rank, source: 'MMSL' },
    ]),
  },
});
const related = (ingredients: [string, string][], combinations: [string, string][] = []) => ({
  relatedGroup: {
    conceptGroup: [
      { tty: 'IN', conceptProperties: ingredients.map(([rxcui, name]) => ({ rxcui, name })) },
      { tty: 'MIN', conceptProperties: combinations.map(([rxcui, name]) => ({ rxcui, name })) },
    ],
  },
});

test('the vial: "VITAMIN D2" is ergocalciferol, and only the medicine words are sent', async () => {
  const asked = rxNav({
    'approximateTerm.json?term=vitamin d2': approximate(['4018', 'vitamin D2', '1']),
    'rxcui/4018/related.json': related([['4018', 'ergocalciferol']], [['1007512', 'calcium citrate / ergocalciferol']]),
  });
  assert.deepEqual(await identifyByName('VITAMIN D2'), {
    status: 'identified',
    match: { rxcui: '4018', ingredients: ['ergocalciferol'], matched: 'vitamin D2' },
  });
  // One ingredient: the combinations containing it are not what was named.
  assert.equal(asked.length, 2);
});

test('a brand name is its ingredient', async () => {
  rxNav({
    'approximateTerm.json?term=lipitor': approximate(['153165', 'Lipitor', '1']),
    'rxcui/153165/related.json': related([['83367', 'atorvastatin']]),
  });
  const found = await identifyByName('LIPITOR');
  assert.equal(found.status === 'identified' && found.match.rxcui, '83367');
});

test('a combination is the combination, looked up by its own concept', async () => {
  rxNav({
    'approximateTerm.json?term=acetaminophen hydrocodone': approximate(['214182', 'acetaminophen / hydrocodone', '1']),
    'rxcui/214182/related.json': related(
      [['161', 'acetaminophen'], ['5489', 'hydrocodone']],
      [['214182', 'acetaminophen / hydrocodone']]
    ),
  });
  assert.deepEqual(await identifyByName('ACETAMINOPHEN/HYDROCODONE'), {
    status: 'identified',
    match: { rxcui: '214182', ingredients: ['acetaminophen', 'hydrocodone'], matched: 'acetaminophen / hydrocodone' },
  });
});

test('a misread matches nothing, and a match that changed a printed word is not taken', async () => {
  rxNav({ 'approximateTerm.json?term=thyeoxine': { approximateGroup: { candidate: [] } } });
  assert.deepEqual(await identifyByName('Thyeoxine'), { status: 'unidentified' });

  // "APAP" is not in what RxNav matched, so RxNav guessed at it.
  rxNav({ 'approximateTerm.json': approximate(['214182', 'acetaminophen / hydrocodone', '1']) });
  assert.deepEqual(await identifyByName('HYDROCODONE/APAP'), { status: 'unidentified' });
});

test('only the best rank counts, and best-ranked matches that disagree identify nothing', async () => {
  rxNav({
    'approximateTerm.json': approximate(['6809', 'metformin', '1'], ['729717', 'metformin / sitagliptin', '1']),
    'rxcui/6809/related.json': related([['6809', 'metformin']]),
    'rxcui/729717/related.json': related([['6809', 'metformin'], ['593411', 'sitagliptin']], [['729717', 'metformin / sitagliptin']]),
  });
  assert.deepEqual(await identifyByName('METFORMIN'), { status: 'unidentified' });

  rxNav({
    'approximateTerm.json': approximate(['6809', 'metformin', '1'], ['729717', 'metformin / sitagliptin', '2']),
    'rxcui/6809/related.json': related([['6809', 'metformin']]),
  });
  const found = await identifyByName('METFORMIN HCL');
  assert.equal(found.status === 'identified' && found.match.rxcui, '6809');
});

test('nothing to name the medicine by asks nothing', async () => {
  const asked = rxNav({});
  assert.deepEqual(await identifyByName('500 MG TABLET'), { status: 'unidentified' });
  assert.deepEqual(asked, []);
});

test('RxNav unreachable is "unavailable", not "unidentified"', async () => {
  rxNav('offline');
  assert.deepEqual(await identifyByName('LISINOPRIL'), { status: 'unavailable' });
});

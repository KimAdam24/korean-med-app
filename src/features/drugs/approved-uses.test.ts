/**
 * Run with: npm run test:unit
 *
 * The markup follows real DailyMed labels: the lisinopril label's Highlights
 * before its subsections, with a bullet as each item's caption; metformin's
 * after its text; ergocalciferol's older label with no Highlights at all.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  dailyMedProductCodes,
  doseFormOf,
  findApprovedUses,
  readIndications,
  sectionMarkup,
  type UsesTarget,
} from './approved-uses.ts';

const approval = (category: string) =>
  `<subjectOf><approval><id extension="X1" root="2.16.840.1.113883.3.150"/><code code="C1" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="${category}"/></approval></subjectOf>`;

const active = (substance: string, moiety?: string) =>
  `<ingredient classCode="ACTIB"><quantity/><ingredientSubstance><code code="X"/><name>${substance}</name>${
    moiety ? `<activeMoiety><activeMoiety><code code="Y"/><name>${moiety}</name></activeMoiety></activeMoiety>` : ''
  }</ingredientSubstance></ingredient><ingredient classCode="IACT"><ingredientSubstance><name>MANNITOL</name></ingredientSubstance></ingredient>`;

const LISINOPRIL = `<document>
  ${active('LISINOPRIL')}${approval('ANDA')}
  <component><section ID="ID689"><id root="a"/>
    <code code="34067-9" codeSystem="2.16.840.1.113883.6.1" displayName="INDICATIONS &amp; USAGE SECTION"/>
    <title>1 INDICATIONS AND USAGE</title>
    <excerpt><highlight><text>
      <paragraph>Lisinopril tablet USP is an angiotensin converting enzyme (ACE) inhibitor indicated for:</paragraph>
      <list listType="unordered">
        <item>
          <caption>•</caption>Treatment of hypertension in adults and pediatric patients 6 years of age and older (<linkHtml href="#ID690">1.1</linkHtml>)</item>
        <item>
          <caption>•</caption>Adjunct therapy for heart failure (<linkHtml href="#ID692">1.2</linkHtml>)</item>
      </list>
    </text></highlight></excerpt>
    <component><section ID="ID690"><code code="42229-5"/><title>1.1 Hypertension</title>
      <text><paragraph>Lisinopril tablet USP is indicated for the treatment of hypertension.</paragraph></text>
    </section></component>
  </section></component>
  <component><section><code code="34070-3"/><title>4 CONTRAINDICATIONS</title><text><paragraph>Not this.</paragraph></text></section></component>
</document>`;

const METFORMIN = `<document>
  ${active('METFORMIN HYDROCHLORIDE', 'METFORMIN')}${approval('ANDA')}
  <component><section ID="Section_1"><code code="34067-9"/>
    <title>1 INDICATIONS AND USAGE</title>
    <text><paragraph>Metformin hydrochloride tablets are indicated as an adjunct to diet and exercise.</paragraph></text>
    <excerpt><highlight><text><paragraph>Metformin hydrochloride tablets is a biguanide indicated as an adjunct to diet and exercise to improve glycemic control. <linkHtml href="#Section_1">(1)</linkHtml></paragraph></text></highlight></excerpt>
  </section></component>
</document>`;

const ERGOCALCIFEROL = `<document>
  ${active('ERGOCALCIFEROL')}${approval('NDA')}
  <component><section ID="Section_3"><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text><paragraph>Ergocalciferol is indicated for use in the treatment of hypoparathyroidism, refractory rickets, also known as vitamin D resistant rickets, and familial hypophosphatemia.</paragraph></text>
  </section></component>
</document>`;

test('Highlights before the subsections: the summary, its bullets as items, its cross-references kept', () => {
  const read = readIndications(LISINOPRIL);
  assert.equal(
    read.summary,
    'Lisinopril tablet USP is an angiotensin converting enzyme (ACE) inhibitor indicated for:\n' +
      '• Treatment of hypertension in adults and pediatric patients 6 years of age and older (1.1)\n' +
      '• Adjunct therapy for heart failure (1.2)'
  );
  // The whole section, without its Highlights or its own heading, with its subsections.
  assert.equal(read.section, '1.1 Hypertension\nLisinopril tablet USP is indicated for the treatment of hypertension.');
  assert.deepEqual(read.approvals, ['ANDA']);
  assert.deepEqual(read.activeIngredients, ['LISINOPRIL']);
});

test('Highlights after the text, and a salt counted as its drug', () => {
  const read = readIndications(METFORMIN);
  assert.equal(
    read.summary,
    'Metformin hydrochloride tablets is a biguanide indicated as an adjunct to diet and exercise to improve glycemic control. (1)'
  );
  assert.equal(read.section, 'Metformin hydrochloride tablets are indicated as an adjunct to diet and exercise.');
  assert.deepEqual(read.activeIngredients, ['METFORMIN']);
});

test('an older label with no Highlights: the section itself, word for word', () => {
  const read = readIndications(ERGOCALCIFEROL);
  assert.equal(read.summary, null);
  assert.equal(
    read.section,
    'Ergocalciferol is indicated for use in the treatment of hypoparathyroidism, refractory rickets, also known as vitamin D resistant rickets, and familial hypophosphatemia.'
  );
});

test('a combination counts every active ingredient once, whichever way it is given', () => {
  const xml = `${active('HYDROCODONE BITARTRATE', 'HYDROCODONE')}${active('ACETAMINOPHEN')}${active('ACETAMINOPHEN')}`;
  assert.deepEqual([...readIndications(xml).activeIngredients].sort(), ['ACETAMINOPHEN', 'HYDROCODONE']);
});

test('a section cut off before it ends is not a section', () => {
  const cut = LISINOPRIL.slice(0, LISINOPRIL.indexOf('</section></component>\n  </section>'));
  assert.equal(sectionMarkup(cut, '34067-9'), null);
  assert.equal(readIndications(cut).section, null);
});

test('the product codes an 11-digit code could have been printed as', () => {
  // 5-3-2, padded before the product: Torrent's ergocalciferol, 13668-757-01.
  assert.deepEqual(dailyMedProductCodes('13668075701'), ['13668-757', '13668-0757']);
  // 4-4-2, padded at the front.
  assert.deepEqual(dailyMedProductCodes('00781150610'), ['0781-1506']);
  assert.deepEqual(dailyMedProductCodes('12345'), []);
});

test('the dose form a reading names, or none when it names neither or both', () => {
  assert.equal(doseFormOf('1.25 MG (50,000 UNIT)', 'Take 1 capsule (b units) by mouth eve days'), 'CAPSULE');
  assert.equal(doseFormOf('10 MG', 'TAKE 1 TABLET BY MOUTH DAILY'), 'TABLET');
  assert.equal(doseFormOf('10 MG TAB'), 'TABLET');
  assert.equal(doseFormOf('10 MG'), null);
  assert.equal(doseFormOf('1 tablet or 1 capsule'), null);
});

// --- The lookup, against a stubbed DailyMed ------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Route = (url: string) => { status?: number; json?: unknown; text?: string } | 'offline';

function dailyMed(route: Route): string[] {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url.replace('https://dailymed.nlm.nih.gov/dailymed/services/v2', ''));
    const answer = route(url);
    if (answer === 'offline') throw new TypeError('Network request failed');
    const status = answer.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => answer.json,
      text: async () => answer.text ?? '',
    } as Response;
  }) as typeof fetch;
  return asked;
}

const listing = (...labels: [setid: string, title: string][]) => ({
  json: { data: labels.map(([setid, title]) => ({ setid, title, spl_version: 3 })) },
});

test('a barcode: the exact product, by the form DailyMed has its code in', async () => {
  const asked = dailyMed((url) => {
    if (url.includes('ndc=13668-757')) return listing(['erg', 'ERGOCALCIFEROL CAPSULE [TORRENT]']);
    if (url.includes('ndc=')) return listing();
    if (url.endsWith('/spls/erg.xml')) return { text: ERGOCALCIFEROL };
    return { status: 404 };
  });
  const found = await findApprovedUses({ kind: 'product', ndc11: '13668075701', rxcui: '316965' });
  assert.equal(found.status, 'found');
  if (found.status !== 'found') return;
  assert.match(found.uses.content.text, /^Ergocalciferol is indicated for use in the treatment of hypoparathyroidism/);
  assert.equal(found.uses.content.summary, false);
  assert.equal(found.uses.content.label.title, 'ERGOCALCIFEROL CAPSULE [TORRENT]');
  assert.equal(found.uses.attribution.source, 'fda-label');
  assert.equal(found.uses.attribution.revision, 'v3');
  assert.deepEqual(asked, ['/spls.json?ndc=13668-757', '/spls/erg.xml']);
});

test('a barcode whose package DailyMed no longer lists: its RxNorm product instead', async () => {
  const asked = dailyMed((url) => {
    if (url.includes('ndc=')) return listing();
    if (url.includes('rxcui=316965')) return listing(['erg', 'ERGOCALCIFEROL CAPSULE [OTHER]']);
    if (url.endsWith('/spls/erg.xml')) return { text: ERGOCALCIFEROL };
    return { status: 404 };
  });
  const found = await findApprovedUses({ kind: 'product', ndc11: '13668075701', rxcui: '316965' });
  assert.equal(found.status, 'found');
  assert.equal(asked.at(-2), '/spls.json?rxcui=316965');
});

test('a name: skips combinations and other forms by title, and a label with two actives by its own count', async () => {
  const asked = dailyMed((url) => {
    if (url.includes('rxcui=6809')) {
      return listing(
        ['inj', 'METFORMIN SOLUTION [X]'],
        ['combo', 'PIOGLITAZONE AND METFORMIN HYDROCHLORIDE TABLET [X]'],
        ['hidden-combo', 'METFORMIN HYDROCHLORIDE TABLET [MISLABELLED]'],
        ['met', 'METFORMIN HYDROCHLORIDE TABLET, FILM COATED [Y]']
      );
    }
    if (url.endsWith('/spls/hidden-combo.xml')) return { text: `${active('SITAGLIPTIN')}${METFORMIN}` };
    if (url.endsWith('/spls/met.xml')) return { text: METFORMIN };
    return { status: 404 };
  });
  const found = await findApprovedUses({ kind: 'ingredients', rxcui: '6809', count: 1, form: 'TABLET' });
  assert.equal(found.status, 'found');
  if (found.status !== 'found') return;
  assert.equal(found.uses.content.summary, true);
  assert.equal(found.uses.content.label.setId, 'met');
  assert.deepEqual(asked, ['/spls.json?rxcui=6809&pagesize=100', '/spls/hidden-combo.xml', '/spls/met.xml']);
});

test('only an approved label: one marketed as unapproved has no approved uses to show', async () => {
  dailyMed((url) => {
    if (url.includes('rxcui=')) return listing(['d', 'VITAMIN D CAPSULE [X]']);
    return { text: ERGOCALCIFEROL.replace('displayName="NDA"', 'displayName="unapproved drug other"') };
  });
  const target: UsesTarget = { kind: 'ingredients', rxcui: '11253', count: 1, form: 'CAPSULE' };
  assert.deepEqual(await findApprovedUses(target), { status: 'none' });
});

test('DailyMed unreachable is "unavailable", not "none": trying again may work', async () => {
  dailyMed(() => 'offline');
  assert.deepEqual(await findApprovedUses({ kind: 'ingredients', rxcui: '4018', count: 1, form: null }), {
    status: 'unavailable',
  });
  dailyMed((url) => (url.includes('spls.json') ? listing(['erg', 'ERGOCALCIFEROL CAPSULE [X]']) : 'offline'));
  assert.deepEqual(await findApprovedUses({ kind: 'ingredients', rxcui: '4018', count: 1, form: null }), {
    status: 'unavailable',
  });
});

test('no label of the form read: "none"', async () => {
  dailyMed(() => listing(['erg', 'ERGOCALCIFEROL CAPSULE [X]']));
  assert.deepEqual(await findApprovedUses({ kind: 'ingredients', rxcui: '4018', count: 1, form: 'TABLET' }), {
    status: 'none',
  });
});

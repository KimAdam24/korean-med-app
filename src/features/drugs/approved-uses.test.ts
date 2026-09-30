/**
 * Run with: npm run test:unit
 *
 * The markup follows real DailyMed labels: the lisinopril label's Highlights
 * before its subsections, with a bullet as each item's caption; metformin's
 * after its text; ergocalciferol's older label with no Highlights at all. The
 * lookups follow DailyMed's real looseness: its NDC search matches by prefix,
 * and its list for an ingredient holds unrelated labels.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  dailyMedPackageCodes,
  doseFormOf,
  findApprovedUses,
  productKey,
  readIndications,
  sameIngredients,
  sectionMarkup,
  type UsesTarget,
} from './approved-uses.ts';

const approval = (category: string) =>
  `<subjectOf><approval><id extension="X1" root="2.16.840.1.113883.3.150"/><code code="C1" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="${category}"/></approval></subjectOf>`;

const active = (substance: string, moiety?: string) =>
  `<ingredient classCode="ACTIB"><quantity/><ingredientSubstance><code code="X"/><name>${substance}</name>${
    moiety ? `<activeMoiety><activeMoiety><code code="Y"/><name>${moiety}</name></activeMoiety></activeMoiety>` : ''
  }</ingredientSubstance></ingredient><ingredient classCode="IACT"><ingredientSubstance><name>MANNITOL</name></ingredientSubstance></ingredient>`;

/** A product's NDC as SPL gives it, with the package codes under it. */
const ndc = (product: string, ...packages: string[]) =>
  `<manufacturedProduct><code code="${product}" codeSystem="2.16.840.1.113883.6.69"/>${packages
    .map((code) => `<containerPackagedProduct><code code="${code}" codeSystem="2.16.840.1.113883.6.69"/></containerPackagedProduct>`)
    .join('')}</manufacturedProduct>`;

const LISINOPRIL = `<document>
  ${active('LISINOPRIL')}${approval('ANDA')}${ndc('82009-062', '82009-062-05')}
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
  ${active('ERGOCALCIFEROL')}${approval('NDA')}${ndc('13668-757', '13668-757-01', '13668-757-05')}
  <component><section ID="Section_3"><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text><paragraph>Ergocalciferol is indicated for use in the treatment of hypoparathyroidism, refractory rickets, also known as vitamin D resistant rickets, and familial hypophosphatemia.</paragraph></text>
  </section></component>
</document>`;

/** A label for some other medicine, of the kind DailyMed's loose lookups return. */
const other = (substance: string, product: string, uses: string) => `<document>
  ${active(substance)}${approval('ANDA')}${ndc(product, `${product}-00`)}
  <component><section><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text><paragraph>${uses}</paragraph></text></section></component>
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
  assert.deepEqual(read.actives, [{ substance: 'LISINOPRIL', moiety: null }]);
  assert.deepEqual(read.products, ['820090062']);
});

test('Highlights after the text, and a salt counted once, as its drug', () => {
  const read = readIndications(METFORMIN);
  assert.equal(
    read.summary,
    'Metformin hydrochloride tablets is a biguanide indicated as an adjunct to diet and exercise to improve glycemic control. (1)'
  );
  assert.equal(read.section, 'Metformin hydrochloride tablets are indicated as an adjunct to diet and exercise.');
  assert.deepEqual(read.actives, [{ substance: 'METFORMIN HYDROCHLORIDE', moiety: 'METFORMIN' }]);
});

test('an older label with no Highlights: the section itself, word for word', () => {
  const read = readIndications(ERGOCALCIFEROL);
  assert.equal(read.summary, null);
  assert.equal(
    read.section,
    'Ergocalciferol is indicated for use in the treatment of hypoparathyroidism, refractory rickets, also known as vitamin D resistant rickets, and familial hypophosphatemia.'
  );
  // Every package code comes to the one product.
  assert.deepEqual(read.products, ['136680757']);
});

test('a combination counts every active ingredient once, whichever way it is given', () => {
  const xml = `${active('HYDROCODONE BITARTRATE', 'HYDROCODONE')}${active('ACETAMINOPHEN')}${active('ACETAMINOPHEN')}`;
  assert.deepEqual(
    readIndications(xml).actives.map((a) => a.moiety ?? a.substance).sort(),
    ['ACETAMINOPHEN', 'HYDROCODONE']
  );
});

test('a section cut off before it ends is not a section', () => {
  const cut = LISINOPRIL.slice(0, LISINOPRIL.indexOf('</section></component>\n  </section>'));
  assert.equal(sectionMarkup(cut, '34067-9'), null);
  assert.equal(readIndications(cut).section, null);
});

test('an approval without a named code is not read as the next named code in the document', () => {
  const xml = `<subjectOf><approval><id extension="X"/></approval></subjectOf>
    <component><section><code code="34067-9" displayName="NDA"/><text><paragraph>Uses.</paragraph></text></section></component>`;
  assert.deepEqual(readIndications(xml).approvals, ['']);
});

test("a label's ingredients are the medicine's only if they are exactly these, by name", () => {
  const metformin = [{ substance: 'METFORMIN HYDROCHLORIDE', moiety: 'METFORMIN' }];
  assert.equal(sameIngredients(metformin, ['metformin']), true);
  assert.equal(sameIngredients([{ substance: 'ERGOCALCIFEROL', moiety: null }], ['ergocalciferol']), true);
  // Another medicine, however many ingredients it has.
  assert.equal(sameIngredients([{ substance: 'OMEPRAZOLE', moiety: null }], ['ascorbic acid']), false);
  // A combination is not its part, nor the part the combination.
  assert.equal(sameIngredients([...metformin, { substance: 'SITAGLIPTIN', moiety: null }], ['metformin']), false);
  assert.equal(sameIngredients(metformin, ['metformin', 'sitagliptin']), false);
  // Spelled differently by RxNorm and the label: no answer rather than a guess.
  assert.equal(sameIngredients([{ substance: 'CYANOCOBALAMIN', moiety: null }], ['vitamin B 12']), false);
  assert.equal(sameIngredients([], []), false);
});

test('the full package codes an 11-digit code could have been printed as, never a prefix', () => {
  // 5-3-2, padded before the product, and 5-4-1 as well: Torrent's 13668-757-01.
  assert.deepEqual(dailyMedPackageCodes('13668075701'), ['13668-757-01', '13668-0757-1']);
  // 5-4-1: RemedyRepack's terazosin, 70518-0317-0.
  assert.deepEqual(dailyMedPackageCodes('70518031700'), ['70518-317-00', '70518-0317-0']);
  // 4-4-2, padded at the front.
  assert.deepEqual(dailyMedPackageCodes('00781150610'), ['0781-1506-10']);
  assert.deepEqual(dailyMedPackageCodes('12345'), []);
});

test("a printed code's labeler and product, padded as in the 11-digit form", () => {
  assert.equal(productKey('13668-757-01'), '136680757');
  assert.equal(productKey('70518-0317-0'), '705180317');
  assert.equal(productKey('0781-1506'), '007811506');
  assert.equal(productKey('not an ndc'), null);
});

test('the dose form a reading names, or none when it names neither or both', () => {
  assert.equal(doseFormOf('1.25 MG (50,000 UNIT)', 'Take 1 capsule (b units) by mouth eve days'), 'CAPSULE');
  assert.equal(doseFormOf('10 MG', 'TAKE 1 TABLET BY MOUTH DAILY'), 'TABLET');
  assert.equal(doseFormOf('10 MG TAB'), 'TABLET');
  assert.equal(doseFormOf('10 MG'), null);
  assert.equal(doseFormOf('1 tablet or 1 capsule'), null);
});

// --- The lookup, against a stubbed DailyMed and RxNav ------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Route = (url: string) => { status?: number; json?: unknown; text?: string } | 'offline';

function nlm(route: Route): string[] {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url.replace('https://dailymed.nlm.nih.gov/dailymed/services/v2', '').replace('https://rxnav.nlm.nih.gov/REST', ''));
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

test("a barcode: the product's own label, by its full package code", async () => {
  const asked = nlm((url) => {
    if (url.includes('ndc=13668-757-01')) return listing(['erg', 'ERGOCALCIFEROL CAPSULE [TORRENT]']);
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
  assert.deepEqual(asked, ['/spls.json?ndc=13668-757-01', '/spls/erg.xml']);
});

test("a barcode whose code DailyMed matches to another product: that label is not shown, since it does not list the code", async () => {
  // DailyMed matching by prefix: the terazosin's code brought back an ibuprofen.
  nlm((url) => {
    if (url.includes('ndc=70518-317-00')) return listing(['ibu', 'IBUPROFEN TABLET, FILM COATED [REMEDYREPACK INC.]']);
    if (url.includes('ndc=')) return listing();
    if (url.endsWith('/spls/ibu.xml')) return { text: other('IBUPROFEN', '70518-3170', 'Ibuprofen tablets are indicated for pain.') };
    return { status: 404 };
  });
  assert.deepEqual(await findApprovedUses({ kind: 'product', ndc11: '70518031700', rxcui: '313219' }), {
    status: 'none',
  });
});

test('a barcode whose package DailyMed no longer lists: its RxNorm product, held to its ingredients', async () => {
  const asked = nlm((url) => {
    if (url.includes('ndc=')) return listing();
    if (url.includes('/rxcui/316965/related.json?tty=IN')) {
      return { json: { relatedGroup: { conceptGroup: [{ tty: 'IN', conceptProperties: [{ name: 'ergocalciferol' }] }] } } };
    }
    if (url.includes('spls.json?rxcui=316965')) {
      return listing(['calc', 'CALCIUM AND ERGOCALCIFEROL CAPSULE [X]'], ['erg', 'ERGOCALCIFEROL CAPSULE [OTHER]']);
    }
    if (url.endsWith('/spls/erg.xml')) return { text: ERGOCALCIFEROL };
    return { status: 404 };
  });
  const found = await findApprovedUses({ kind: 'product', ndc11: '13668075701', rxcui: '316965' });
  assert.equal(found.status === 'found' && found.uses.content.label.setId, 'erg');
  // The combination was passed over by its title, without a download.
  assert.ok(!asked.includes('/spls/calc.xml'));
});

test('a name: unrelated labels in the ingredient\'s list are passed over, by title and then by their own ingredients', async () => {
  const asked = nlm((url) => {
    if (url.includes('spls.json?rxcui=6809')) {
      return listing(
        ['omep', 'OMEPRAZOLE TABLET, ORALLY DISINTEGRATING [X]'],
        ['inj', 'METFORMIN SOLUTION [X]'],
        ['combo', 'PIOGLITAZONE AND METFORMIN HYDROCHLORIDE TABLET [X]'],
        ['hidden', 'METFORMIN HYDROCHLORIDE TABLET [MISLABELLED]'],
        ['met', 'METFORMIN HYDROCHLORIDE TABLET, FILM COATED [Y]']
      );
    }
    if (url.endsWith('/spls/hidden.xml')) return { text: other('SITAGLIPTIN', '11111-111', 'Not metformin.') };
    if (url.endsWith('/spls/met.xml')) return { text: METFORMIN };
    return { status: 404 };
  });
  const found = await findApprovedUses({ kind: 'ingredients', rxcui: '6809', ingredients: ['metformin'], form: 'TABLET' });
  assert.equal(found.status, 'found');
  if (found.status !== 'found') return;
  assert.equal(found.uses.content.summary, true);
  assert.equal(found.uses.content.label.setId, 'met');
  assert.deepEqual(asked, ['/spls.json?rxcui=6809&pagesize=100', '/spls/hidden.xml', '/spls/met.xml']);
});

test('only an approved label: one marketed as unapproved has no approved uses to show', async () => {
  nlm((url) => {
    if (url.includes('rxcui=')) return listing(['d', 'ERGOCALCIFEROL CAPSULE [X]']);
    return { text: ERGOCALCIFEROL.replace('displayName="NDA"', 'displayName="unapproved drug other"') };
  });
  const target: UsesTarget = { kind: 'ingredients', rxcui: '4018', ingredients: ['ergocalciferol'], form: 'CAPSULE' };
  assert.deepEqual(await findApprovedUses(target), { status: 'none' });
});

test('DailyMed unreachable is "unavailable", not "none": trying again may work', async () => {
  const target: UsesTarget = { kind: 'ingredients', rxcui: '4018', ingredients: ['ergocalciferol'], form: null };
  nlm(() => 'offline');
  assert.deepEqual(await findApprovedUses(target), { status: 'unavailable' });
  nlm((url) => (url.includes('spls.json') ? listing(['erg', 'ERGOCALCIFEROL CAPSULE [X]']) : 'offline'));
  assert.deepEqual(await findApprovedUses(target), { status: 'unavailable' });
});

test('no label of the form read: "none"', async () => {
  nlm(() => listing(['erg', 'ERGOCALCIFEROL CAPSULE [X]']));
  assert.deepEqual(
    await findApprovedUses({ kind: 'ingredients', rxcui: '4018', ingredients: ['ergocalciferol'], form: 'TABLET' }),
    { status: 'none' }
  );
});

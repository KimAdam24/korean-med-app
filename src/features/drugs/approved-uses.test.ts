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
  doseFormOfReading,
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
  // A softgel is a capsule, a caplet a tablet; and the name may say which.
  assert.equal(doseFormOf('TAKE 1 SOFTGEL BY MOUTH DAILY'), 'CAPSULE');
  assert.equal(doseFormOf('TAKE 2 CAPLETS'), 'TABLET');
  assert.equal(doseFormOf('LISINOPRIL 10MG TAB', '10 MG'), 'TABLET');
  // A Liqui-Gel is a capsule, not a gel.
  assert.equal(doseFormOf('TAKE 2 LIQUI-GELS BY MOUTH'), 'CAPSULE');
  assert.equal(doseFormOf('IBUPROFEN 200MG LIQUID GELS'), 'CAPSULE');
  // "Package insert" is not an insertion.
  assert.equal(doseFormOf('TAKE 1 TABLET DAILY. SEE PACKAGE INSERT'), 'TABLET');
});

test('a medicine not swallowed names no form to choose a label by, though its directions say "tablet"', () => {
  for (const texts of [
    ['TIMOLOL MALEATE', '0.5%', 'INSTILL 1 DROP IN EACH EYE TWICE DAILY'],
    ['TIMOLOL MALEATE 0.5% OPHTHALMIC SOLUTION'],
    ['BUDESONIDE', '180 MCG', 'INHALE 2 PUFFS BY MOUTH TWICE DAILY'],
    ['FENTANYL', '25 MCG/HR', 'APPLY 1 PATCH EVERY 72 HOURS'],
    ['OZEMPIC', '0.25 MG', 'INJECT 0.25 MG SUBCUTANEOUSLY ONCE A WEEK'],
    ['FLUTICASONE PROP', '50 MCG', '2 SPRAYS IN EACH NOSTRIL DAILY'],
    ['ESTRADIOL', '10 MCG', 'INSERT 1 TABLET VAGINALLY TWICE A WEEK'],
    ['KETOCONAZOLE 2% CREAM', 'APPLY TO AFFECTED AREA'],
  ]) {
    assert.equal(doseFormOf(...texts), null, texts.join(' / '));
  }
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

/** DailyMed's prescription and over-the-counter document types, as asked for. */
const RX = 'doctype=34391-3';
const OTC = 'doctype=34390-5';

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
    if (url.includes('spls.json?rxcui=316965') && url.includes(RX)) {
      return listing(['calc', 'CALCIUM AND ERGOCALCIFEROL CAPSULE [X]'], ['erg', 'ERGOCALCIFEROL CAPSULE [OTHER]']);
    }
    // A prescription vitamin D: no over-the-counter label of the product.
    if (url.includes('spls.json?rxcui=316965') && url.includes(OTC)) return listing();
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
  // Read from a pharmacy's label: its prescription labels, and no others once
  // one is found.
  const found = await findApprovedUses({
    kind: 'ingredients',
    rxcui: '6809',
    ingredients: ['metformin'],
    form: 'TABLET',
    labelKind: 'prescription',
  });
  assert.equal(found.status, 'found');
  if (found.status !== 'found') return;
  assert.equal(found.uses.content.summary, true);
  assert.equal(found.uses.content.label.setId, 'met');
  assert.deepEqual(asked, [`/spls.json?rxcui=6809&${RX}&pagesize=100`, '/spls/hidden.xml', '/spls/met.xml']);
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
  const target: UsesTarget = { kind: 'ingredients', rxcui: '4018', ingredients: ['ergocalciferol'], form: 'CAPSULE' };
  nlm(() => 'offline');
  assert.deepEqual(await findApprovedUses(target), { status: 'unavailable' });
  nlm((url) => (url.includes('spls.json') ? listing(['erg', 'ERGOCALCIFEROL CAPSULE [X]']) : 'offline'));
  assert.deepEqual(await findApprovedUses(target), { status: 'unavailable' });
});

test('no label of the form read: "none", and the label of another form is not downloaded', async () => {
  // A label that would be shown, but for its form.
  const asked = nlm((url) =>
    url.endsWith('.xml')
      ? { text: ERGOCALCIFEROL }
      : url.includes(RX)
        ? listing(['erg', 'ERGOCALCIFEROL CAPSULE [X]'])
        : listing()
  );
  assert.deepEqual(
    await findApprovedUses({ kind: 'ingredients', rxcui: '4018', ingredients: ['ergocalciferol'], form: 'TABLET' }),
    { status: 'none' }
  );
  assert.ok(!asked.some((url) => url.endsWith('.xml')), asked.join('\n'));
  // Of the form read, it is.
  const found = await findApprovedUses({ kind: 'ingredients', rxcui: '4018', ingredients: ['ergocalciferol'], form: 'CAPSULE' });
  assert.equal(found.status === 'found' && found.uses.content.label.setId, 'erg');
});

test('by name, a reading that does not say it is a tablet or capsule is refused, and nothing is asked', async () => {
  // Timolol's tablet label, which an eye drop's reading used to be shown.
  const asked = nlm((url) =>
    url.endsWith('.xml')
      ? { text: other('TIMOLOL MALEATE', '0378-0055', 'Timolol maleate tablets are indicated for the treatment of hypertension.') }
      : listing(['tab', 'TIMOLOL MALEATE TABLET [MYLAN]'])
  );
  assert.deepEqual(
    await findApprovedUses({ kind: 'ingredients', rxcui: '10600', ingredients: ['timolol'], form: null }),
    { status: 'formUnknown' }
  );
  assert.deepEqual(asked, []);
});

test("a barcode's RxNorm product is of one form already: its labels are not held to a tablet's or capsule's", async () => {
  // Timolol eye drops, discontinued: DailyMed lists the package no more.
  nlm((url) => {
    if (url.includes('ndc=')) return listing();
    if (url.includes('/rxcui/1923428/related.json?tty=IN')) {
      return { json: { relatedGroup: { conceptGroup: [{ tty: 'IN', conceptProperties: [{ name: 'timolol' }] }] } } };
    }
    if (url.includes('spls.json?rxcui=1923428')) {
      return url.includes(RX) ? listing(['drops', 'TIMOLOL MALEATE SOLUTION/ DROPS [X]']) : listing();
    }
    if (url.endsWith('/spls/drops.xml')) {
      return { text: other('TIMOLOL MALEATE', '11111-222', 'Timolol maleate ophthalmic solution is indicated for elevated intraocular pressure.') };
    }
    return { status: 404 };
  });
  const found = await findApprovedUses({ kind: 'product', ndc11: '00247046605', rxcui: '1923428' });
  assert.equal(found.status === 'found' && found.uses.content.label.setId, 'drops');
});

test('RxNorm\'s "(USP)" is not a word a label must have', async () => {
  assert.equal(sameIngredients([{ substance: 'ESTROGENS, CONJUGATED', moiety: null }], ['estrogens, conjugated (USP)']), true);
  nlm((url) => {
    if (url.includes('spls.json?rxcui=4099')) {
      return url.includes(RX) ? listing(['prem', 'PREMARIN (ESTROGENS, CONJUGATED) TABLET, FILM COATED [WYETH]']) : listing();
    }
    if (url.endsWith('/spls/prem.xml')) {
      return { text: other('ESTROGENS, CONJUGATED', '0046-1100', 'PREMARIN is indicated for the treatment of moderate to severe vasomotor symptoms.') };
    }
    return { status: 404 };
  });
  const found = await findApprovedUses({
    kind: 'ingredients',
    rxcui: '4099',
    ingredients: ['estrogens, conjugated (USP)'],
    form: 'TABLET',
  });
  assert.equal(found.status === 'found' && found.uses.content.label.setId, 'prem');
});

// --- The salt, release and kind printed --------------------------------------

/** A label of one active ingredient, as its own document type says it is. */
const ofType = (type: 'prescription' | 'otc' | null, substance: string, moiety: string, uses: string) => `<document>
  ${type ? `<code code="${type === 'prescription' ? '34391-3' : '34390-5'}" codeSystem="2.16.840.1.113883.6.1"/>` : ''}
  ${active(substance, moiety)}${approval('ANDA')}${ndc('11111-111', '11111-111-11')}
  <component><section><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text><paragraph>${uses}</paragraph></text></section></component>
</document>`;

const SUCCINATE = 'Metoprolol succinate extended-release tablets are indicated for heart failure.';
const TARTRATE = 'Metoprolol tartrate tablets are indicated for myocardial infarction.';

test("a label's own document type, prescription or over-the-counter", () => {
  assert.equal(readIndications(ofType('prescription', 'X', 'X', 'x')).documentType, 'prescription');
  assert.equal(readIndications(ofType('otc', 'X', 'X', 'x')).documentType, 'otc');
  assert.equal(readIndications(ofType(null, 'X', 'X', 'x')).documentType, null);
});

/** Metoprolol's labels, the tartrate's listed first, as DailyMed lists them. */
function metoprolol(xml: Record<string, string> = {}): string[] {
  return nlm((url) => {
    if (url.includes('spls.json?rxcui=6918')) {
      return url.includes(RX)
        ? listing(
            ['tart', 'METOPROLOL TARTRATE TABLET, FILM COATED [X]'],
            ['succ', 'METOPROLOL SUCCINATE TABLET, FILM COATED, EXTENDED RELEASE [Y]']
          )
        : listing();
    }
    if (url.endsWith('/spls/tart.xml')) {
      return { text: xml.tart ?? ofType('prescription', 'METOPROLOL TARTRATE', 'METOPROLOL', TARTRATE) };
    }
    if (url.endsWith('/spls/succ.xml')) {
      return { text: xml.succ ?? ofType('prescription', 'METOPROLOL SUCCINATE', 'METOPROLOL', SUCCINATE) };
    }
    return { status: 404 };
  });
}
const metoprololTarget = (salts: string[], release: 'extended' | 'delayed' | null): UsesTarget => ({
  kind: 'ingredients',
  rxcui: '6918',
  ingredients: ['metoprolol'],
  form: 'TABLET',
  salts,
  release,
  labelKind: 'prescription',
});

test('the salt and release printed: metoprolol succinate ER is shown its own label, not the tartrate listed first', async () => {
  const asked = metoprolol();
  const found = await findApprovedUses(metoprololTarget(['succinate'], 'extended'));
  assert.equal(found.status === 'found' && found.uses.content.text, SUCCINATE);
  // The tartrate, of another release, was passed over by its title.
  assert.ok(!asked.includes('/spls/tart.xml'), asked.join('\n'));

  // "METOPROLOL ER", no salt printed: the release alone keeps the tartrate,
  // released at once and listed first, from being shown.
  metoprolol();
  const extended = await findApprovedUses(metoprololTarget([], 'extended'));
  assert.equal(extended.status === 'found' && extended.uses.content.text, SUCCINATE);
});

test("a salt printed is required of the label's own active ingredient, whatever its title says", async () => {
  // Titled extended-release succinate, but its active ingredient is the tartrate.
  metoprolol({ succ: ofType('prescription', 'METOPROLOL TARTRATE', 'METOPROLOL', TARTRATE) });
  assert.deepEqual(await findApprovedUses(metoprololTarget(['succinate'], 'extended')), { status: 'none' });
  // And the tartrate printed is not shown the succinate.
  metoprolol({ tart: ofType('prescription', 'METOPROLOL SUCCINATE', 'METOPROLOL', SUCCINATE) });
  assert.deepEqual(await findApprovedUses(metoprololTarget(['tartrate'], null)), { status: 'none' });
});

test('no release printed: a label released at once is tried first, but one released otherwise is not refused', async () => {
  const asked = nlm((url) => {
    if (url.includes('spls.json?rxcui=6918')) {
      return url.includes(RX)
        ? listing(
            ['succ', 'METOPROLOL SUCCINATE TABLET, FILM COATED, EXTENDED RELEASE [Y]'],
            ['tart', 'METOPROLOL TARTRATE TABLET, FILM COATED [X]']
          )
        : listing();
    }
    if (url.endsWith('/spls/tart.xml')) return { text: ofType('prescription', 'METOPROLOL TARTRATE', 'METOPROLOL', TARTRATE) };
    if (url.endsWith('/spls/succ.xml')) return { text: ofType('prescription', 'METOPROLOL SUCCINATE', 'METOPROLOL', SUCCINATE) };
    return { status: 404 };
  });
  const found = await findApprovedUses(metoprololTarget([], null));
  assert.equal(found.status === 'found' && found.uses.content.text, TARTRATE);
  assert.ok(!asked.includes('/spls/succ.xml'));

  // Where only the other release has a label, it is shown.
  nlm((url) => {
    if (url.includes('spls.json?rxcui=6918')) {
      return url.includes(RX) ? listing(['succ', 'METOPROLOL SUCCINATE TABLET, FILM COATED, EXTENDED RELEASE [Y]']) : listing();
    }
    if (url.endsWith('/spls/succ.xml')) return { text: ofType('prescription', 'METOPROLOL SUCCINATE', 'METOPROLOL', SUCCINATE) };
    return { status: 404 };
  });
  const only = await findApprovedUses(metoprololTarget([], null));
  assert.equal(only.status === 'found' && only.uses.content.text, SUCCINATE);
});

test('"CONTROLLED-RELEASE" in a title is a release: not tried first for an oxycodone released at once', async () => {
  const CR = 'Oxycodone HCl Controlled-Release Tablets are indicated for moderate to severe pain when a continuous, around-the-clock analgesic is needed for an extended period of time.';
  const IR = 'Oxycodone hydrochloride tablets are indicated for the management of acute pain severe enough to require an opioid analgesic.';
  const label = (uses: string) =>
    product({ substance: 'OXYCODONE HYDROCHLORIDE', moiety: 'OXYCODONE', strengths: [['10', 'mg'], ['20', 'mg']], route: 'ORAL', uses });
  const asked = twoLabels(
    '7804',
    ['OXYCODONE HCL CONTROLLED-RELEASE TABLET OXYCODONE HCL CONTROLLED-RELEASE TABLET [RANBAXY]', label(CR)],
    ['OXYCODONE HYDROCHLORIDE TABLET [X]', label(IR)]
  );
  const found = await findApprovedUses(target('7804', 'oxycodone', { strengths: [{ value: 10, unit: 'mg' }] }));
  assert.equal(found.status === 'found' && found.uses.content.text, IR);
  assert.ok(!asked.includes('/spls/first.xml'), asked.join('\n'));
  // And it is the label for a bottle that says it is extended.
  twoLabels(
    '7804',
    ['OXYCODONE HCL CONTROLLED-RELEASE TABLET [RANBAXY]', label(CR)],
    ['OXYCODONE HYDROCHLORIDE TABLET [X]', label(IR)]
  );
  const extended = await findApprovedUses(target('7804', 'oxycodone', { strengths: [{ value: 10, unit: 'mg' }], release: 'extended' }));
  assert.equal(extended.status === 'found' && extended.uses.content.text, CR);
});

const RX_USES = 'Esomeprazole magnesium delayed-release capsules are indicated for the treatment of GERD and H. pylori.';
const OTC_USES = 'treats frequent heartburn (occurs 2 or more days a week)';

/** Esomeprazole, with a prescription label, an over-the-counter one, or both. */
function esomeprazole(kinds: { rx: boolean; otc: boolean }): string[] {
  return nlm((url) => {
    if (url.includes('spls.json?rxcui=283742')) {
      if (url.includes(RX)) return kinds.rx ? listing(['rx', 'ESOMEPRAZOLE MAGNESIUM CAPSULE, DELAYED RELEASE [X]']) : listing();
      return kinds.otc ? listing(['otc', 'ESOMEPRAZOLE MAGNESIUM CAPSULE, DELAYED RELEASE [CVS]']) : listing();
    }
    if (url.endsWith('/spls/rx.xml')) return { text: ofType('prescription', 'ESOMEPRAZOLE MAGNESIUM', 'ESOMEPRAZOLE', RX_USES) };
    if (url.endsWith('/spls/otc.xml')) return { text: ofType('otc', 'ESOMEPRAZOLE MAGNESIUM', 'ESOMEPRAZOLE', OTC_USES) };
    return { status: 404 };
  });
}
const esomeprazoleTarget = (labelKind: 'prescription' | 'otc' | null): UsesTarget => ({
  kind: 'ingredients',
  rxcui: '283742',
  ingredients: ['esomeprazole'],
  form: 'CAPSULE',
  salts: ['magnesium'],
  release: 'delayed',
  labelKind,
});
const usesOf = (found: Awaited<ReturnType<typeof findApprovedUses>>) =>
  found.status === 'found' ? found.uses.content.text : found.status;

test("a pharmacy's label is shown the prescription label; Drug Facts, the over-the-counter one", async () => {
  esomeprazole({ rx: true, otc: true });
  assert.equal(usesOf(await findApprovedUses(esomeprazoleTarget('prescription'))), RX_USES);
  const asked = esomeprazole({ rx: true, otc: true });
  assert.equal(usesOf(await findApprovedUses(esomeprazoleTarget('otc'))), OTC_USES);
  assert.ok(!asked.some((url) => url.includes(RX)), 'Drug Facts: no prescription label is asked for');
});

test("a pharmacy's label of a medicine with no prescription label: the over-the-counter one, as it was dispensed", async () => {
  esomeprazole({ rx: false, otc: true });
  assert.equal(usesOf(await findApprovedUses(esomeprazoleTarget('prescription'))), OTC_USES);
});

test('neither read: shown where only one kind has a label, and refused where both do', async () => {
  esomeprazole({ rx: true, otc: true });
  assert.deepEqual(await findApprovedUses(esomeprazoleTarget(null)), { status: 'kindUnknown' });
  esomeprazole({ rx: true, otc: false });
  assert.equal(usesOf(await findApprovedUses(esomeprazoleTarget(null))), RX_USES);
  esomeprazole({ rx: false, otc: true });
  assert.equal(usesOf(await findApprovedUses(esomeprazoleTarget(null))), OTC_USES);
});

test('a label DailyMed lists as prescription, but which says it is over-the-counter, is not taken as prescription', async () => {
  nlm((url) => {
    if (url.includes('spls.json?rxcui=283742')) {
      return url.includes(RX) ? listing(['mixed', 'ESOMEPRAZOLE MAGNESIUM CAPSULE, DELAYED RELEASE [X]']) : listing();
    }
    if (url.endsWith('/spls/mixed.xml')) return { text: ofType('otc', 'ESOMEPRAZOLE MAGNESIUM', 'ESOMEPRAZOLE', OTC_USES) };
    return { status: 404 };
  });
  assert.equal(usesOf(await findApprovedUses(esomeprazoleTarget('prescription'))), 'none');
});

// --- Exactly this medicine: ingredient, strength, route, release ------------

test("a label's ingredient must be exactly the medicine's: calcium is not calcium acetate", () => {
  const acetate = [{ substance: 'CALCIUM ACETATE', moiety: 'CALCIUM CATION' }];
  assert.equal(sameIngredients(acetate, ['calcium']), false);
  assert.equal(sameIngredients([{ substance: 'ATORVASTATIN CALCIUM', moiety: null }], ['calcium']), false);
  assert.equal(sameIngredients(acetate, ['calcium acetate']), true);
  // What only carries a medicine, or its water, or a metal it is a salt with.
  assert.equal(sameIngredients([{ substance: 'METFORMIN HYDROCHLORIDE', moiety: null }], ['metformin']), true);
  assert.equal(sameIngredients([{ substance: 'LEVOTHYROXINE SODIUM ANHYDROUS', moiety: null }], ['levothyroxine']), true);
  assert.equal(sameIngredients([{ substance: 'ATORVASTATIN CALCIUM TRIHYDRATE', moiety: 'ATORVASTATIN' }], ['atorvastatin']), true);
});

/** A label of one tablet, with its strengths, route and own words. */
const product = (opts: { substance: string; moiety: string; strengths: [string, string][]; route?: string; uses: string; title?: string }) => `<document>
  <code code="34391-3" codeSystem="2.16.840.1.113883.6.1"/>${approval('ANDA')}
  ${opts.strengths
    .map(
      ([value, unit]) => `<manufacturedProduct><manufacturedMaterial>
    <ingredient classCode="ACTIB"><quantity><numerator unit="${unit}" value="${value}"/><denominator unit="1" value="1"/></quantity>
      <ingredientSubstance><name>${opts.substance}</name><activeMoiety><activeMoiety><name>${opts.moiety}</name></activeMoiety></activeMoiety></ingredientSubstance></ingredient>
  </manufacturedMaterial>${opts.route ? `<consumedIn><substanceAdministration><routeCode displayName="${opts.route}"/></substanceAdministration></consumedIn>` : ''}</manufacturedProduct>`
    )
    .join('')}
  <component><section><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text><paragraph>${opts.uses}</paragraph></text></section></component>
</document>`;

test("a label's strengths and routes, as its products give them", () => {
  const read = readIndications(
    product({ substance: 'LEVOTHYROXINE SODIUM', moiety: 'LEVOTHYROXINE', strengths: [['0.05', 'mg'], ['88', 'ug']], route: 'ORAL', uses: 'x' })
  );
  assert.deepEqual(read.strengths, [{ value: 0.05, unit: 'mg' }, { value: 0.088, unit: 'mg' }]);
  assert.deepEqual(read.routes, ['ORAL']);
});

/** Two labels of one ingredient, the wrong one listed first, as DailyMed lists them. */
function twoLabels(rxcui: string, first: [string, string], second: [string, string]): string[] {
  return nlm((url) => {
    if (url.includes(`spls.json?rxcui=${rxcui}`)) {
      return url.includes(RX) ? listing(['first', first[0]], ['second', second[0]]) : listing();
    }
    if (url.endsWith('/spls/first.xml')) return { text: first[1] };
    if (url.endsWith('/spls/second.xml')) return { text: second[1] };
    return { status: 404 };
  });
}
const target = (rxcui: string, ingredient: string, extra: Partial<Extract<UsesTarget, { kind: 'ingredients' }>>): UsesTarget => ({
  kind: 'ingredients',
  rxcui,
  ingredients: [ingredient],
  form: 'TABLET',
  labelKind: 'prescription',
  ...extra,
});

test('the strength printed: finasteride 5 mg is not shown the 1 mg label, for hair loss', async () => {
  const HAIR = 'Finasteride tablets 1 mg are indicated for male pattern hair loss.';
  const PROSTATE = 'Finasteride tablets 5 mg are indicated for symptomatic benign prostatic hyperplasia.';
  twoLabels(
    '25025',
    ['FINASTERIDE TABLET, FILM COATED [A]', product({ substance: 'FINASTERIDE', moiety: 'FINASTERIDE', strengths: [['1', 'mg']], route: 'ORAL', uses: HAIR })],
    ['FINASTERIDE TABLET, FILM COATED [B]', product({ substance: 'FINASTERIDE', moiety: 'FINASTERIDE', strengths: [['5', 'mg']], route: 'ORAL', uses: PROSTATE })]
  );
  const five = await findApprovedUses(target('25025', 'finasteride', { strengths: [{ value: 5, unit: 'mg' }] }));
  assert.equal(five.status === 'found' && five.uses.content.text, PROSTATE);
  // Printed in micrograms, compared in milligrams.
  const one = await findApprovedUses(target('25025', 'finasteride', { strengths: [{ value: 1, unit: 'mg' }] }));
  assert.equal(one.status === 'found' && one.uses.content.text, HAIR);
  // A strength in a measure the label does not give is no reason to refuse it.
  const meq = await findApprovedUses(target('25025', 'finasteride', { strengths: [{ value: 10, unit: 'meq' }] }));
  assert.equal(meq.status === 'found' && meq.uses.content.text, HAIR);
});

test('a medicine taken by mouth is not shown a tablet put in the vagina', async () => {
  const VAGINAL = 'Estradiol vaginal inserts are indicated for atrophic vaginitis due to menopause.';
  const ORAL = 'Estradiol tablets are indicated for moderate to severe vasomotor symptoms.';
  twoLabels(
    '4083',
    ['YUVAFEM (ESTRADIOL) TABLET [A]', product({ substance: 'ESTRADIOL', moiety: 'ESTRADIOL', strengths: [['10', 'ug']], route: 'VAGINAL', uses: VAGINAL })],
    ['ESTRADIOL TABLET [B]', product({ substance: 'ESTRADIOL', moiety: 'ESTRADIOL', strengths: [['1', 'mg']], route: 'ORAL', uses: ORAL })]
  );
  const found = await findApprovedUses(target('4083', 'estradiol', {}));
  assert.equal(found.status === 'found' && found.uses.content.text, ORAL);
});

test("another product's release marker, in the title or the label's own words, is not taken: bupropion XL is not SR", async () => {
  const SR = 'Bupropion hydrochloride extended-release tablets (SR) are indicated for major depressive disorder.';
  const XL = 'Bupropion hydrochloride extended-release tablets (XL) are indicated for MDD and seasonal affective disorder.';
  // Both given the same strengths, so that only the marker can tell them apart.
  const label = (uses: string) =>
    product({ substance: 'BUPROPION HYDROCHLORIDE', moiety: 'BUPROPION', strengths: [['150', 'mg'], ['200', 'mg']], route: 'ORAL', uses });
  twoLabels(
    '42347',
    ['BUPROPION HYDROCHLORIDE TABLET, FILM COATED, EXTENDED RELEASE [A]', label(SR)],
    ['BUPROPION HYDROCHLORIDE TABLET, FILM COATED, EXTENDED RELEASE [B]', label(XL)]
  );
  const xl = await findApprovedUses(target('42347', 'bupropion', { release: 'extended', releaseToken: 'xl' }));
  assert.equal(xl.status === 'found' && xl.uses.content.text, XL);
  // At 200 mg: SR at 150 mg, with no brand, is refused (told apart only by the brand, below).
  const sr = await findApprovedUses(
    target('42347', 'bupropion', { release: 'extended', releaseToken: 'sr', strengths: [{ value: 200, unit: 'mg' }] })
  );
  assert.equal(sr.status === 'found' && sr.uses.content.text, SR);
});

test('a brand printed: its own label is tried first, REVATIO before the one for erectile dysfunction', async () => {
  const ED = 'Sildenafil tablets are indicated for the treatment of erectile dysfunction.';
  const PAH = 'REVATIO is indicated for the treatment of pulmonary arterial hypertension.';
  const asked = twoLabels(
    '136411',
    ['SILDENAFIL TABLET, FILM COATED [A]', product({ substance: 'SILDENAFIL CITRATE', moiety: 'SILDENAFIL', strengths: [['20', 'mg']], route: 'ORAL', uses: ED })],
    ['REVATIO (SILDENAFIL) TABLET, FILM COATED [VIATRIS]', product({ substance: 'SILDENAFIL CITRATE', moiety: 'SILDENAFIL', strengths: [['20', 'mg']], route: 'ORAL', uses: PAH })]
  );
  const found = await findApprovedUses(target('136411', 'sildenafil', { brand: ['revatio'] }));
  assert.equal(found.status === 'found' && found.uses.content.text, PAH);
  assert.ok(!asked.includes('/spls/first.xml'), asked.join('\n'));
});

test('the form from text not read whole: what it says the medicine is, never what it is not', () => {
  // Cut before "VAGINALLY": no tablet to swallow can be told from it.
  assert.equal(doseFormOfReading(['ESTRADIOL', '10 MCG'], ['INSERT 1 TABLET VAGIN']), null);
  // Cut at the edge, but saying "by mouth": the vial's capsule.
  assert.equal(doseFormOfReading(['VITAMIN D2', '1.25 MG (50,000 UNIT)'], ['Take 1 capsule (b units) by mouth eve days']), 'CAPSULE');
  // Cut, but saying it is not swallowed: refused all the same.
  assert.equal(doseFormOfReading(['TIMOLOL 0.5% TAB'], ['INSTILL 1 DROP IN EACH EY']), null);
});

test("repackagers' labels of other strengths, listed first, are passed over by their packaging, not downloaded", async () => {
  const USES = 'Atorvastatin calcium tablets are indicated to reduce the risk of myocardial infarction.';
  const strengths: Record<string, string> = { a: '10 mg', b: '10 mg', c: '40 mg', d: '40 mg', e: '80 mg', f: '20 mg' };
  const asked = nlm((url) => {
    if (url.includes('spls.json?rxcui=83367')) {
      return url.includes(RX)
        ? listing(...Object.keys(strengths).map((id): [string, string] => [id, `ATORVASTATIN CALCIUM TABLET, FILM COATED [${id}]`]))
        : listing();
    }
    const packaging = /\/spls\/(\w)\/packaging\.json$/.exec(url);
    if (packaging) {
      return { json: { data: { products: [{ active_ingredients: [{ strength: strengths[packaging[1]], name: 'ATORVASTATIN CALCIUM' }] }] } } };
    }
    if (url.endsWith('/spls/f.xml')) {
      return {
        text: product({ substance: 'ATORVASTATIN CALCIUM TRIHYDRATE', moiety: 'ATORVASTATIN', strengths: [['20', 'mg']], route: 'ORAL', uses: USES }),
      };
    }
    return { status: 404 };
  });
  const found = await findApprovedUses(target('83367', 'atorvastatin', { strengths: [{ value: 20, unit: 'mg' }] }));
  assert.equal(found.status === 'found' && found.uses.content.text, USES);
  // Only the label of the strength printed was downloaded.
  assert.deepEqual(asked.filter((url) => url.endsWith('.xml')), ['/spls/f.xml']);
});

// --- Told apart only by the brand -------------------------------------------

const ED = 'CIALIS is indicated for the treatment of erectile dysfunction and benign prostatic hyperplasia.';
const PAH = 'Tadalafil tablets are indicated for the treatment of pulmonary arterial hypertension.';
const ADCIRCA = 'ADCIRCA is indicated for the treatment of pulmonary arterial hypertension.';

/** Tadalafil's labels: a generic for pulmonary hypertension listed first, then the brands. */
function tadalafil(): string[] {
  const label = (uses: string, strengths: [string, string][]) =>
    product({ substance: 'TADALAFIL', moiety: 'TADALAFIL', strengths, route: 'ORAL', uses });
  return nlm((url) => {
    if (url.includes('spls.json?rxcui=358263')) {
      return url.includes(RX)
        ? listing(
            ['generic', 'TADALAFIL TABLET, FILM COATED [X]'],
            ['adcirca', 'ADCIRCA (TADALAFIL) TABLET [LILLY]'],
            ['cialis', 'CIALIS (TADALAFIL) TABLET, FILM COATED [LILLY]']
          )
        : listing();
    }
    if (url.endsWith('/spls/generic.xml')) return { text: label(PAH, [['20', 'mg']]) };
    if (url.endsWith('/spls/adcirca.xml')) return { text: label(ADCIRCA, [['20', 'mg']]) };
    if (url.endsWith('/spls/cialis.xml')) return { text: label(ED, [['2.5', 'mg'], ['5', 'mg'], ['10', 'mg'], ['20', 'mg']]) };
    return { status: 404 };
  });
}
const tadalafilTarget = (strengths: { value: number; unit: 'mg' }[], brand: string[]) =>
  target('358263', 'tadalafil', { strengths, brand });

test('tadalafil 20 mg with no brand printed is refused, and nothing is asked: its generics are for two different things', async () => {
  const asked = tadalafil();
  assert.deepEqual(await findApprovedUses(tadalafilTarget([{ value: 20, unit: 'mg' }], [])), { status: 'productUnknown' });
  // Nor with no strength read: 20 mg is among the strengths it could be.
  assert.deepEqual(await findApprovedUses(tadalafilTarget([], [])), { status: 'productUnknown' });
  assert.deepEqual(asked, []);
});

test("tadalafil with its brand printed is shown that brand's own label, never a generic of the other kind", async () => {
  tadalafil();
  const cialis = await findApprovedUses(tadalafilTarget([{ value: 20, unit: 'mg' }], ['cialis']));
  assert.equal(cialis.status === 'found' && cialis.uses.content.text, ED);
  const adcirca = await findApprovedUses(tadalafilTarget([{ value: 20, unit: 'mg' }], ['adcirca']));
  assert.equal(adcirca.status === 'found' && adcirca.uses.content.text, ADCIRCA);
});

test('tadalafil at a strength only one product has is chosen by its strength, as any other medicine', async () => {
  tadalafil();
  const five = await findApprovedUses(tadalafilTarget([{ value: 5, unit: 'mg' }], []));
  assert.equal(five.status === 'found' && five.uses.content.text, ED);
});

test("tadalafil with its brand printed, where that brand's label is not listed: none, not a generic of either kind", async () => {
  nlm((url) => {
    if (url.includes('spls.json?rxcui=358263')) {
      return url.includes(RX) ? listing(['generic', 'TADALAFIL TABLET, FILM COATED [X]']) : listing();
    }
    if (url.endsWith('/spls/generic.xml')) {
      return { text: product({ substance: 'TADALAFIL', moiety: 'TADALAFIL', strengths: [['20', 'mg']], route: 'ORAL', uses: PAH }) };
    }
    return { status: 404 };
  });
  assert.deepEqual(await findApprovedUses(tadalafilTarget([{ value: 20, unit: 'mg' }], ['cialis'])), { status: 'none' });
});

const SMOKING = 'Bupropion hydrochloride extended-release tablets (SR) are an aminoketone agent indicated as an aid to smoking cessation treatment.';
const DEPRESSION = 'WELLBUTRIN SR is an aminoketone antidepressant indicated for the treatment of major depressive disorder (MDD).';
const SEASONAL = 'Bupropion hydrochloride extended-release tablets (XL) are indicated for MDD and seasonal affective disorder.';
const SR_100 = 'Bupropion hydrochloride extended-release tablets (SR) are indicated for the treatment of major depressive disorder.';

/** Bupropion's extended-release labels: a smoking-cessation generic listed first. */
function bupropion(): string[] {
  const label = (uses: string, strengths: [string, string][]) =>
    product({ substance: 'BUPROPION HYDROCHLORIDE', moiety: 'BUPROPION', strengths, route: 'ORAL', uses });
  return nlm((url) => {
    if (url.includes('spls.json?rxcui=42347')) {
      return url.includes(RX)
        ? listing(
            ['smoking', 'BUPROPION HYDROCHLORIDE SR (BUPROPION HYDROCHLORIDE) TABLET, FILM COATED, EXTENDED RELEASE [A]'],
            ['sr100', 'BUPROPION HYDROCHLORIDE SR (BUPROPION HYDROCHLORIDE) TABLET, FILM COATED, EXTENDED RELEASE [B]'],
            ['xl', 'BUPROPION HYDROCHLORIDE XL (BUPROPION HYDROCHLORIDE) TABLET, EXTENDED RELEASE [C]'],
            // As DailyMed titles it: "EXTENDED RELEASE" nowhere, only "SR".
            ['wellbutrin', 'WELLBUTRIN SR (BUPROPION HYDROCHLORIDE) TABLET, FILM COATED [GLAXOSMITHKLINE LLC]']
          )
        : listing();
    }
    if (url.endsWith('/spls/smoking.xml')) return { text: label(SMOKING, [['150', 'mg']]) };
    if (url.endsWith('/spls/sr100.xml')) return { text: label(SR_100, [['100', 'mg'], ['200', 'mg']]) };
    if (url.endsWith('/spls/xl.xml')) return { text: label(SEASONAL, [['150', 'mg'], ['300', 'mg']]) };
    if (url.endsWith('/spls/wellbutrin.xml')) return { text: label(DEPRESSION, [['100', 'mg'], ['150', 'mg'], ['200', 'mg']]) };
    return { status: 404 };
  });
}
const bupropionTarget = (strengths: { value: number; unit: 'mg' }[], releaseToken: string | null, brand: string[] = []) =>
  target('42347', 'bupropion', { strengths, release: releaseToken ? 'extended' : null, releaseToken, brand });

test('bupropion SR 150 mg with no brand printed is refused: some of its generics are for stopping smoking, titled like the rest', async () => {
  const asked = bupropion();
  assert.deepEqual(await findApprovedUses(bupropionTarget([{ value: 150, unit: 'mg' }], 'sr')), { status: 'productUnknown' });
  // Nor "BUPROPION 150MG" with no release marker, which could be SR.
  assert.deepEqual(await findApprovedUses(bupropionTarget([{ value: 150, unit: 'mg' }], null)), { status: 'productUnknown' });
  assert.deepEqual(asked, []);
});

test('bupropion where no smoking-cessation label can be it: XL, or SR at 100 mg, is chosen as any other medicine', async () => {
  bupropion();
  const xl = await findApprovedUses(bupropionTarget([{ value: 150, unit: 'mg' }], 'xl'));
  assert.equal(xl.status === 'found' && xl.uses.content.text, SEASONAL);
  const sr100 = await findApprovedUses(bupropionTarget([{ value: 100, unit: 'mg' }], 'sr'));
  assert.equal(sr100.status === 'found' && sr100.uses.content.text, SR_100);
});

test("WELLBUTRIN SR 150 mg is shown its own label, not the smoking-cessation generic listed first", async () => {
  bupropion();
  const found = await findApprovedUses(bupropionTarget([{ value: 150, unit: 'mg' }], 'sr', ['wellbutrin']));
  assert.equal(found.status === 'found' && found.uses.content.text, DEPRESSION);
});

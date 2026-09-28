/**
 * What a medicine is approved to treat, end to end through the real screens:
 * from a photo of the vial, from a barcode, and on a saved medicine's page.
 * RxNav and DailyMed are stubbed with answers shaped like theirs (see
 * `src/features/drugs/*.test.ts` for the lookups on their own).
 */
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { APP_LOAD_BUDGET_MS, forgetAppStateListeners, launchApp, loadApp, press } from './app-harness';
import { camera } from './fakes/camera';
import { ocr } from './fakes/devices';
import { disk } from './fakes/file-system';

import { addMedication, loadProfile } from '@/features/medications/medication-store';
import { VITAMIN_D2_VIAL_LINES } from '@/features/ocr/eval/corpus';
import { Strings, fillTemplate } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);

const runtime = globalThis as unknown as { __DEV__: boolean };
let wasDev: boolean;
beforeEach(() => {
  wasDev = runtime.__DEV__;
  runtime.__DEV__ = false;
});
afterEach(() => {
  runtime.__DEV__ = wasDev;
});

/** The Torrent label's Indications and Usage section, as DailyMed has it. */
const INDICATION =
  'Ergocalciferol is indicated for use in the treatment of hypoparathyroidism, refractory rickets, also known as vitamin D resistant rickets, and familial hypophosphatemia.';
const TORRENT = 'ERGOCALCIFEROL CAPSULE [TORRENT PHARMACEUTICALS LIMITED]';
const label = (category = 'NDA') => `<document>
  <subjectOf><approval><id extension="NDA003444"/><code code="C73594" displayName="${category}"/></approval></subjectOf>
  <ingredient classCode="ACTIB"><ingredientSubstance><name>ERGOCALCIFEROL</name></ingredientSubstance></ingredient>
  <component><section><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text><paragraph>${INDICATION}</paragraph></text>
  </section></component>
</document>`;

/**
 * RxNav and DailyMed, answering the lookups for the vitamin D2 vial. Returns
 * every URL asked for, in order.
 */
function nlm({ online = true, category = 'NDA' } = {}): string[] {
  const asked: string[] = [];
  const reply = (body: unknown) =>
    ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }) as Response;
  global.fetch = jest.fn(async (input: string) => {
    const url = decodeURIComponent(String(input));
    asked.push(url);
    if (!online) throw new TypeError('Network request failed');
    if (url.includes('approximateTerm.json?term=vitamin d2')) {
      return reply({ approximateGroup: { candidate: [{ rxcui: '4018', name: 'vitamin D2', rank: '1', source: 'RXNORM' }] } });
    }
    if (url.includes('/rxcui/4018/related.json')) {
      return reply({ relatedGroup: { conceptGroup: [{ tty: 'IN', conceptProperties: [{ rxcui: '4018', name: 'ergocalciferol' }] }] } });
    }
    if (url.includes('ndcstatus.json')) {
      return reply(
        url.includes('ndc=13668075701')
          ? { ndcStatus: { ndc11: '13668075701', status: 'ACTIVE', rxcui: '316965', conceptName: 'ergocalciferol 1.25 MG Oral Capsule' } }
          : { ndcStatus: { status: 'UNKNOWN' } }
      );
    }
    if (url.includes('spls.json?rxcui=4018') || url.includes('spls.json?ndc=13668-757')) {
      return reply({ data: [{ setid: 'torrent', title: TORRENT, spl_version: 3 }] });
    }
    if (url.includes('spls.json')) return reply({ data: [] });
    if (url.endsWith('/spls/torrent.xml')) return reply(label(category));
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as Response;
  }) as unknown as typeof fetch;
  return asked;
}

const PICKED = 'file:///cache/ImagePicker/label.jpg';
async function openPickedPhoto(lines: Parameters<typeof ocr.willRead>[0]) {
  disk.write(PICKED, 'picked-jpeg-bytes');
  ocr.willRead(lines);
  launchApp(`/camera?imageUri=${encodeURIComponent(PICKED)}`);
}

/** Everything the card says around the label's own words. */
function expectTheFrame(): void {
  expect(screen.getByText(Strings.uses.title.ko)).toBeTruthy();
  expect(screen.getByText(Strings.guidance.perFdaLabel.ko)).toBeTruthy();
  expect(screen.getByText(fillTemplate(Strings.uses.fromLabel, { title: TORRENT }).ko)).toBeTruthy();
  expect(screen.getByText(Strings.uses.disclaimer.ko)).toBeTruthy();
}

const MATCH = { rxcui: '4018', ingredients: ['ergocalciferol'], matched: 'vitamin D2' };

describe('what a medicine is approved to treat', () => {
  it('a photo of the vial: identified as ergocalciferol, and its label shown word for word, framed, and saved with the match', async () => {
    const asked = nlm();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);

    await screen.findByText(INDICATION);
    expectTheFrame();
    expect(screen.getByText(fillTemplate(Strings.uses.identifiedAs, { name: 'ergocalciferol' }).ko)).toBeTruthy();
    expect(screen.getByText(Strings.guidance.perRxNorm.ko)).toBeTruthy();
    // Strength and directions as before: the strength shown, the damaged directions withheld.
    expect(screen.getByText('1.25 MG (50,000 UNIT)')).toBeTruthy();
    expect(screen.getByText(Strings.result.damaged.instructions.title.ko)).toBeTruthy();
    // Only the words that name the medicine went to RxNav; the capsule label was chosen.
    expect(asked.filter((url) => url.includes('rxnav'))).toEqual([
      expect.stringContaining('approximateTerm.json?term=vitamin d2&'),
      expect.stringContaining('/rxcui/4018/related.json'),
    ]);

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].nameMatch).toEqual(MATCH);
  });

  it("a saved medicine's page: the same label, by the match it was saved with, without asking RxNav again", async () => {
    const asked = nlm();
    const saved = await addMedication({
      name: 'VITAMIN D2',
      dosage: '1.25 MG (50,000 UNIT)',
      source: 'label-scan',
      needsReview: true,
      nameMatch: MATCH,
    });
    launchApp(`/medication/${saved.id}`);

    await screen.findByText(INDICATION);
    expectTheFrame();
    expect(asked.some((url) => url.includes('rxnav'))).toBe(false);
  });

  it("a barcode: the exact product's own label, by its NDC, and no ingredient lookup at the save", async () => {
    const asked = nlm();
    launchApp('/camera');
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });
    await act(async () => {
      // UPC-A for NDC 13668-757-01, Torrent's ergocalciferol capsules.
      await camera.scan({ type: 'upc_a', data: '313668757019' });
    });

    await screen.findByText('ergocalciferol 1.25 MG Oral Capsule');
    await screen.findByText(INDICATION);
    expectTheFrame();
    // A barcode names the product, not a name to identify.
    expect(screen.queryByText(fillTemplate(Strings.uses.identifiedAs, { name: 'ergocalciferol' }).ko)).toBeNull();
    expect(asked).toContainEqual(expect.stringContaining('spls.json?ndc=13668-757'));

    press(Strings.scan.save.ko);
    await screen.findByText(Strings.scan.saved.ko);
    // Its ingredients fed only hidden features (`Scope`), so they are not asked for.
    expect(asked.some((url) => url.includes('related.json?tty=IN'))).toBe(false);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].identity).toEqual({
      rxcui: '316965',
      ndc11: '13668075701',
    });
  });

  it('a label with no name read: says it could not be identified, and asks nothing', async () => {
    const asked = nlm();
    await openPickedPhoto(['10 MG TABLET', 'Take 1 tablet by mouth twice daily', 'QTY: 60']);
    await screen.findByText(Strings.uses.unidentified.ko);
    expect(asked).toEqual([]);
    expect(screen.queryByText(Strings.uses.disclaimer.ko)).toBeNull();
  });

  it('offline: says the label could not be reached, and finds it on trying again', async () => {
    nlm({ online: false });
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.uses.unavailable.ko);

    nlm();
    press(Strings.uses.retry.ko);
    await screen.findByText(INDICATION);
  });

  it('only an approved label: one marketed without approval shows no uses, and says so', async () => {
    nlm({ category: 'unapproved drug other' });
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.uses.none.ko);
    expect(screen.queryByText(INDICATION)).toBeNull();
  });

  it("editing a medicine's name forgets what the old name was identified as", async () => {
    nlm();
    const saved = await addMedication({ name: 'VITAMIN D2', source: 'label-scan', needsReview: true, nameMatch: MATCH });
    launchApp(`/medication/${saved.id}`);
    await screen.findByText(INDICATION);

    press(Strings.medications.edit.ko);
    fireEvent.changeText(screen.getByDisplayValue('VITAMIN D2'), 'VITAMIN D3');
    press(Strings.medications.save.ko);

    await waitFor(async () => {
      const profile = await loadProfile();
      expect(profile.status === 'ok' && profile.value.medications[0].name).toBe('VITAMIN D3');
    });
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].nameMatch).toBeUndefined();
  });
});

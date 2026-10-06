/**
 * What a medicine is approved to treat, end to end through the real screens:
 * from a photo of the vial, from a barcode, and on a saved medicine's page.
 * RxNav and DailyMed are stubbed with answers shaped like theirs (see
 * `src/features/drugs/*.test.ts` for the lookups on their own).
 */
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';

import { APP_LOAD_BUDGET_MS, forgetAppStateListeners, launchApp, loadApp, press, visibleText } from './app-harness';
import { camera } from './fakes/camera';
import { ocr } from './fakes/devices';
import { disk } from './fakes/file-system';
import { notifications } from './fakes/notifications';
import { textWeight } from './fakes/text-weight';

import { rereadBoldText } from '@/features/accessibility/bold-text';

import * as store from '@/features/medications/medication-store';
import { addMedication, loadProfile } from '@/features/medications/medication-store';
import { VITAMIN_D2_VIAL_LINES } from '@/features/ocr/eval/corpus';
import type { RecognizedTextLine } from '@/features/ocr/types';
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
const label = (category = 'NDA', indications: readonly string[] = [INDICATION]) => `<document>
  <subjectOf><approval><id extension="NDA003444"/><code code="C73594" displayName="${category}"/></approval></subjectOf>
  <ingredient classCode="ACTIB"><ingredientSubstance><name>ERGOCALCIFEROL</name></ingredientSubstance></ingredient>
  <manufacturedProduct><code code="13668-757" codeSystem="2.16.840.1.113883.6.69"/>
    <containerPackagedProduct><code code="13668-757-01" codeSystem="2.16.840.1.113883.6.69"/></containerPackagedProduct>
  </manufacturedProduct>
  <component><section><code code="34067-9"/><title>INDICATIONS AND USAGE</title>
    <text>${indications.map((paragraph) => `<paragraph>${paragraph}</paragraph>`).join('')}</text>
  </section></component>
</document>`;

/**
 * RxNav and DailyMed, answering the lookups for the vitamin D2 vial. Returns
 * every URL asked for, in order.
 */
function nlm({
  online = true,
  category = 'NDA',
  overTheCounterToo = false,
  twoReleases = false,
  indications = [INDICATION] as readonly string[],
} = {}): string[] {
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
    if (url.includes('approximateTerm.json?term=vitamn d2')) {
      // As RxNav does: the right spelling offered for a wrong one.
      return reply({ approximateGroup: { candidate: [{ rxcui: '4018', name: 'vitamin D2', rank: '1', source: 'RXNORM' }] } });
    }
    if (url.includes('approximateTerm.json?term=lisinoprl')) {
      return reply({ approximateGroup: { candidate: [{ rxcui: '29046', name: 'lisinopril', rank: '1', source: 'RXNORM' }] } });
    }
    if (url.includes('approximateTerm.json?term=vitamin d2')) {
      return reply({ approximateGroup: { candidate: [{ rxcui: '4018', name: 'vitamin D2', rank: '1', source: 'RXNORM' }] } });
    }
    if (url.includes('/rxcui/4018/related.json?tty=SCD')) {
      // What RxNorm makes of it: one capsule, released at once; or, where a
      // test needs the release to decide, an extended-release one as well.
      const made = [{ rxcui: '316965', name: 'ergocalciferol 1.25 MG Oral Capsule' }];
      if (twoReleases) made.push({ rxcui: '9', name: 'ergocalciferol 1.25 MG Extended Release Oral Capsule' });
      return reply({ relatedGroup: { conceptGroup: [{ tty: 'SCD', conceptProperties: made }] } });
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
    // A prescription medicine: its labels are listed as prescription ones only,
    // unless the test says it is sold over the counter too.
    if (
      (url.includes('spls.json?rxcui=4018') && (url.includes('doctype=34391-3') || overTheCounterToo)) ||
      url.includes('spls.json?ndc=13668-757-01')
    ) {
      return reply({ data: [{ setid: 'torrent', title: TORRENT, spl_version: 3 }] });
    }
    if (url.includes('spls.json')) return reply({ data: [] });
    if (url.endsWith('/spls/torrent.xml')) return reply(label(category, indications));
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
  expect(screen.getByText(Strings.uses.disclaimer.ko)).toBeTruthy();
  // Whose words, in one line; which label, a tap away, its title once.
  const fromLabel = fillTemplate(Strings.uses.fromLabel, { title: TORRENT });
  expect(screen.queryByText(fromLabel.ko)).toBeNull();
  press(Strings.uses.sourceDetails.ko);
  expect(screen.getByText(fromLabel.ko)).toBeTruthy();
  expect(screen.queryByText(fromLabel.en, { includeHiddenElements: true })).toBeNull();
  press(Strings.uses.sourceDetailsHide.ko);
  expect(screen.queryByText(fromLabel.ko)).toBeNull();
  // In that order: the heading, then the caveat, and only then the label's
  // words, so the caveat is read before the uses, not after them.
  const order = visibleText();
  const heading = order.indexOf(Strings.uses.title.ko);
  const caveat = order.indexOf(Strings.uses.disclaimer.ko);
  const uses = order.indexOf(INDICATION);
  expect(heading).toBeGreaterThanOrEqual(0);
  expect(caveat).toBeGreaterThan(heading);
  expect(uses).toBeGreaterThan(caveat);
}

const MATCH = { rxcui: '4018', ingredients: ['ergocalciferol'], matched: 'vitamin D2' };

/**
 * The vial, with its name line in place of "VITAMIN D2" and running out to
 * the same curved edge as the cut directions, along the text's own slope: a
 * name cut off at the edge, whose text may still look whole.
 */
function nameAtTheEdge(name: string): RecognizedTextLine[] {
  const lines = VITAMIN_D2_VIAL_LINES.map((line) => ({ ...line }));
  const at = lines.findIndex((line) => line.text === 'VITAMIN D2');
  const slopes = lines
    .map((line) => (line.corners![1].y - line.corners![0].y) / (line.corners![1].x - line.corners![0].x))
    .sort((a, b) => a - b);
  const angle = Math.atan(slopes[Math.floor(slopes.length / 2)]);
  const along = (point: { x: number; y: number }) => point.x * Math.cos(angle) + point.y * Math.sin(angle);
  const edge = Math.max(...lines.flatMap((line) => [along(line.corners![1]), along(line.corners![2])]));
  const reach = (y: number) => (edge - y * Math.sin(angle)) / Math.cos(angle);
  const [topLeft, topRight, bottomRight, bottomLeft] = lines[at].corners!;
  lines[at] = {
    ...lines[at],
    text: name,
    corners: [topLeft, { x: reach(topRight.y), y: topRight.y }, { x: reach(bottomRight.y), y: bottomRight.y }, bottomLeft],
    frame: { ...lines[at].frame!, width: reach(topRight.y) - lines[at].frame!.left },
  };
  return lines;
}

describe('what a medicine is approved to treat', () => {
  it('a photo of the vial: identified as ergocalciferol, and its label shown word for word, framed, and saved with the match', async () => {
    const asked = nlm();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);

    await screen.findByText(INDICATION);
    expectTheFrame();
    // The medicine found, always shown: how the user checks it is theirs.
    const identified = fillTemplate(Strings.uses.identifiedAs, { name: 'ergocalciferol' }).ko;
    expect(screen.getByText(identified)).toBeTruthy();
    // Whose match it was, with the details.
    expect(screen.queryByText(Strings.guidance.perRxNorm.ko)).toBeNull();
    press(Strings.uses.sourceDetails.ko);
    expect(screen.getByText(Strings.guidance.perRxNorm.ko)).toBeTruthy();
    press(Strings.uses.sourceDetailsHide.ko);
    // Strength and directions as before: the strength shown, the damaged directions withheld.
    expect(screen.getByText('1.25 MG (50,000 UNIT)')).toBeTruthy();
    expect(screen.getByText(Strings.result.damaged.instructions.title.ko)).toBeTruthy();
    // Only the words that name the medicine went to RxNav, and then which
    // releases it is made in; the capsule label was chosen.
    expect(asked.filter((url) => url.includes('rxnav'))).toEqual([
      expect.stringContaining('approximateTerm.json?term=vitamin d2&'),
      expect.stringContaining('/rxcui/4018/related.json?tty=IN'),
      expect.stringContaining('/rxcui/4018/related.json?tty=SCD'),
    ]);

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    // With the form that chose the capsule label, which the saved fields no
    // longer name (the damaged directions were not saved).
    expect(profile.status === 'ok' && profile.value.medications[0].nameMatch).toEqual({ ...MATCH, form: 'CAPSULE' });
    expect(profile.status === 'ok' && profile.value.medications[0].instructions).toBeUndefined();
    // Read from the label, not typed.
    expect(profile.status === 'ok' && profile.value.medications[0].nameSource).toBe('read');
  });

  it("a saved medicine's page: the same label, by the match it was saved with, without identifying it again", async () => {
    const asked = nlm();
    const saved = await addMedication({
      name: 'VITAMIN D2',
      dosage: '1.25 MG (50,000 UNIT)',
      source: 'label-scan',
      needsReview: true,
      // With the form its reading named, as a reading's match is saved.
      nameMatch: { ...MATCH, form: 'CAPSULE' },
    });
    launchApp(`/medication/${saved.id}`);

    await screen.findByText(INDICATION);
    expectTheFrame();
    // RxNav asked only which releases it is made in, not what the name is.
    expect(asked.filter((url) => url.includes('rxnav'))).toEqual([expect.stringContaining('/rxcui/4018/related.json?tty=SCD')]);
  });

  it('where the release decides and the bottle shows none: the user is asked, a tap, and the answer saved as theirs', async () => {
    const asked = nlm({ twoReleases: true });
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);

    // A quick check in place of the label: the letters, a tap each.
    await screen.findByText(Strings.uses.releaseQuestion.ko);
    expect(screen.queryByText(INDICATION)).toBeNull();
    for (const marker of ['E R', 'X L', 'S R', 'C D', 'X R', 'C R', 'L A']) {
      expect(screen.getByRole('button', { name: marker })).toBeTruthy();
    }
    // Only the extended-release product is made besides: no delayed-release letters.
    expect(screen.queryByRole('button', { name: 'E C' })).toBeNull();
    // Nothing asked of DailyMed before the answer.
    expect(asked.some((url) => url.includes('dailymed'))).toBe(false);

    press(Strings.uses.releaseNone.ko);
    await screen.findByText(INDICATION);
    expectTheFrame();
    // Said as the user's answer, with the way to change it.
    expect(screen.getByText(Strings.uses.releaseAnsweredNone.ko)).toBeTruthy();
    expect(screen.getByRole('button', { name: Strings.uses.releaseChange.ko })).toBeTruthy();

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].releaseMarker).toEqual({ marker: 'none', source: 'typed' });
  });

  it("a saved answer is not asked again on the medicine's page; changed there, it is kept as the new one", async () => {
    nlm({ twoReleases: true });
    const saved = await addMedication({
      name: 'VITAMIN D2',
      dosage: '1.25 MG (50,000 UNIT)',
      source: 'label-scan',
      needsReview: true,
      nameMatch: { ...MATCH, form: 'CAPSULE' },
      releaseMarker: { marker: 'none', source: 'typed' },
    });
    launchApp(`/medication/${saved.id}`);
    await screen.findByText(INDICATION);
    expect(screen.queryByText(Strings.uses.releaseQuestion.ko)).toBeNull();
    expect(screen.getByText(Strings.uses.releaseAnsweredNone.ko)).toBeTruthy();

    // A wrong tap, changed: asked again, and the new answer kept.
    press(Strings.uses.releaseChange.ko);
    await screen.findByText(Strings.uses.releaseQuestion.ko);
    press('E R');
    // Its only label is released at once: none for an extended-release bottle.
    await screen.findByText(Strings.uses.none.ko);
    expect(screen.getByText(fillTemplate(Strings.uses.releaseAnswered, { marker: 'ER' }).ko)).toBeTruthy();
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].releaseMarker).toEqual({ marker: 'er', source: 'typed' });

    // A new name was not the bottle the answer was given of: forgotten.
    press(Strings.medications.edit.ko);
    fireEvent.changeText(screen.getByDisplayValue('VITAMIN D2'), 'VITAMIN D3');
    press(Strings.medications.save.ko);
    await waitFor(async () => {
      const edited = await loadProfile();
      expect(edited.status === 'ok' && edited.value.medications[0].name).toBe('VITAMIN D3');
    });
    const edited = await loadProfile();
    expect(edited.status === 'ok' && edited.value.medications[0].releaseMarker).toBeUndefined();
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
    // By its full package code, not a prefix DailyMed would match to other products.
    expect(asked).toContainEqual(expect.stringContaining('spls.json?ndc=13668-757-01'));

    press(Strings.scan.save.ko);
    await screen.findByText(Strings.scan.saved.ko);
    // Its ingredients fed only hidden features (`Scope`), so they are not asked for.
    expect(asked.some((url) => url.includes('related.json?tty=IN'))).toBe(false);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].identity).toEqual({
      rxcui: '316965',
      ndc11: '13668075701',
    });
    expect(profile.status === 'ok' && profile.value.medications[0].nameSource).toBe('rxnorm');
  });

  it('a label with no name read: says it could not be identified, and asks nothing', async () => {
    const asked = nlm();
    await openPickedPhoto(['10 MG TABLET', 'Take 1 tablet by mouth twice daily', 'QTY: 60']);
    await screen.findByText(Strings.uses.nameNotWhole.ko);
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

  it('a name its reading withheld: shown as possibly cut, not confirmable, not identified, until saved from the edit form', async () => {
    const asked = nlm();
    // Saved from a reading that found the name cut off at the label's edge.
    const saved = await addMedication({
      name: 'VITAMIN D2',
      instructions: 'Take 1 capsule by mouth every 7 days',
      source: 'label-scan',
      needsReview: true,
      nameIncomplete: true,
    });
    launchApp(`/medication/${saved.id}`);

    await screen.findByText(Strings.uses.nameNotWhole.ko);
    expect(asked).toEqual([]);
    // Not shown as whole: the damaged-name warning, and that its end may be missing.
    expect(screen.getByText(Strings.result.damaged.name.title.ko)).toBeTruthy();
    expect(screen.getByText(Strings.result.curved.edgeNote.ko)).toBeTruthy();
    // And "yes, I checked it" is not offered for it: editing is the way on.
    expect(screen.queryByRole('button', { name: Strings.medications.confirm.ko })).toBeNull();

    // In the form, the same warning sits under the name; saving it, even
    // unchanged, is the user's word for it.
    press(Strings.medications.edit.ko);
    expect(screen.getByText(Strings.result.curved.edgeNote.ko)).toBeTruthy();
    press(Strings.medications.save.ko);
    await screen.findByText(INDICATION);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].nameIncomplete).toBeUndefined();
  });

  it('a medicine and its reminders are kept when a saved match is malformed: the match is dropped', async () => {
    nlm();
    const saved = await addMedication({
      name: 'VITAMIN D2',
      instructions: 'Take 1 capsule by mouth every 7 days',
      source: 'label-scan',
      needsReview: false,
      // As a newer or older build might have written it.
      nameMatch: { rxcui: '4018', ingredients: [], matched: 'vitamin D2' },
      reminders: [{ hour: 8, minute: 0 }],
    });
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications.map((m) => [m.id, m.nameMatch, m.reminders])).toEqual([
      [saved.id, undefined, [{ hour: 8, minute: 0 }]],
    ]);
    // Its page identifies the name afresh.
    launchApp(`/medication/${saved.id}`);
    await screen.findByText(INDICATION);
  });

  it('a name cut at the edge is not looked up, and filling in the directions does not make it whole', async () => {
    // "LISINOPRIL" may be all of it, or the start of "LISINOPRIL AND
    // HYDROCHLOROTHIAZIDE": its line runs out at the curve.
    const asked = nlm();
    await openPickedPhoto(nameAtTheEdge('LISINOPRIL'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    expect(screen.getByText(Strings.result.damaged.name.title.ko)).toBeTruthy();
    expect(asked.some((url) => url.includes('approximateTerm'))).toBe(false);

    // The directions, completed from the bottle.
    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);
    fireEvent.changeText(screen.getByDisplayValue('(b'), '(50,000');
    fireEvent.changeText(screen.getByDisplayValue('eve'), 'every 7');
    press(Strings.fillIn.check.ko);
    await screen.findByText(Strings.fillIn.confirmTitle.ko);
    press(Strings.fillIn.confirmYes.ko);
    await screen.findByText(Strings.fillIn.filledNote.ko);

    // The name is as it was: withheld, unidentified, never sent.
    expect(screen.getByText(Strings.result.damaged.name.title.ko)).toBeTruthy();
    expect(screen.getByText(Strings.uses.nameNotWhole.ko)).toBeTruthy();
    expect(asked.some((url) => url.includes('approximateTerm'))).toBe(false);
  });

  it('a reading that does not say tablet or capsule: identified, but no label shown, until its directions say which', async () => {
    // Timolol's eye drops were shown its tablets' uses this way: blood
    // pressure and heart attacks, for a glaucoma medicine.
    const asked = nlm();
    // The vial, without the word "capsule" in its directions.
    await openPickedPhoto(
      VITAMIN_D2_VIAL_LINES.map((line) =>
        line.text === 'Take 1 capsule (b' ? { ...line, text: 'Take 1 (b' } : line
      )
    );
    await screen.findByText(Strings.uses.formUnknown.ko);
    expect(screen.queryByText(INDICATION)).toBeNull();
    expect(asked.some((url) => url.includes('dailymed'))).toBe(false);

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    const saved = profile.status === 'ok' ? profile.value.medications[0] : undefined;
    // Saved with what it was identified as, and that its reading named no form.
    expect(saved?.nameMatch).toEqual({ ...MATCH, form: null });

    launchApp(`/medication/${saved!.id}`);
    await screen.findByText(Strings.uses.formUnknown.ko);
    // The directions, as the user types them from the bottle: they now say.
    press(Strings.medications.edit.ko);
    // Empty: the directions read were cut at the edge, and not saved.
    const directions = screen
      .getAllByLabelText(Strings.medications.fieldInstructions.ko)
      .find((element) => element.props.onChangeText);
    expect(directions?.props.value).toBe('');
    fireEvent.changeText(directions!, 'Take 1 capsule by mouth every 7 days');
    press(Strings.medications.save.ko);
    await screen.findByText(INDICATION);
    expectTheFrame();
    const after = await loadProfile();
    // Still the same match, without asking RxNav again; the form is now theirs.
    expect(after.status === 'ok' && after.value.medications[0].nameMatch).toEqual(MATCH);
  });

  it('a read name that looked damaged, saved unchanged from the edit form, is looked up as given', async () => {
    const asked = nlm();
    const saved = await addMedication({
      name: 'LISINOPRL',
      dosage: '10 MG',
      instructions: 'Take 1 tablet by mouth daily',
      source: 'label-scan',
      needsReview: true,
      nameSource: 'read',
    });
    launchApp(`/medication/${saved.id}`);
    // While it is a reading, a near miss of "lisinopril" is not looked up.
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    expect(asked.some((url) => url.includes('approximateTerm'))).toBe(false);

    // Saved from the form as it stands: the user's word, looked up word for
    // word. It used to stay "not read whole" for good.
    press(Strings.medications.edit.ko);
    press(Strings.medications.save.ko);
    await screen.findByText(Strings.uses.unidentified.ko);
    expect(asked).toContainEqual(expect.stringContaining('approximateTerm.json?term=lisinoprl&'));
  });

  it("editing a medicine's name forgets what the old name was identified as", async () => {
    nlm();
    const saved = await addMedication({
      name: 'VITAMIN D2',
      source: 'label-scan',
      needsReview: true,
      nameMatch: MATCH,
      nameIncomplete: true,
    });
    launchApp(`/medication/${saved.id}`);
    // Withheld as it was read, whatever it was once matched as.
    await screen.findByText(Strings.uses.nameNotWhole.ko);

    press(Strings.medications.edit.ko);
    fireEvent.changeText(screen.getByDisplayValue('VITAMIN D2'), 'VITAMIN D3');
    press(Strings.medications.save.ko);

    await waitFor(async () => {
      const profile = await loadProfile();
      expect(profile.status === 'ok' && profile.value.medications[0].name).toBe('VITAMIN D3');
    });
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].nameMatch).toBeUndefined();
    expect(profile.status === 'ok' && profile.value.medications[0].nameIncomplete).toBeUndefined();
    // The new name is the user's.
    expect(profile.status === 'ok' && profile.value.medications[0].nameSource).toBe('typed');
  });
});

describe("a label's own words, folded only where they are background", () => {
  // The FDA's standard paragraphs for blood pressure medicines, opening as
  // they do, between a use and a limit.
  const USE = 'This medicine is indicated for the treatment of hypertension, to lower blood pressure.';
  const BACKGROUND = [
    'Control of high blood pressure should be part of comprehensive cardiovascular risk management.',
    'Numerous antihypertensive drugs, from a variety of pharmacologic classes and with different mechanisms of action, have been shown to reduce cardiovascular morbidity and mortality.',
    'Elevated systolic or diastolic pressure causes increased cardiovascular risk.',
    'Some antihypertensive drugs have smaller blood pressure effects (as monotherapy) in black patients.',
  ];
  const LIMIT = 'These fixed-dose combinations are not indicated for initial therapy.';

  it('the background folds behind a button where it stood; the use before it and the limit after it are shown', async () => {
    nlm({ indications: [USE, ...BACKGROUND, LIMIT] });
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(USE);
    expect(screen.getByText(LIMIT)).toBeTruthy();
    expect(screen.queryByText(BACKGROUND.join('\n'))).toBeNull();
    // Use, button, limit: in the label's own order.
    const order = visibleText();
    expect(order.indexOf(USE)).toBeLessThan(order.indexOf(Strings.uses.explanationShow.ko));
    expect(order.indexOf(Strings.uses.explanationShow.ko)).toBeLessThan(order.indexOf(LIMIT));

    press(Strings.uses.explanationShow.ko);
    expect(screen.getByText(BACKGROUND.join('\n'))).toBeTruthy();
    press(Strings.uses.explanationHide.ko);
    expect(screen.queryByText(BACKGROUND.join('\n'))).toBeNull();
  });

  it('a label with none of it is shown whole, as it was, with no button', async () => {
    nlm();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(INDICATION);
    expect(screen.queryByRole('button', { name: Strings.uses.explanationShow.ko })).toBeNull();
  });
});

describe("the label's words and Bold text", () => {
  const faceOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).fontFamily;

  it('are drawn at a weight they name, so Bold text thickens them with the rest, measured and drawn alike', async () => {
    nlm();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(INDICATION);
    expect(faceOf(INDICATION)).toBe('Pretendard-Medium');

    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    try {
      textWeight.adjustment = 300;
      rereadBoldText();
      nlm();
      await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
      await screen.findByText(INDICATION);
      const style = StyleSheet.flatten(screen.getByText(INDICATION).props.style);
      expect([style.fontFamily, style.fontWeight]).toEqual(['Pretendard', '800']);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
      textWeight.reset();
      rereadBoldText();
    }
  });
});

describe('looked up once', () => {
  it('leaving the reading for fill-in and coming back does not ask RxNav or DailyMed again', async () => {
    const asked = nlm();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(INDICATION);
    const before = asked.length;
    expect(before).toBeGreaterThan(0);

    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);
    press(Strings.medications.cancel.ko);
    await screen.findByText(INDICATION);
    // The same answer, and not one more request for it: the name not sent again.
    expect(asked.length).toBe(before);
  });

  it('"could not be reached" is not kept: trying again asks again', async () => {
    const offline = nlm({ online: false });
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.uses.unavailable.ko);
    expect(offline.length).toBeGreaterThan(0);
    const online = nlm();
    press(Strings.uses.retry.ko);
    await screen.findByText(INDICATION);
    expect(online.length).toBeGreaterThan(0);
  });
});

describe('prescription or over the counter', () => {
  it("a pharmacy's label is saved as one, and its page asks only for prescription labels", async () => {
    const asked = nlm();
    // The vial's "Generic for: Calciferol,Drisdol" is a pharmacy's line.
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(INDICATION);
    expect(asked.some((url) => url.includes('doctype=34390-5'))).toBe(false);

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    const saved = profile.status === 'ok' ? profile.value.medications[0] : undefined;
    expect(saved?.labelKind).toBe('prescription');

    asked.length = 0;
    launchApp(`/medication/${saved!.id}`);
    await screen.findByText(INDICATION);
    expect(asked.some((url) => url.includes('doctype=34390-5'))).toBe(false);
  });

  it('a medicine sold both ways, read with nothing to say which: neither label is shown', async () => {
    nlm({ overTheCounterToo: true });
    // The vial without its pharmacy's line, in the same place.
    await openPickedPhoto(
      VITAMIN_D2_VIAL_LINES.map((line) =>
        line.text.startsWith('Generic for') ? { ...line, text: 'KEEP OUT OF REACH OF CHILDREN' } : line
      )
    );
    // Without that line to find it by, the name is not read either: the user
    // goes on to the reading anyway, and types it from the bottle.
    await screen.findByText(Strings.result.showReading.ko);
    press(Strings.result.showReading.ko);
    fireEvent.changeText(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), 'VITAMIN D2');
    press(Strings.nameEntry.submit.ko);
    await screen.findByText(Strings.uses.kindUnknown.ko);
    expect(screen.queryByText(INDICATION)).toBeNull();

    // With them, the prescription label.
    nlm({ overTheCounterToo: true });
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(INDICATION);
  });
});

describe('typing the name from the bottle, where the reading could not give it', () => {
  const typeName = (name: string) => {
    fireEvent.changeText(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), name);
    press(Strings.nameEntry.submit.ko);
  };

  it('a name cut at the edge: completed from the bottle, looked up, shown as typed, and saved as typed', async () => {
    const asked = nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    // Prefilled with what was read, so only the end needs typing.
    expect(screen.getByDisplayValue('VITAMIN D')).toBeTruthy();

    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);
    expect(screen.getByText(fillTemplate(Strings.uses.identifiedTypedAs, { name: 'ergocalciferol' }).ko)).toBeTruthy();
    expect(screen.getByText(Strings.nameEntry.typedNote.ko)).toBeTruthy();
    expect(asked).toContainEqual(expect.stringContaining('approximateTerm.json?term=vitamin d2&'));

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    const saved = profile.status === 'ok' ? profile.value.medications[0] : undefined;
    expect(saved?.name).toBe('VITAMIN D2');
    expect(saved?.nameSource).toBe('typed');
    expect(saved?.nameIncomplete).toBeUndefined();
    expect(saved?.nameMatch?.rxcui).toBe('4018');

    // Its page says the name was typed, too.
    launchApp(`/medication/${saved!.id}`);
    await screen.findByText(INDICATION);
    expect(screen.getByText(fillTemplate(Strings.uses.identifiedTypedAs, { name: 'ergocalciferol' }).ko)).toBeTruthy();
  });

  it('a misspelling identifies nothing, though RxNav offers the right one, and says to check each word', async () => {
    nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);

    typeName('VITAMN D2');
    await screen.findByText(Strings.uses.typedUnidentified.ko);
    expect(screen.queryByText(INDICATION)).toBeNull();

    // Corrected, it is found.
    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);
  });

  it('a name with Korean in it sends no request at all, and says to type it in English letters as the bottle shows it', async () => {
    const asked = nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    const before = asked.length;

    // Its English part alone would be asked as "d2": part of a name, as if whole.
    typeName('비타민 D2');
    await screen.findByText(Strings.uses.nameHangul.ko);
    expect(asked.slice(before)).toEqual([]);
    expect(screen.queryByText(INDICATION)).toBeNull();
    // Kept as typed, to be corrected.
    expect(screen.getByDisplayValue('비타민 D2')).toBeTruthy();

    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);
  });

  it('a label with no name read at all: typed in, it can be looked up and added', async () => {
    nlm();
    await openPickedPhoto(['1.25MG(50,000 UNIT)', 'Take 1 capsule by mouth every 7 days', 'QTY: 4']);
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    // Nothing to add yet: a medicine needs a name.
    expect(screen.queryByRole('button', { name: Strings.medications.saveFromLabel.ko })).toBeNull();

    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);
    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && [profile.value.medications[0].name, profile.value.medications[0].nameSource]).toEqual([
      'VITAMIN D2',
      'typed',
    ]);
  });

  it('the name as read is not taken back unchanged: one tap would undo the withholding', async () => {
    const asked = nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);

    // Neither the button nor the keyboard's return accepts it as it was read,
    // in whatever case or spacing.
    const submit = () => screen.getByRole('button', { name: Strings.nameEntry.submit.ko });
    expect(submit()).toBeDisabled();
    fireEvent(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), 'submitEditing');
    fireEvent.changeText(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), ' vitamin  d ');
    expect(submit()).toBeDisabled();
    fireEvent(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), 'submitEditing');
    await act(async () => {});
    expect(screen.getByText(Strings.uses.nameNotWhole.ko)).toBeTruthy();
    expect(asked.some((url) => url.includes('approximateTerm'))).toBe(false);

    // Nor with punctuation added: each is looked up as "vitamin d", the name
    // as read.
    for (const same of ['VITAMIN D.', 'VITAMIN-D', 'Vitamin, D']) {
      fireEvent.changeText(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), same);
      expect(submit()).toBeDisabled();
      fireEvent(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), 'submitEditing');
    }
    await act(async () => {});
    expect(asked.some((url) => url.includes('approximateTerm'))).toBe(false);

    // Korean added is let through, to be told why it is not looked up.
    fireEvent.changeText(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), 'VITAMIN D 비타민');
    expect(submit()).toBeEnabled();

    fireEvent.changeText(screen.getByLabelText(Strings.nameEntry.inputLabel.ko), 'VITAMIN D2');
    expect(submit()).toBeEnabled();
  });

  it('a typed name stays through filling in the directions, and the directions can then be read whole', async () => {
    nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);

    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);
    fireEvent.changeText(screen.getByDisplayValue('(b'), '(50,000');
    fireEvent.changeText(screen.getByDisplayValue('eve'), 'every 7');
    press(Strings.fillIn.check.ko);
    await screen.findByText(Strings.fillIn.confirmTitle.ko);
    press(Strings.fillIn.confirmYes.ko);
    await screen.findByText(Strings.fillIn.filledNote.ko);

    // The box still says what was typed, and the card what it identified.
    expect(screen.getByLabelText(Strings.nameEntry.inputLabel.ko).props.value).toBe('VITAMIN D2');
    await screen.findByText(INDICATION);
    expect(screen.getByText(fillTemplate(Strings.uses.identifiedTypedAs, { name: 'ergocalciferol' }).ko)).toBeTruthy();

    // The directions as filled in are saved: the typed name no longer leaves
    // the edge looking cut beside them.
    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    const saved = profile.status === 'ok' ? profile.value.medications[0] : undefined;
    expect([saved?.name, saved?.nameSource, saved?.nameIncomplete]).toEqual(['VITAMIN D2', 'typed', undefined]);
    expect(saved?.instructions).toContain('every 7 days');
  });

  it('a save that fails goes back to the reading with the typed name still in it', async () => {
    nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);

    jest.spyOn(store, 'addMedication').mockRejectedValueOnce(new Error('Disk full (injected).'));
    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.failure.addNotSaved.ko);
    press(Strings.scan.retry.ko);

    await screen.findByText(INDICATION);
    expect(screen.getByLabelText(Strings.nameEntry.inputLabel.ko).props.value).toBe('VITAMIN D2');
    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && [profile.value.medications[0].name, profile.value.medications[0].nameSource]).toEqual([
      'VITAMIN D2',
      'typed',
    ]);
  });

  it("a typed name that would read as damaged is saved as typed, not as a reading cut short, and its page looks it up", async () => {
    nlm();
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    // A slip the check for misreads would flag, one letter from "lisinopril".
    // Matched word for word, it identifies nothing; but it is the user's word,
    // not a misread, and not a name cut short.
    typeName('LISINOPRL');
    await screen.findByText(Strings.uses.typedUnidentified.ko);

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    const saved = profile.status === 'ok' ? profile.value.medications[0] : undefined;
    expect([saved?.name, saved?.nameSource, saved?.nameIncomplete]).toEqual(['LISINOPRL', 'typed', undefined]);

    launchApp(`/medication/${saved!.id}`);
    await screen.findByText(Strings.uses.typedUnidentified.ko);
    expect(screen.queryByText(Strings.uses.nameNotWhole.ko)).toBeNull();
    expect(screen.queryByText(Strings.result.damaged.name.title.ko)).toBeNull();
  });

  it('a screen reader is told at once that the name was withheld at the edge, and not again when it is typed', async () => {
    nlm();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
    await screen.findByText(Strings.uses.nameNotWhole.ko);
    // The directions are cut too, and come first: either way, said before a
    // clean-sounding name and dose are heard.
    expect(announce).toHaveBeenCalledWith(Strings.result.damaged.instructions.title.ko);
    const told = announce.mock.calls.length;

    typeName('VITAMIN D2');
    await screen.findByText(INDICATION);
    expect(announce.mock.calls.length).toBe(told);
    announce.mockRestore();
  });

  it('a name read whole asks for nothing', async () => {
    nlm();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(INDICATION);
    expect(screen.queryByLabelText(Strings.nameEntry.inputLabel.ko)).toBeNull();
  });
});

describe('the word joiners Korean is drawn with, on Android', () => {
  /** Whatever it is, as text: a request, a record, a notification. In an address it would be percent-encoded. */
  const joined = (value: unknown) => JSON.stringify(value).includes('\u2060') || /%E2%81%A0/i.test(JSON.stringify(value));

  it('reach nothing stored, sent, scheduled or compared: they are drawn, and only drawn', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    try {
      nlm({ twoReleases: true });
      const sent = global.fetch as jest.Mock;

      // A name typed from the bottle, the release asked and answered, the
      // medicine saved: every way a reading becomes a record and a lookup.
      await openPickedPhoto(nameAtTheEdge('VITAMIN D'));
      await screen.findByText(Strings.uses.nameNotWhole.ko);
      // Typed with Korean in it, where a joiner would go if one could: kept in
      // the box as typed (and not looked up: nothing with Korean in it is).
      const input = () => screen.getByLabelText(Strings.nameEntry.inputLabel.ko);
      fireEvent.changeText(input(), '비타민 D2');
      press(Strings.nameEntry.submit.ko);
      await screen.findByText(Strings.uses.nameHangul.ko);
      expect(input().props.value).toBe('비타민 D2');
      fireEvent.changeText(input(), 'VITAMIN D2');
      press(Strings.nameEntry.submit.ko);
      await screen.findByText(Strings.uses.releaseQuestion.ko);
      // The Korean on this screen is drawn with them: the test would mean
      // nothing if it were not.
      expect(joined(screen.toJSON())).toBe(true);
      press(Strings.uses.releaseNone.ko);
      await screen.findByText(INDICATION);
      press(Strings.medications.saveFromLabel.ko);
      await screen.findByText(Strings.scan.saved.ko);

      // Its page: edited, and a reminder set, which schedules a notification
      // with Korean in it.
      const saved = await loadProfile();
      const id = saved.status === 'ok' ? saved.value.medications[0].id : '';
      launchApp(`/medication/${id}`);
      await screen.findByText(INDICATION);
      press(Strings.medications.edit.ko);
      fireEvent.changeText(screen.getByDisplayValue('VITAMIN D2'), 'VITAMIN D2 비타민');
      press(Strings.medications.save.ko);
      await screen.findByText('VITAMIN D2 비타민');
      await screen.findByText(Strings.uses.nameHangul.ko);
      // Saved as typed.
      const edited = await loadProfile();
      expect(edited.status === 'ok' && edited.value.medications[0].name).toBe('VITAMIN D2 비타민');
      notifications.notYetAsked('allow');
      press(Strings.reminders.add.ko);
      press(Strings.reminders.saveTime.ko);
      await screen.findByText(Strings.reminders.askTitle.ko);
      press(Strings.reminders.askContinue.ko);
      await waitFor(() => expect(notifications.scheduledContents().length).toBeGreaterThan(0));

      // Nothing sent (every request's address and anything with it), stored,
      // or scheduled has one.
      expect(sent.mock.calls.length).toBeGreaterThan(0);
      expect(sent.mock.calls.filter((call) => joined(call))).toEqual([]);
      const profile = await loadProfile();
      expect(profile.status).toBe('ok');
      expect(joined(profile)).toBe(false);
      expect(notifications.scheduledContents().filter((content) => joined(content))).toEqual([]);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
    }
  });
});

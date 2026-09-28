/**
 * Korean medicine names and directions (§3.2), through the real screens.
 *
 * The app ships with both sources empty: no 식약처 names imported, no
 * phrase approved. These tests stand in tables to show what happens when
 * they arrive; the Korean in them is made up (성분가, [F2]...), not anyone's
 * translation.
 */
import { screen } from 'expo-router/testing-library';

import { APP_LOAD_BUDGET_MS, forgetAppStateListeners, launchApp, loadApp,
  withFullScope,
} from './app-harness';
import { disk } from './fakes/file-system';
import { ocr } from './fakes/devices';

import { addMedication } from '@/features/medications/medication-store';
import { Strings } from '@/i18n/strings';

const mockSources = {
  phrases: [] as unknown[],
  composition: null as unknown,
  names: [] as unknown[],
};
jest.mock('../src/features/directions/approved-phrases', () => ({
  get APPROVED_PHRASES() {
    return mockSources.phrases;
  },
  get APPROVED_COMPOSITION() {
    return mockSources.composition;
  },
}));
jest.mock('../src/features/drugs/mfds-names', () => ({
  get MFDS_NAMES() {
    return mockSources.names;
  },
  MFDS_SOURCE: { dataset: 'test', retrieved: '2026-10-01', rows: 1 },
}));

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);
beforeEach(() => {
  mockSources.phrases = [];
  mockSources.composition = null;
  mockSources.names = [];
});

const runtime = globalThis as unknown as { __DEV__: boolean };
let wasDev: boolean;
beforeEach(() => {
  wasDev = runtime.__DEV__;
  runtime.__DEV__ = false;
});
afterEach(() => {
  runtime.__DEV__ = wasDev;
});

const reviewed = { on: '2026-10-01', sheet: 'test' };
function approve() {
  mockSources.phrases = [
    { id: 'Q1', en: 'TAKE 1 TABLET', ko: '[Q1]', category: 'action', reviewed },
    { id: 'R1', en: 'BY MOUTH', ko: '', category: 'route', reviewed },
    { id: 'F2', en: 'TWICE DAILY', ko: '[F2]', category: 'frequency', reviewed },
  ];
  mockSources.composition = { afterFrequency: ', ', bareTake: '[take]', end: '.', reviewed };
  mockSources.names = [{ rxcui: '29046', en: 'lisinopril', ko: '성분가', mfdsEn: 'Lisinopril', products: 4 }];
}

const lisinopril = {
  name: 'lisinopril 10 MG Oral Tablet',
  dosage: '10 MG',
  instructions: 'Take 1 tablet by mouth twice daily',
  source: 'label-scan' as const,
  needsReview: false,
  identity: { rxcui: '314076', ndc11: '00000000000', ingredients: ['lisinopril'] },
};

describe("a medicine's page, as the app is now", () => {
  it('shows the Korean directions, but not the Korean ingredient name, which is hidden (Scope)', async () => {
    approve();
    const saved = await addMedication(lisinopril);
    launchApp(`/medication/${saved.id}`);

    await screen.findByText('lisinopril 10 MG Oral Tablet');
    expect(screen.getByText('[F2], [Q1].')).toBeTruthy();
    expect(screen.getByText(Strings.guidance.perReviewedPhrases.ko)).toBeTruthy();
    expect(screen.queryByText('성분가')).toBeNull();
    expect(screen.queryByText(Strings.guidance.perMfds.ko)).toBeNull();
  });
});

describe("a medicine's page", () => {
  // The Korean ingredient name is hidden for now (`Scope`).
  withFullScope();

  it('shows the Korean name and directions under the English, each saying where it came from', async () => {
    approve();
    const saved = await addMedication(lisinopril);
    launchApp(`/medication/${saved.id}`);

    await screen.findByText('lisinopril 10 MG Oral Tablet');
    expect(screen.getByText('성분가')).toBeTruthy();
    expect(screen.getByText(Strings.guidance.perMfds.ko)).toBeTruthy();
    // The English is still there, unchanged: it is what the bottle says.
    expect(screen.getByText('Take 1 tablet by mouth twice daily')).toBeTruthy();
    expect(screen.getByText('[F2], [Q1].')).toBeTruthy();
    expect(screen.getByText(Strings.guidance.perReviewedPhrases.ko)).toBeTruthy();
  });

  it('as shipped, with nothing imported or approved, shows the English alone', async () => {
    const saved = await addMedication(lisinopril);
    launchApp(`/medication/${saved.id}`);

    await screen.findByText('lisinopril 10 MG Oral Tablet');
    expect(screen.queryByText(Strings.guidance.perMfds.ko)).toBeNull();
    expect(screen.queryByText(Strings.guidance.perReviewedPhrases.ko)).toBeNull();
  });

  it('directions with any part not approved stay wholly English', async () => {
    approve();
    const saved = await addMedication({ ...lisinopril, instructions: 'Take 1 tablet by mouth twice daily for 10 days' });
    launchApp(`/medication/${saved.id}`);

    await screen.findByText('Take 1 tablet by mouth twice daily for 10 days');
    expect(screen.queryByText(Strings.guidance.perReviewedPhrases.ko)).toBeNull();
    expect(screen.queryByText('[F2], [Q1].')).toBeNull();
  });

  it('a medicine read off a label, with no RxNorm identity, gets no Korean name', async () => {
    approve();
    const saved = await addMedication({ ...lisinopril, identity: undefined });
    launchApp(`/medication/${saved.id}`);

    await screen.findByText('lisinopril 10 MG Oral Tablet');
    expect(screen.queryByText('성분가')).toBeNull();
    expect(screen.queryByText(Strings.guidance.perMfds.ko)).toBeNull();
  });
});

describe('a label just read', () => {
  it('shows the directions in Korean under the English, when every part is approved', async () => {
    approve();
    const picked = 'file:///cache/ImagePicker/label.jpg';
    disk.write(picked, 'picked-jpeg-bytes');
    ocr.willRead(['LISINOPRIL 10 MG TABLET', 'TAKE 1 TABLET BY MOUTH TWICE DAILY']);
    launchApp(`/camera?imageUri=${encodeURIComponent(picked)}`);

    await screen.findByText('TAKE 1 TABLET BY MOUTH TWICE DAILY');
    expect(screen.getByText('[F2], [Q1].')).toBeTruthy();
    expect(screen.getByText(Strings.guidance.perReviewedPhrases.ko)).toBeTruthy();
  });

  it('shows no Korean over directions withheld as damaged', async () => {
    approve();
    const picked = 'file:///cache/ImagePicker/label.jpg';
    disk.write(picked, 'picked-jpeg-bytes');
    ocr.willRead(['LISINOPRIL 10 MG TABLET', 'TAKE 1 TABLET BY MOUTH EVE DAYS']);
    launchApp(`/camera?imageUri=${encodeURIComponent(picked)}`);

    await screen.findByText(Strings.result.damaged.instructions.title.ko);
    expect(screen.queryByText(Strings.guidance.perReviewedPhrases.ko)).toBeNull();
  });
});

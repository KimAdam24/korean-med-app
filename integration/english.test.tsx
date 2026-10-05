/**
 * English under the Korean: off by default, on for a family member or a
 * pharmacist, from Settings or from the button at the top of the result
 * screen and a medicine's page.
 */
import { fireEvent, screen } from 'expo-router/testing-library';

import {
  APP_LOAD_BUDGET_MS,
  DND_WARNING_SEEN,
  SHOW_ENGLISH,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  withEnglishShown,
} from './app-harness';
import { ocr } from './fakes/devices';
import { disk } from './fakes/file-system';

import { addMedication } from '@/features/medications/medication-store';
import { VITAMIN_D2_VIAL_LINES } from '@/features/ocr/eval/corpus';
import { eraseEverything } from '@/features/security/erase';
import { Strings } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);
beforeEach(() => {
  // Nothing is looked up here: the uses card says it could not reach DailyMed.
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;
});

/** The English line of a string: found even though a screen reader skips it. */
const english = (text: { en: string }) => screen.queryByText(text.en, { includeHiddenElements: true });
const englishSwitches = () => screen.getAllByRole('switch', { name: Strings.settings.showEnglish.ko });

async function medicinePage() {
  const record = await addMedication({ name: 'LISINOPRIL', dosage: '10 MG', source: 'manual', needsReview: false });
  launchApp(`/medication/${record.id}`);
  await screen.findByText('LISINOPRIL');
}

describe('English under the Korean', () => {
  it('is not shown unless asked for: Korean only, but for English still waiting for its Korean, and Korean completed by AI', async () => {
    launchApp('/settings');
    await screen.findByText(Strings.settings.eraseTitle.ko);
    expect(english(Strings.settings.eraseTitle)).toBeNull();
    // A string with no Korean yet is its English, shown once.
    expect(Strings.settings.storageNotice.pendingKo).toBe(true);
    expect(screen.getByText(Strings.settings.storageNotice.en)).toBeTruthy();
    // Korean completed by AI keeps its English beside it until it is reviewed.
    expect(Strings.settings.showEnglish.koBy).toBe('ai');
    expect(english(Strings.settings.showEnglish)).toBeTruthy();
  });

  it('is turned on in Settings, everywhere, and stays on', async () => {
    launchApp('/settings');
    await screen.findByText(Strings.settings.eraseTitle.ko);
    const [toggle] = englishSwitches();
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));

    fireEvent.press(toggle);
    expect(english(Strings.settings.eraseTitle)).toBeTruthy();
    expect(englishSwitches()[0].props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(disk.under(SHOW_ENGLISH)).toEqual([SHOW_ENGLISH]);

    // Another screen, and the next launch.
    launchApp('/');
    await screen.findByText(Strings.home.capture.ko);
    expect(english(Strings.home.capture)).toBeTruthy();

    // And off again.
    launchApp('/settings');
    await screen.findByText(Strings.settings.eraseTitle.ko);
    fireEvent.press(englishSwitches()[0]);
    expect(english(Strings.settings.eraseTitle)).toBeNull();
    expect(disk.under(SHOW_ENGLISH)).toEqual([]);
  });

  it("has its button where a pharmacist is shown the phone: a medicine's page", async () => {
    await medicinePage();
    expect(english(Strings.medications.fieldName)).toBeNull();
    const [button] = englishSwitches();
    // Says "English", in English, for the person it is for; heard in Korean.
    expect(screen.getByText('English')).toBeTruthy();
    fireEvent.press(button);
    expect(english(Strings.medications.fieldName)).toBeTruthy();
    fireEvent.press(englishSwitches()[0]);
    expect(english(Strings.medications.fieldName)).toBeNull();
  });

  it('and the result screen, beside its heading', async () => {
    const picked = 'file:///cache/ImagePicker/label.jpg';
    disk.write(picked, 'picked-jpeg-bytes');
    ocr.willRead(VITAMIN_D2_VIAL_LINES);
    launchApp(`/camera?imageUri=${encodeURIComponent(picked)}`);
    await screen.findByText(Strings.result.title.ko);
    expect(english(Strings.result.title)).toBeNull();
    fireEvent.press(englishSwitches()[0]);
    expect(english(Strings.result.title)).toBeTruthy();
    expect(disk.under(SHOW_ENGLISH)).toEqual([SHOW_ENGLISH]);
  });

  it('goes back to Korean only when everything is erased', async () => {
    withEnglishShown();
    disk.write(DND_WARNING_SEEN, '');
    await eraseEverything();
    expect(disk.under(SHOW_ENGLISH)).toEqual([]);
    expect(disk.under(DND_WARNING_SEEN)).toEqual([]);
  });
});

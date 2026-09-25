/**
 * The app's main journeys, end to end through the real screens: reading a
 * label three ways, keeping the medicine list, and settings.
 *
 * The phone has its own lock, so the app opens with it unattended; these tests
 * start where the user does, on the home screen.
 */
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import {
  APP_LOAD_BUDGET_MS,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
  pressDigits,
} from './app-harness';
import { camera } from './fakes/camera';
import { ocr } from './fakes/devices';
import { disk } from './fakes/file-system';
import { biometrics } from './fakes/local-authentication';

import { VITAMIN_D2_VIAL_LINES, VITAMIN_D2_VIAL_RETAKE_LINES } from '@/features/ocr/eval/corpus';
import { addMedication, loadProfile } from '@/features/medications/medication-store';
import { setPin, verifyPin } from '@/features/security/pin';
import { Strings } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);

/**
 * Release behaviour: no development panels. Also what keeps the raw OCR lines
 * the dev build prints from matching the text these tests look for.
 */
const runtime = globalThis as unknown as { __DEV__: boolean };
let wasDev: boolean;
beforeEach(() => {
  wasDev = runtime.__DEV__;
  runtime.__DEV__ = false;
});
afterEach(() => {
  runtime.__DEV__ = wasDev;
});

const home = () => screen.findByText(Strings.home.capture.ko);
const PICKED = 'file:///cache/ImagePicker/label.jpg';

async function openPickedPhoto(lines: Parameters<typeof ocr.willRead>[0]) {
  disk.write(PICKED, 'picked-jpeg-bytes');
  ocr.willRead(lines);
  launchApp(`/camera?imageUri=${encodeURIComponent(PICKED)}`);
}

describe('reading a chosen photo', () => {
  it('shows the vial as read — name and both strengths, directions withheld — and deletes the copy', async () => {
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);

    await screen.findByText('1.25 MG (50,000 UNIT)');
    expect(screen.getByText('VITAMIN D2')).toBeTruthy();
    // The damaged directions are never shown as the value: their warning is.
    expect(screen.getByText(Strings.result.damaged.instructions.title.ko)).toBeTruthy();
    expect(screen.queryByText('Take 1 capsule (b units) by mouth eve days')).toBeNull();

    expect(ocr.state.calls).toEqual([PICKED]);
    expect(disk.files.has(PICKED)).toBe(false);
  });

  it('saves what was read, leaving out the damaged directions, marked for checking', async () => {
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText('1.25 MG (50,000 UNIT)');

    expect(screen.getByText(Strings.result.notSavedInstructions.ko)).toBeTruthy();
    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);

    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications).toEqual([
      expect.objectContaining({
        name: 'VITAMIN D2',
        dosage: '1.25 MG (50,000 UNIT)',
        needsReview: true,
        source: 'label-scan',
      }),
    ]);
    // Left out, not saved empty: the damaged directions are not the user's.
    expect(profile.status === 'ok' && profile.value.medications[0].instructions).toBeUndefined();
  });

  it('says the label curves round the bottle, instead of blaming the light, and withholds what the curve cut', async () => {
    // The retaken vial: upright and unobstructed, and still cut on the right.
    await openPickedPhoto(VITAMIN_D2_VIAL_RETAKE_LINES);
    await screen.findByText(Strings.result.curved.title.ko);

    expect(screen.getByText(Strings.result.curved.right.ko)).toBeTruthy();
    // Name and strength were not at the edge, and it says so.
    expect(screen.getByText(Strings.result.curved.restWhole.ko)).toBeTruthy();
    expect(screen.getByText('VITAMIN D2')).toBeTruthy();
    expect(screen.getByText('1.25 MG (50,000 UNIT)')).toBeTruthy();
    // Not the advice for a dark or distant photo: more light will not help.
    expect(screen.queryByText(Strings.result.degradedBody.ko)).toBeNull();
    // The directions never reached a field here; their slot says why.
    expect(screen.getByText(Strings.result.curved.fieldNote.ko)).toBeTruthy();
    expect(screen.queryByText(Strings.result.missing.ko)).toBeNull();

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications[0].instructions).toBeUndefined();
  });

  it('asks for a retake when most of the label could not be read', async () => {
    await openPickedPhoto(['xzq wvt', 'mmm nnn', 'qqq rrr', 'zzz yyy', 'ppp ooo']);
    await screen.findByText(Strings.result.degradedTitle.ko);
    expect(screen.getByRole('button', { name: Strings.camera.retake.ko })).toBeTruthy();
  });

  it('reports a copy it could not delete instead of the reading', async () => {
    disk.failDeletes('file:///cache/ImagePicker/');
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.problem.notDiscarded.ko);
    expect(screen.queryByText('1.25 MG (50,000 UNIT)')).toBeNull();
  });
});

describe('reading a label with the camera', () => {
  it('reads what the shutter took, and the photo is gone afterwards', async () => {
    ocr.willRead(['LISINOPRIL 10 MG TABLET', 'TAKE 1 TABLET BY MOUTH EVERY DAY']);
    launchApp('/camera');
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });

    press(Strings.camera.shutter.ko);

    await screen.findByText('LISINOPRIL TABLET');
    expect(screen.getByText('10 MG')).toBeTruthy();
    expect(screen.getByText('TAKE 1 TABLET BY MOUTH EVERY DAY')).toBeTruthy();
    expect(camera.state.shots).toBe(1);
    expect(disk.under('file:///cache/Camera/')).toEqual([]);
  });
});

describe('scanning a barcode', () => {
  it('identifies the package through RxNav and saves it as confirmed', async () => {
    global.fetch = jest.fn(async (url: string) => {
      const answer = url.includes('ndcstatus')
        ? url.includes('ndc=63323024710')
          ? {
              ndcStatus: {
                ndc11: '63323024710',
                status: 'ACTIVE',
                rxcui: '966222',
                conceptName: 'levothyroxine sodium 0.2 MG Injection',
              },
            }
          : { ndcStatus: { status: 'UNKNOWN' } }
        : { relatedGroup: { conceptGroup: [{ tty: 'IN', conceptProperties: [{ name: 'levothyroxine' }] }] } };
      return { ok: true, status: 200, json: async () => answer } as Response;
    }) as unknown as typeof fetch;

    launchApp('/camera');
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });
    await act(async () => {
      await camera.scan({ type: 'upc_a', data: '363323247102' });
    });

    await screen.findByText('levothyroxine sodium 0.2 MG Injection');
    press(Strings.scan.save.ko);
    await screen.findByText(Strings.scan.saved.ko);

    const profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications).toEqual([
      expect.objectContaining({
        name: 'levothyroxine sodium 0.2 MG Injection',
        needsReview: false,
        identity: { rxcui: '966222', ndc11: '63323024710', ingredients: ['levothyroxine'] },
      }),
    ]);
  });
});

describe('the medicine list', () => {
  const lisinopril = {
    name: 'LISINOPRIL TABLET',
    dosage: '10 MG',
    instructions: 'TAKE 1 TABLET BY MOUTH EVERY DAY',
    source: 'label-scan' as const,
    needsReview: true,
  };

  it('counts saved medicines on the home screen', async () => {
    await addMedication(lisinopril);
    await addMedication({ ...lisinopril, name: 'METFORMIN HCL', dosage: '500 MG' });
    launchApp();
    await screen.findByText('등록된 약 2개');
  });

  it('shows what needs checking, and stops once it is confirmed', async () => {
    await addMedication(lisinopril);
    launchApp('/medications');

    const row = await screen.findByRole('button', {
      name: `${lisinopril.name}. ${Strings.medications.unconfirmed.ko}`,
    });
    expect(within(row).getByText(Strings.medications.unconfirmed.ko)).toBeTruthy();

    fireEvent.press(row);
    await screen.findByRole('button', { name: Strings.medications.confirm.ko });
    press(Strings.medications.confirm.ko);

    await waitFor(async () => {
      const profile = await loadProfile();
      expect(profile.status === 'ok' && profile.value.medications[0].needsReview).toBe(false);
    });
    expect(screen.queryByRole('button', { name: Strings.medications.confirm.ko })).toBeNull();
  });

  it('removes a medicine only after asking', async () => {
    const saved = await addMedication({ ...lisinopril, needsReview: false });
    launchApp(`/medication/${saved.id}`);

    await screen.findByRole('button', { name: Strings.medications.remove.ko });
    press(Strings.medications.remove.ko);
    await screen.findByText(Strings.medications.removeConfirmTitle.ko);
    press(Strings.medications.removeConfirmYes.ko);

    await waitFor(async () => {
      const profile = await loadProfile();
      expect(profile.status === 'ok' && profile.value.medications).toEqual([]);
    });
  });
});

describe('settings', () => {
  it('changes the PIN only once the new one has been entered twice alike', async () => {
    biometrics.unsecuredPhone();
    disk.write('file:///document/installed.v1', '');
    await setPin('4821');
    launchApp('/settings');
    await screen.findByText(Strings.pin.enterTitle.ko);
    pressDigits('4821');

    await screen.findByRole('button', { name: Strings.settings.changePin.ko });
    press(Strings.settings.changePin.ko);
    await screen.findByText(Strings.settings.changePinCurrent.ko);
    pressDigits('4821');
    await screen.findByText(Strings.settings.changePinNew.ko);
    pressDigits('1357');
    await screen.findByText(Strings.pin.confirmTitle.ko);
    pressDigits('1358');
    await screen.findByText(Strings.pin.mismatch.ko);

    pressDigits('1357');
    await screen.findByText(Strings.pin.confirmTitle.ko);
    pressDigits('1357');
    await screen.findByText(Strings.settings.changePinDone.ko);

    expect(await verifyPin('1357')).toEqual({ outcome: 'correct' });
  });

  it('erases everything after asking', async () => {
    await addMedication({ name: 'LISINOPRIL', source: 'manual', needsReview: false });
    launchApp('/settings');

    await screen.findByRole('button', { name: Strings.settings.eraseTitle.ko });
    press(Strings.settings.eraseTitle.ko);
    await screen.findByText(Strings.settings.eraseBody.ko);
    press(Strings.settings.eraseConfirm.ko);
    await screen.findByText(Strings.settings.eraseDone.ko);

    expect(await loadProfile()).toEqual({ status: 'empty' });
  });
});

describe('home', () => {
  it('opens on the capture action', async () => {
    launchApp();
    await home();
  });
});

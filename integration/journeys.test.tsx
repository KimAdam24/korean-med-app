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
  withFullScope,
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
    // Only the picker's copy was deleted; her own photo is untouched, and the
    // screen says so rather than "the photo has been deleted".
    expect(screen.getByText(Strings.privacy.pickedPhoto.ko)).toBeTruthy();
    expect(screen.queryByText(Strings.camera.discarded.ko)).toBeNull();
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

  describe('with the curve message, hidden for now (Scope)', () => {
    withFullScope();

    it('says the label curves round the bottle, instead of blaming the light, and withholds what the curve cut', async () => {
      // The retaken vial: upright and unobstructed, and still cut on the right.
      await openPickedPhoto(VITAMIN_D2_VIAL_RETAKE_LINES);
      await screen.findByText(Strings.result.curved.title.ko);

      expect(screen.getByText(Strings.result.curved.right.ko)).toBeTruthy();
      // Name and strength were not at the edge, and it says so.
      expect(screen.getByText(Strings.result.curved.restWhole.ko)).toBeTruthy();
      expect(screen.getByText('VITAMIN D2')).toBeTruthy();
      expect(screen.getByText('1.25 MG (50,000 UNIT)')).toBeTruthy();
      // The directions never reached a field here; their slot says why.
      expect(screen.getByText(Strings.result.curved.fieldNote.ko)).toBeTruthy();
      expect(screen.queryByText(Strings.result.missing.ko)).toBeNull();

      press(Strings.medications.saveFromLabel.ko);
      await screen.findByText(Strings.scan.saved.ko);
      const profile = await loadProfile();
      expect(profile.status === 'ok' && profile.value.medications[0].instructions).toBeUndefined();
    });
  });

  it('a curved label: withholds what the curve cut and says so, with no curve message, sweep or fill-in', async () => {
    // The vial: its directions cut on the right, which with every feature on
    // brings the curve message, the sweep and fill-in (the tests just above,
    // and sweep.test.tsx).
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText('VITAMIN D2');

    expect(screen.getByText('1.25 MG (50,000 UNIT)')).toBeTruthy();
    // The directions are withheld, and their slot says they may be cut.
    expect(screen.getByText(Strings.result.damaged.instructions.title.ko)).toBeTruthy();
    expect(screen.getByText(Strings.result.curved.edgeNote.ko)).toBeTruthy();
    // Hidden: the curve, its remedy, turning the bottle, and filling in.
    expect(screen.queryByText(Strings.result.curved.title.ko)).toBeNull();
    expect(screen.queryByText(Strings.result.curved.fieldNote.ko)).toBeNull();
    expect(screen.queryByRole('button', { name: Strings.sweep.start.ko })).toBeNull();
    expect(screen.queryByRole('button', { name: Strings.fillIn.start.ko })).toBeNull();
  });

  describe('a degraded reading of a label known to curve', () => {
    // The vial, with a near miss for an ingredient added below it: enough to
    // judge the whole reading degraded, while the curve is still diagnosed.
    const last = VITAMIN_D2_VIAL_LINES[VITAMIN_D2_VIAL_LINES.length - 1];
    const DEGRADED_CURVED = [
      ...VITAMIN_D2_VIAL_LINES,
      {
        text: 'Rx Lisinoprll',
        confidence: 0.8,
        frame: { ...last.frame!, top: last.frame!.top + 200 },
        corners: last.corners?.map((point) => ({ x: point.x, y: point.y + 200 })),
      },
    ];

    it('gives no advice at all: not the curve message, and not "try somewhere brighter"', async () => {
      await openPickedPhoto(DEGRADED_CURVED);
      await screen.findByText(Strings.result.degradedTitle.ko);
      expect(screen.queryByText(Strings.result.curved.title.ko)).toBeNull();
      expect(screen.queryByText(Strings.result.degradedBody.ko)).toBeNull();
    });

    describe('with the curve message on (hidden now: see Scope)', () => {
      withFullScope();

      it('says the label curves, in place of "try somewhere brighter"', async () => {
        await openPickedPhoto(DEGRADED_CURVED);
        await screen.findByText(Strings.result.degradedTitle.ko);
        expect(screen.getByText(Strings.result.curved.title.ko)).toBeTruthy();
        expect(screen.queryByText(Strings.result.degradedBody.ko)).toBeNull();
      });
    });
  });

  it('a gallery photo is read even where the camera is refused: it needs no camera', async () => {
    camera.refused();
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText('VITAMIN D2');
    expect(screen.queryByText(Strings.permission.deniedTitle.ko)).toBeNull();
    expect(screen.queryByText(Strings.permission.askTitle.ko)).toBeNull();
  });

  it('without a medicine name, says it cannot be added, and offers no Add button', async () => {
    // A strength and directions; no name line at all.
    await openPickedPhoto(['10 MG TABLET', 'Take 1 tablet by mouth twice daily', 'QTY: 60']);
    await screen.findByText('Take 1 tablet by mouth twice daily');

    expect(screen.getByText(Strings.failure.nameUnreadable.ko)).toBeTruthy();
    expect(screen.queryByRole('button', { name: Strings.medications.saveFromLabel.ko })).toBeNull();
    // Still a way on: another photo.
    expect(screen.getByRole('button', { name: Strings.camera.retake.ko })).toBeTruthy();
  });

  it('asks for a retake when most of the label could not be read', async () => {
    await openPickedPhoto(['xzq wvt', 'mmm nnn', 'qqq rrr', 'zzz yyy', 'ppp ooo']);
    await screen.findByText(Strings.result.degradedTitle.ko);
    // Not a curved label, so the advice for a dark or distant photo is right.
    expect(screen.getByText(Strings.result.degradedBody.ko)).toBeTruthy();
    expect(screen.getByRole('button', { name: Strings.camera.retake.ko })).toBeTruthy();
  });

  it('a link naming a file outside the picker folder reads nothing and deletes nothing', async () => {
    // The address is a route parameter, so any link can set one.
    const vault = 'file:///document/secure/vault.v1.bin';
    disk.write(vault, 'ciphertext');
    ocr.willRead(VITAMIN_D2_VIAL_LINES);
    launchApp(`/camera?imageUri=${encodeURIComponent('file:///cache/ImagePicker/../../document/secure/vault.v1.bin')}`);

    // It opens as the camera, and nothing was read.
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });
    expect(ocr.state.calls).toEqual([]);
    expect(disk.files.has(vault)).toBe(true);
  });

  it('reports a copy it could not delete instead of the reading', async () => {
    disk.failDeletes('file:///cache/ImagePicker/');
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.problem.notDiscarded.ko);
    expect(screen.queryByText('1.25 MG (50,000 UNIT)')).toBeNull();
  });
});

describe('a camera that will not start', () => {
  it('says so, claims no photo, offers one more try, and after a second failure only Close', async () => {
    launchApp('/camera');
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });

    await act(async () => camera.failToStart());
    await screen.findByText(Strings.problem.cameraUnavailable.ko);
    // No photo was taken, so none is said to have been deleted.
    expect(screen.queryByText(Strings.camera.discarded.ko)).toBeNull();
    expect(screen.queryByRole('button', { name: Strings.camera.retake.ko })).toBeNull();

    press(Strings.scan.retry.ko);
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });
    await act(async () => camera.failToStart());
    await screen.findByText(Strings.problem.cameraStillUnavailable.ko);
    expect(screen.queryByRole('button', { name: Strings.scan.retry.ko })).toBeNull();
    expect(screen.queryByRole('button', { name: Strings.camera.retake.ko })).toBeNull();
    expect(screen.getByRole('button', { name: Strings.camera.close.ko })).toBeTruthy();
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

describe('a medicine identified while offline', () => {
  // Its ingredients feed only hidden features (`Scope`).
  withFullScope();

  const offlineRecord = {
    name: 'levothyroxine sodium 0.2 MG Injection',
    source: 'label-scan' as const,
    needsReview: false,
    // Identified by its barcode, but the ingredient lookup failed.
    identity: { rxcui: '966222', ndc11: '63323024710' },
  };

  it('gets its ingredients once it is opened with a connection', async () => {
    const original = global.fetch;
    const lookups: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      lookups.push(url);
      const answer = { relatedGroup: { conceptGroup: [{ tty: 'IN', conceptProperties: [{ name: 'levothyroxine' }] }] } };
      return { ok: true, status: 200, json: async () => answer } as Response;
    }) as unknown as typeof fetch;
    try {
      const saved = await addMedication(offlineRecord);
      launchApp(`/medication/${saved.id}`);
      await screen.findByText(offlineRecord.name);

      await waitFor(async () => {
        const profile = await loadProfile();
        expect(profile.status === 'ok' && profile.value.medications[0].identity?.ingredients).toEqual(['levothyroxine']);
      });
      // RxNav is asked about the product's own code, as at the scan, and
      // nothing else: here for its ingredients, and by the page's approved
      // uses for the same, to check a label against (DailyMed is asked too).
      const rxnav = lookups.filter((url) => url.includes('rxnav'));
      expect(rxnav).toContainEqual(expect.stringContaining('/rxcui/966222/related.json?tty=IN'));
      expect(rxnav.every((url) => url.includes('/rxcui/966222/'))).toBe(true);
    } finally {
      global.fetch = original;
    }
  });

  it('still offline, is left as it was, and the page is unaffected', async () => {
    const original = global.fetch;
    global.fetch = jest.fn(async () => {
      throw new Error('Offline (injected).');
    }) as unknown as typeof fetch;
    try {
      const saved = await addMedication(offlineRecord);
      launchApp(`/medication/${saved.id}`);
      await screen.findByText(offlineRecord.name);
      await act(async () => undefined);

      const profile = await loadProfile();
      expect(profile.status === 'ok' && profile.value.medications[0].identity?.ingredients).toBeUndefined();
      expect(screen.getByText(offlineRecord.name)).toBeTruthy();
    } finally {
      global.fetch = original;
    }
  });
});

describe('scanning a barcode', () => {
  // As it was, ingredient lookup included (`Scope`); the scan as it is now is
  // tested with the approved uses.
  withFullScope();

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

  it('offers the gallery in a release build, beside a privacy line true of it', async () => {
    launchApp();
    await home();
    expect(screen.getByRole('button', { name: Strings.privacy.choosePhoto.ko })).toBeTruthy();
    expect(screen.getByText(Strings.privacy.home.ko)).toBeTruthy();
    // Not the old line, which said every photo is deleted after reading.
    expect(screen.queryByText(Strings.home.privacy.ko)).toBeNull();
  });
});

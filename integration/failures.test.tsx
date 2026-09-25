/**
 * What the user is told when something fails.
 *
 * Every case here used to fail silently — back to the previous step with no
 * message, or on to a message that said something false (usually that the
 * whole medicine list was lost). Each test drives the real screens to the
 * failure and checks what is said, and, where it matters, what is true.
 */
import { act, screen } from 'expo-router/testing-library';

import {
  alreadySetUp,
  APP_LOAD_BUDGET_MS,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
  pressDigits,
} from './app-harness';
import { camera } from './fakes/camera';
import { biometrics } from './fakes/local-authentication';
import { keychain } from './fakes/secure-store';

import * as store from '@/features/medications/medication-store';
import * as lock from '@/features/security/app-lock';
import { setPin, verifyPin } from '@/features/security/pin';
import { Strings } from '@/i18n/strings';

import * as LocalAuthentication from 'expo-local-authentication';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);

const realFetch = global.fetch;
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
});

const F = Strings.failure;
const PIN_ITEM = 'kma.lock.pin.v1';
const settingsMenu = () => screen.findByText(Strings.settings.storageNotice.ko);

async function savedMedicine(overrides: Partial<Parameters<typeof store.addMedication>[0]> = {}) {
  return store.addMedication({ name: 'LISINOPRIL', dosage: '10 MG', source: 'manual', needsReview: false, ...overrides });
}

describe('erasing', () => {
  it('says so when it does not finish — the key may already be gone — and finishes on a second try', async () => {
    await savedMedicine();
    launchApp('/settings');
    await settingsMenu();
    press(Strings.settings.eraseTitle.ko);
    await screen.findByText(Strings.settings.eraseBody.ko);

    // The vault key goes first; the PIN after it. Failing there is the case
    // where the medicines are already unreadable behind an unchanged screen.
    keychain.failNext('delete', PIN_ITEM);
    press(Strings.settings.eraseConfirm.ko);
    await screen.findByText(F.eraseIncompleteTitle.ko);
    expect(screen.getByText(F.eraseIncompleteBody.ko)).toBeTruthy();

    press(Strings.settings.eraseConfirm.ko);
    await screen.findByText(Strings.settings.eraseDone.ko);
    expect((await store.loadProfile()).status).toBe('empty');
  });
});

describe('changing the PIN', () => {
  it('says it was not changed when saving fails, and the old PIN still works', async () => {
    alreadySetUp();
    await setPin('4821');
    launchApp('/settings');
    await settingsMenu();
    press(Strings.settings.changePin.ko);
    await screen.findByText(Strings.settings.changePinCurrent.ko);
    pressDigits('4821');
    await screen.findByText(Strings.settings.changePinNew.ko);
    pressDigits('1357');
    await screen.findByText(Strings.pin.confirmTitle.ko);

    keychain.failNext('set', PIN_ITEM);
    pressDigits('1357');
    await screen.findByText(F.pinNotChanged.ko);

    // What the message promises is true.
    expect((await verifyPin('4821')).outcome).toBe('correct');
    expect((await verifyPin('1357')).outcome).not.toBe('correct');
  });
});

describe('creating a PIN on a phone with no lock', () => {
  it('says the PIN was not saved, instead of silently starting over', async () => {
    biometrics.unsecuredPhone();
    launchApp();
    await screen.findByText(Strings.pin.createTitle.ko);
    pressDigits('4821');
    await screen.findByText(Strings.pin.confirmTitle.ko);

    keychain.failNext('set', PIN_ITEM);
    pressDigits('4821');
    await screen.findByText(F.pinNotSaved.ko);
    expect(screen.getByText(Strings.pin.createTitle.ko)).toBeTruthy();
  });
});

describe('one medicine', () => {
  it('says an edit was not saved, keeping the form', async () => {
    const record = await savedMedicine();
    launchApp(`/medication/${record.id}`);
    await screen.findByText('LISINOPRIL');
    press(Strings.medications.edit.ko);
    await screen.findByRole('button', { name: Strings.medications.save.ko });

    jest.spyOn(store, 'updateMedication').mockRejectedValueOnce(new Error('disk full'));
    press(Strings.medications.save.ko);
    await screen.findByText(F.editNotSaved.ko);
    expect(screen.getByRole('button', { name: Strings.medications.save.ko })).toBeTruthy();
  });

  it('says a confirmation did not take', async () => {
    const record = await savedMedicine({ needsReview: true });
    launchApp(`/medication/${record.id}`);
    await screen.findByRole('button', { name: Strings.medications.confirm.ko });

    jest.spyOn(store, 'confirmMedication').mockRejectedValueOnce(new Error('disk full'));
    press(Strings.medications.confirm.ko);
    await screen.findByText(F.confirmNotSaved.ko);
  });

  it('says a removal did not happen, and the medicine is still there', async () => {
    const record = await savedMedicine();
    launchApp(`/medication/${record.id}`);
    await screen.findByText('LISINOPRIL');
    press(Strings.medications.remove.ko);
    await screen.findByText(Strings.medications.removeConfirmTitle.ko);

    jest.spyOn(store, 'removeMedication').mockRejectedValueOnce(new Error('disk full'));
    press(Strings.medications.removeConfirmYes.ko);
    await screen.findByText(F.removeFailed.ko);
    expect(screen.getByText('LISINOPRIL')).toBeTruthy();
    const profile = await store.loadProfile();
    expect(profile.status === 'ok' && profile.value.medications.length).toBe(1);
  });

  it('says a medicine is no longer on the list, not that the list is lost', async () => {
    await savedMedicine();
    launchApp('/medication/not-a-real-id');
    await screen.findByText(F.medicineGone.ko);
    expect(screen.queryByText(Strings.vault.unrecoverableTitle.ko)).toBeNull();
  });
});

describe('the medicine list', () => {
  it('treats a read that failed as temporary, with a way to try again', async () => {
    await savedMedicine();
    // Every read fails until restored: home, mounted beneath, reads too.
    const read = jest.spyOn(store, 'loadProfile').mockRejectedValue(new Error('keychain busy'));
    launchApp('/medications');

    // After the one designed retry, a second later.
    await screen.findByText(F.listUnavailableTitle.ko, {}, { timeout: 3000 });
    // Not the permanent message, which points at erasing.
    expect(screen.queryByText(Strings.vault.unrecoverableTitle.ko)).toBeNull();

    read.mockRestore();
    press(Strings.scan.retry.ko);
    await screen.findByText('LISINOPRIL');
  });

  it('does not tell someone on the same phone that they changed phones', async () => {
    jest.spyOn(store, 'loadProfile').mockResolvedValue({ status: 'unrecoverable', reason: 'undecryptable' });
    launchApp('/medications');
    await screen.findByText(Strings.vault.unrecoverableTitle.ko);
    expect(screen.getByText(F.listDamagedBody.ko)).toBeTruthy();
    expect(screen.queryByText(Strings.vault.unrecoverableBody.ko)).toBeNull();
  });
});

describe('the lock', () => {
  it('offers a retry when the phone cannot be checked, instead of spinning for good', async () => {
    const probe = jest.spyOn(lock, 'probeLockCapability').mockRejectedValue(new Error('SecureStore unavailable'));
    launchApp();
    // After the designed retries, a second apart.
    await screen.findByText(F.lockCheckFailedTitle.ko, {}, { timeout: 6000 });

    probe.mockRestore();
    press(Strings.scan.retry.ko);
    await screen.findByText(Strings.home.capture.ko);
  });

  it('says phone unlock failed when the prompt itself errors, and lets it be tried again', async () => {
    jest.spyOn(LocalAuthentication, 'authenticateAsync').mockRejectedValueOnce(new Error('MissingActivity'));
    launchApp();
    await screen.findByText(F.deviceUnlockFailed.ko);

    press(Strings.lock.unlock.ko);
    await screen.findByText(Strings.home.capture.ko);
  });
});

describe('scanning a barcode', () => {
  const scanned = async () => {
    launchApp('/camera');
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });
    await act(async () => {
      await camera.scan({ type: 'upc_a', data: '363323247102' });
    });
  };

  it('does not blame the connection when the lookup service is failing', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await scanned();
    await screen.findByText(F.lookupUnavailable.ko);
    expect(screen.queryByText(Strings.scan.offlineBody.ko)).toBeNull();
    // No photo was taken, so none is said to be deleted.
    expect(screen.queryByText(Strings.camera.discarded.ko)).toBeNull();
  });

  it('says a failed save did not happen, and goes back to the medicine to try again', async () => {
    global.fetch = jest.fn(async (url: string) => {
      const answer = url.includes('ndcstatus')
        ? url.includes('ndc=63323024710')
          ? { ndcStatus: { ndc11: '63323024710', status: 'ACTIVE', rxcui: '966222', conceptName: 'levothyroxine sodium 0.2 MG Injection' } }
          : { ndcStatus: { status: 'UNKNOWN' } }
        : { relatedGroup: { conceptGroup: [] } };
      return { ok: true, status: 200, json: async () => answer } as Response;
    }) as unknown as typeof fetch;
    await scanned();
    await screen.findByText(Strings.scan.foundTitle.ko);

    jest.spyOn(store, 'addMedication').mockRejectedValueOnce(new Error('disk full'));
    press(Strings.scan.save.ko);
    await screen.findByText(F.addNotSaved.ko);
    expect(screen.queryByText(Strings.vault.unrecoverableBody.ko)).toBeNull();

    press(Strings.scan.retry.ko);
    await screen.findByText(Strings.scan.foundTitle.ko);
    press(Strings.scan.save.ko);
    await screen.findByText(Strings.scan.saved.ko);
  });
});

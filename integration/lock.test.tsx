/**
 * The lock in front of the app, end to end: first launch, unlocking, lockouts,
 * a forgotten PIN, and relocking when the app is left.
 */
import { act, screen, waitFor } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import {
  alreadySetUp,
  APP_LOAD_BUDGET_MS,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
  pressDigits,
  sendAppTo,
} from './app-harness';
import { picker } from './fakes/devices';
import { biometrics } from './fakes/local-authentication';

import { addMedication, loadProfile } from '@/features/medications/medication-store';
import { setPin } from '@/features/security/pin';
import { Strings } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);

const home = () => screen.findByText(Strings.home.capture.ko);

describe('first launch on a phone with no lock of its own', () => {
  beforeEach(() => biometrics.unsecuredPhone());

  it('asks for a PIN twice, then opens on the home screen', async () => {
    launchApp();
    await screen.findByText(Strings.pin.createTitle.ko);
    pressDigits('4821');
    await screen.findByText(Strings.pin.confirmTitle.ko);
    pressDigits('4821');
    await home();
  });

  it('starts again when the two entries differ', async () => {
    launchApp();
    await screen.findByText(Strings.pin.createTitle.ko);
    pressDigits('4821');
    await screen.findByText(Strings.pin.confirmTitle.ko);
    pressDigits('4822');
    await screen.findByText(Strings.pin.mismatch.ko);
    expect(screen.getByText(Strings.pin.createTitle.ko)).toBeTruthy();
  });
});

describe('unlocking', () => {
  it('opens with the phone lock, unattended, when the phone has one', async () => {
    launchApp();
    await home();
    expect(biometrics.state.prompts).toBe(1);
  });

  it('opens with the PIN on a phone with no lock', async () => {
    biometrics.unsecuredPhone();
    alreadySetUp();
    await setPin('4821');
    launchApp();
    await screen.findByText(Strings.pin.enterTitle.ko);
    pressDigits('4821');
    await home();
  });

  it('makes the owner wait after five wrong PINs, then lets them try again', async () => {
    biometrics.unsecuredPhone();
    alreadySetUp();
    await setPin('4821');
    launchApp();
    await screen.findByText(Strings.pin.enterTitle.ko);

    // Four mistakes are free: each is told it was wrong, and may try again.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      pressDigits('0000');
      await screen.findByText(Strings.pin.incorrect.ko);
      await waitFor(() => expect(screen.getByRole('button', { name: '0' })).toBeEnabled());
    }

    // The fifth starts the wait. The message has its minutes filled in, so it
    // is matched on its fixed opening.
    pressDigits('0000');
    await screen.findByText(/여러 번 틀렸어요/);
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toBeEnabled());
    expect(screen.queryByText(/여러 번 틀렸어요/)).toBeNull();

    pressDigits('4821');
    await home();
  });
});

describe('a forgotten PIN on a phone with no lock', () => {
  it('can be erased from the lock screen, starting again with nothing', async () => {
    biometrics.unsecuredPhone();
    alreadySetUp();
    await setPin('4821');
    await addMedication({ name: 'LISINOPRIL', source: 'manual', needsReview: false });
    launchApp();
    await screen.findByText(Strings.pin.enterTitle.ko);

    press(Strings.settings.forgotPin.ko);
    await screen.findByText(Strings.settings.forgotPinNoDevice.ko);
    press(Strings.settings.eraseTitle.ko);
    await screen.findByText(Strings.settings.eraseBody.ko);
    press(Strings.settings.eraseConfirm.ko);

    await screen.findByText(Strings.pin.createTitle.ko);
    expect(await loadProfile()).toEqual({ status: 'empty' });
  });

  it('is not offered where the phone lock can prove who is holding it', async () => {
    biometrics.nextPrompt({ success: false, error: 'user_cancel' });
    alreadySetUp();
    await setPin('4821');
    launchApp();
    await screen.findByText(Strings.lock.title.ko);
    press(Strings.lock.usePin.ko);
    await screen.findByText(Strings.pin.enterTitle.ko);
    expect(screen.queryByText(Strings.settings.forgotPin.ko)).toBeNull();
  });
});

describe('leaving the app', () => {
  it('locks it', async () => {
    launchApp();
    await home();
    await sendAppTo('background');
    await screen.findByText(Strings.lock.title.ko);
  });

  it('prompts again only once the user is back', async () => {
    launchApp();
    await home();
    await sendAppTo('background');
    await screen.findByText(Strings.lock.title.ko);
    expect(biometrics.state.prompts).toBe(1);

    await sendAppTo('active');
    await home();
    expect(biometrics.state.prompts).toBe(2);
  });

  describe('with the photo picker open', () => {
    const CHOOSE_PHOTO = '사진 고르기 (검토 대기)';
    let restorePlatform: (() => void) | null = null;

    function onPlatform(os: 'ios' | 'android'): void {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
      restorePlatform = () =>
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
    }
    afterEach(() => {
      restorePlatform?.();
      restorePlatform = null;
    });

    async function openPickerAndLeave(): Promise<void> {
      launchApp();
      await home();
      // From here any prompt is cancelled, so a relock stays on screen rather
      // than being unlocked again at once by the fake phone lock.
      biometrics.nextPrompt({ success: false, error: 'user_cancel' });
      picker.holdOpen();
      press(CHOOSE_PHOTO);
      await waitFor(() => expect(picker.isOpen).toBe(true));
      // On Android the picker is another activity: this app goes to the
      // background while the user browses.
      await sendAppTo('background');
    }

    it('on Android, stays unlocked for a quick trip to the gallery', async () => {
      onPlatform('android');
      await openPickerAndLeave();
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      await sendAppTo('active');
      act(() => picker.closeWithoutChoosing());
      await home();
      expect(screen.queryByText(Strings.lock.title.ko)).toBeNull();
      expect(biometrics.state.prompts).toBe(1);
    });

    it('on Android, locks after a long absence with the picker left open', async () => {
      onPlatform('android');
      await openPickerAndLeave();
      await act(async () => {
        jest.advanceTimersByTime(6 * 60_000);
      });
      await sendAppTo('active');
      await screen.findByText(Strings.lock.title.ko);
      expect(biometrics.state.prompts).toBe(2);
    });

    it('on iOS, locks at once — the picker never backgrounds the app there', async () => {
      onPlatform('ios');
      await openPickerAndLeave();
      await screen.findByText(Strings.lock.title.ko);
    });

    it('on Android, recovers from a device prompt that never answered', async () => {
      onPlatform('android');
      biometrics.hangNextPrompt();
      launchApp();
      await screen.findByText(Strings.lock.title.ko);
      expect(biometrics.state.prompts).toBe(1);

      await sendAppTo('background');
      await act(async () => {
        jest.advanceTimersByTime(6 * 60_000);
      });
      await sendAppTo('active');

      // The stuck prompt was abandoned, so the unlock button works again.
      expect(biometrics.state.cancels).toBe(1);
      press(Strings.lock.unlock.ko);
      await home();
    });
  });
});

describe('app-switcher privacy', () => {
  it('is switched on at launch', async () => {
    const screenCapture = require('expo-screen-capture');
    launchApp();
    await home();
    if (Platform.OS === 'ios') {
      expect(screenCapture.enableAppSwitcherProtectionAsync).toHaveBeenCalledWith(1);
    } else {
      expect(screenCapture.preventScreenCaptureAsync).toHaveBeenCalled();
    }
  });
});

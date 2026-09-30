/**
 * The first-launch introduction, end to end: what it explains, the camera
 * question it prepares, and when it is — and is not — shown.
 */
import { act, screen } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';

import {
  alreadySetUp,
  APP_LOAD_BUDGET_MS,
  firstEverLaunch,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
} from './app-harness';
import { camera } from './fakes/camera';
import { disk } from './fakes/file-system';
import { biometrics } from './fakes/local-authentication';
import { ONBOARDED } from './reset';

import { addMedication } from '@/features/medications/medication-store';
import { Strings } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);
beforeEach(firstEverLaunch);

const O = Strings.onboarding;
const home = () => screen.findByText(Strings.home.capture.ko);

async function throughToCamera() {
  await screen.findByText(O.welcomeTitle.ko);
  press(O.next.ko);
  await screen.findByText(O.storageTitle.ko);
  press(O.next.ko);
  await screen.findByText(O.cameraTitle.ko);
}

describe('the first launch', () => {
  it('explains the app and where its data lives, asks for the camera with a reason, then opens', async () => {
    camera.notYetAsked('allow');
    launchApp();

    await screen.findByText(O.welcomeTitle.ko);
    expect(screen.getByText(O.welcomeCheck.ko)).toBeTruthy();
    press(O.next.ko);

    await screen.findByText(O.storageTitle.ko);
    // The expectation users otherwise learn from an empty list on a new phone.
    expect(screen.getByText(O.storageNoBackup.ko)).toBeTruthy();
    // What happens to photos, true of a gallery photo too, and what is sent;
    // not the old lines, which said every photo is deleted and only a barcode
    // number is sent.
    expect(screen.getByText(Strings.privacy.onboardingPhotos.ko)).toBeTruthy();
    expect(screen.getByText(Strings.privacy.lookup.ko)).toBeTruthy();
    expect(screen.queryByText(O.storagePhotos.ko)).toBeNull();
    expect(screen.queryByText(O.storageLookup.ko)).toBeNull();
    press(O.next.ko);

    await screen.findByText(O.cameraBody.ko);
    expect(camera.state.requests).toBe(0);
    press(O.askCamera.ko);

    // The phone has its own lock, which opens unattended; then home.
    await home();
    expect(camera.state.requests).toBe(1);
    expect(camera.state.permission?.granted).toBe(true);
    expect(disk.files.has(ONBOARDED)).toBe(true);
  });

  it('goes on to create a PIN on a phone with no lock of its own', async () => {
    biometrics.unsecuredPhone();
    camera.notYetAsked('allow');
    launchApp();
    await throughToCamera();
    press(O.askCamera.ko);
    await screen.findByText(Strings.pin.createTitle.ko);
  });

  it('carries on when the camera is refused; the camera screen asks again in context', async () => {
    camera.notYetAsked('refuse');
    launchApp();
    await throughToCamera();
    press(O.askCamera.ko);
    await home();
    expect(camera.state.permission?.granted).toBe(false);
  });

  it('lets the camera question wait', async () => {
    camera.notYetAsked('allow');
    launchApp();
    await throughToCamera();
    press(O.notNow.ko);
    await home();
    expect(camera.state.requests).toBe(0);
  });

  it('does not ask for a camera already allowed', async () => {
    launchApp();
    await throughToCamera();
    expect(screen.getByText(O.cameraReady.ko)).toBeTruthy();
    expect(screen.queryByText(O.askCamera.ko)).toBeNull();
    press(O.start.ko);
    await home();
    expect(camera.state.requests).toBe(0);
  });

  it('says how to turn on a camera refused for good, instead of asking in vain', async () => {
    camera.refused();
    launchApp();
    await throughToCamera();
    expect(screen.getByText(O.cameraOff.ko)).toBeTruthy();
    expect(screen.queryByText(O.askCamera.ko)).toBeNull();
    press(O.start.ko);
    await home();
  });

  it('steps back with the Android back button too, and leaves the app only from the first step', async () => {
    const listen = jest.spyOn(BackHandler, 'addEventListener');
    const back = () => {
      // The introduction's latest handler: it is registered again at each step.
      const calls = listen.mock.calls.filter(([event]) => event === 'hardwareBackPress');
      return (calls[calls.length - 1][1] as () => boolean | null | undefined)();
    };
    try {
      launchApp();
      await throughToCamera();
      let handled: boolean | null | undefined;
      await act(async () => {
        handled = back();
      });
      expect(handled).toBe(true);
      await screen.findByText(O.storageTitle.ko);
      await act(async () => {
        back();
      });
      await screen.findByText(O.welcomeTitle.ko);
      // On the first step it is the system's: back leaves the app.
      expect(back()).toBe(false);
    } finally {
      listen.mockRestore();
    }
  });

  it('steps back', async () => {
    launchApp();
    await throughToCamera();
    press(O.back.ko);
    await screen.findByText(O.storageTitle.ko);
    press(O.back.ko);
    await screen.findByText(O.welcomeTitle.ko);
    expect(screen.queryByText(O.back.ko)).toBeNull();
  });
});

describe('the introduction is shown', () => {
  it('once: the next launch goes straight to the app', async () => {
    const first = launchApp();
    await throughToCamera();
    press(O.start.ko);
    await home();
    first.unmount();

    launchApp();
    await home();
    expect(screen.queryByText(O.welcomeTitle.ko)).toBeNull();
  });

  it('again after it was interrupted, even though the app has launched before', async () => {
    // The install marker is written at the start of the first launch; only
    // finishing the introduction writes its own.
    alreadySetUp();
    launchApp();
    await screen.findByText(O.welcomeTitle.ko);
  });

  it('not at all to an installation updated with medicines already saved', async () => {
    alreadySetUp();
    await addMedication({ name: 'LISINOPRIL', source: 'manual', needsReview: false });
    launchApp();
    await home();
    expect(screen.queryByText(O.welcomeTitle.ko)).toBeNull();
  });
});
